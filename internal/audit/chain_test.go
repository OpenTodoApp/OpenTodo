package audit

import (
	"context"
	"database/sql"
	"testing"
	"time"
)

// recordN records n sign-outs with distinct actors and returns the ids in order.
func recordN(t *testing.T, r *Recorder, db *sql.DB, n int) []int64 {
	t.Helper()
	ctx := context.Background()
	for i := 0; i < n; i++ {
		r.Record(WithRequest(ctx, "192.0.2.1", "test-agent"), Logout("u"+string(rune('a'+i%26))))
	}
	rows, err := db.Query("SELECT id FROM audit_events ORDER BY id")
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			t.Fatal(err)
		}
		ids = append(ids, id)
	}
	return ids
}

func verify(t *testing.T, r *Recorder) Verification {
	t.Helper()
	v, err := r.Verify(context.Background())
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	return v
}

func mustExec(t *testing.T, db *sql.DB, q string, args ...any) {
	t.Helper()
	if _, err := db.Exec(q, args...); err != nil {
		t.Fatalf("%s: %v", q, err)
	}
}

func TestChainFreshDatabase(t *testing.T) {
	r, db := newRecorder(t)
	v := verify(t, r)
	if !v.OK || v.Checked != 0 || v.Uncovered != 0 || v.Head != (ChainHead{}) || v.Break != nil {
		t.Fatalf("empty log: %+v", v)
	}
	ids := recordN(t, r, db, 5)
	v = verify(t, r)
	if !v.OK || v.Checked != 5 || v.Head.ID != ids[4] || len(v.Head.Hash) != 64 {
		t.Fatalf("five events: %+v", v)
	}
	head, err := r.Head(context.Background())
	if err != nil || head != v.Head {
		t.Fatalf("Head = %+v, %v; want %+v", head, err, v.Head)
	}
	list, _, err := r.List(context.Background(), Filter{})
	if err != nil || list[0].Hash == nil || *list[0].Hash != head.Hash {
		t.Fatalf("listed newest event's hash is not the head: %v", err)
	}
}

func TestChainTransactionalEvents(t *testing.T) {
	r, db := newRecorder(t)
	recordN(t, r, db, 2)
	thirty := 30
	if _, err := r.UpdateSettings(context.Background(), "o", SettingsPatch{RetentionDays: &thirty}); err != nil {
		t.Fatal(err)
	}
	recordN(t, r, db, 1)
	if v := verify(t, r); !v.OK || v.Checked != 4 {
		t.Fatalf("events recorded in a settings transaction break the chain: %+v", v)
	}
}

func TestChainDetectsAnEditedEvent(t *testing.T) {
	r, db := newRecorder(t)
	ids := recordN(t, r, db, 5)
	mustExec(t, db, "UPDATE audit_events SET outcome = 'failure' WHERE id = ?", ids[2])
	v := verify(t, r)
	if v.OK || v.Break == nil || v.Break.ID != ids[2] || v.Break.Reason != "mismatch" || v.Checked != 2 {
		t.Fatalf("edited middle event: %+v", v)
	}
	// Editing the details text (an allow-listed value) is caught the same way.
	mustExec(t, db, "UPDATE audit_events SET outcome = 'success' WHERE id = ?", ids[2])
	mustExec(t, db, `UPDATE audit_events SET details = '{"reason":"x"}' WHERE id = ?`, ids[3])
	if v := verify(t, r); v.OK || v.Break.ID != ids[3] {
		t.Fatalf("edited details: %+v", v)
	}
}

func TestChainDetectsADeletedEvent(t *testing.T) {
	r, db := newRecorder(t)
	ids := recordN(t, r, db, 5)
	mustExec(t, db, "DELETE FROM audit_events WHERE id = ?", ids[1])
	v := verify(t, r)
	if v.OK || v.Break == nil || v.Break.ID != ids[2] || v.Break.Reason != "mismatch" {
		t.Fatalf("deleted middle event: %+v", v)
	}
	// Removing the first event after the checkpoint is caught too.
	r2, db2 := newRecorder(t)
	ids2 := recordN(t, r2, db2, 3)
	mustExec(t, db2, "DELETE FROM audit_events WHERE id = ?", ids2[0])
	if v := verify(t, r2); v.OK || v.Break.ID != ids2[1] {
		t.Fatalf("deleted first event: %+v", v)
	}
}

func TestChainDetectsReordering(t *testing.T) {
	r, db := newRecorder(t)
	ids := recordN(t, r, db, 5)
	// Swap the ids of two events (the order of the log).
	mustExec(t, db, "UPDATE audit_events SET id = -1 WHERE id = ?", ids[1])
	mustExec(t, db, "UPDATE audit_events SET id = ? WHERE id = ?", ids[1], ids[3])
	mustExec(t, db, "UPDATE audit_events SET id = ? WHERE id = -1", ids[3])
	v := verify(t, r)
	if v.OK || v.Break == nil || v.Break.ID != ids[1] {
		t.Fatalf("reordered events: %+v", v)
	}
}

func TestChainDetectsAMissingHash(t *testing.T) {
	r, db := newRecorder(t)
	ids := recordN(t, r, db, 3)
	mustExec(t, db, "UPDATE audit_events SET hash = NULL WHERE id = ?", ids[1])
	if v := verify(t, r); v.OK || v.Break.ID != ids[1] || v.Break.Reason != "missing_hash" {
		t.Fatalf("missing hash: %+v", v)
	}
}

func TestChainIgnoresAddressScrubbing(t *testing.T) {
	r, db := newRecorder(t)
	ctx := context.Background()
	on, off := true, false
	if _, err := r.UpdateSettings(ctx, "o", SettingsPatch{LogIP: &on}); err != nil {
		t.Fatal(err)
	}
	recordN(t, r, db, 3)
	if count(t, db, "ip IS NOT NULL") == 0 {
		t.Fatal("addresses were not stored")
	}
	if _, err := r.UpdateSettings(ctx, "o", SettingsPatch{LogIP: &off}); err != nil {
		t.Fatal(err)
	}
	if v := verify(t, r); !v.OK || v.Checked != 5 {
		t.Fatalf("scrubbing addresses broke the chain: %+v", v)
	}
}

func TestChainSurvivesPruning(t *testing.T) {
	r, db := newRecorder(t)
	ctx := context.Background()
	start := time.Now()
	day := 24 * time.Hour
	r.now = func() time.Time { return start.Add(-200 * day) }
	old := recordN(t, r, db, pruneBatch+3) // more than one batch
	r.now = func() time.Time { return start.Add(-day) }
	recordN(t, r, db, 4)
	r.now = func() time.Time { return start }

	n, err := r.Prune(ctx)
	if err != nil || n != pruneBatch+3 {
		t.Fatalf("pruned %d (%v)", n, err)
	}
	v := verify(t, r)
	if !v.OK || v.Checked != 4 || v.Checkpoint.ID != old[len(old)-1] || v.Uncovered != 0 {
		t.Fatalf("after pruning: %+v", v)
	}
	// Recording after pruning chains from the kept events.
	recordN(t, r, db, 1)
	if v := verify(t, r); !v.OK || v.Checked != 5 {
		t.Fatalf("after pruning and recording: %+v", v)
	}
	// Pruning everything leaves the checkpoint at the last event; the next one
	// chains from it.
	r.now = func() time.Time { return start.Add(400 * day) }
	if _, err := r.Prune(ctx); err != nil || count(t, db, "1=1") != 0 {
		t.Fatalf("prune all: %v", err)
	}
	recordN(t, r, db, 2)
	if v := verify(t, r); !v.OK || v.Checked != 2 {
		t.Fatalf("after pruning everything: %+v", v)
	}
	// Tampering after pruning is still caught.
	mustExec(t, db, "UPDATE audit_events SET actor_id = 'someone-else' WHERE id = (SELECT MIN(id) FROM audit_events)")
	if v := verify(t, r); v.OK {
		t.Fatalf("edit after pruning not caught: %+v", v)
	}
}

// TestPruneKeepsTheChainContiguous: an old event behind a newer one (the clock
// went back) waits for the events before it, so the log is never cut in the
// middle of the chain.
func TestPruneKeepsTheChainContiguous(t *testing.T) {
	r, db := newRecorder(t)
	start := time.Now()
	day := 24 * time.Hour
	r.now = func() time.Time { return start.Add(-200 * day) }
	recordN(t, r, db, 2)
	r.now = func() time.Time { return start }
	recordN(t, r, db, 1)
	r.now = func() time.Time { return start.Add(-200 * day) }
	recordN(t, r, db, 1)
	r.now = func() time.Time { return start }
	if n, err := r.Prune(context.Background()); err != nil || n != 2 {
		t.Fatalf("pruned %d (%v), want the first two", n, err)
	}
	if v := verify(t, r); !v.OK || v.Checked != 2 {
		t.Fatalf("after pruning: %+v", v)
	}
	at, ok, err := r.NextPrune(context.Background())
	if err != nil || !ok || !at.Equal(time.UnixMilli(start.UnixMilli()).Add(90*day)) {
		t.Fatalf("next prune %v %v %v: the first kept event decides", at, ok, err)
	}
}

// TestChainStartsAtTheTail: events recorded before the chain existed (no hash)
// are not covered and do not fail verification; the chain starts after them.
func TestChainStartsAtTheTail(t *testing.T) {
	r, db := newRecorder(t)
	for i := 0; i < 3; i++ {
		mustExec(t, db, "INSERT INTO audit_events(ts,name,outcome) VALUES(1, 'logout', 'success')")
	}
	// What migration 0060 does on a database with events.
	mustExec(t, db, "UPDATE audit_chain SET after_id = (SELECT MAX(id) FROM audit_events), hash = ''")
	recordN(t, r, db, 2)
	v := verify(t, r)
	if !v.OK || v.Checked != 2 || v.Uncovered != 3 || v.Checkpoint.ID != 3 {
		t.Fatalf("legacy events: %+v", v)
	}
	list, _, _ := r.List(context.Background(), Filter{})
	if list[len(list)-1].Hash != nil {
		t.Fatal("an event from before the chain has a hash")
	}
}

func TestRechainTx(t *testing.T) {
	r, db := newRecorder(t)
	ids := recordN(t, r, db, 4)
	tx, err := db.Begin()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec("DELETE FROM audit_events WHERE id = ?", ids[1]); err != nil {
		t.Fatal(err)
	}
	if err := RechainTx(context.Background(), tx); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	if v := verify(t, r); !v.OK || v.Checked != 3 {
		t.Fatalf("after rechain: %+v", v)
	}
}

// TestChainHashVector pins the canonical form, so an exported event can be
// checked by other tools (docs/audit-log.md).
func TestChainHashVector(t *testing.T) {
	row := chainRow{id: 7, ts: 1700000000000, name: "logout", outcome: "success",
		actorID: sql.NullString{String: "u1", Valid: true}, userAgent: "ua", details: "{}"}
	if got := string(row.canonical()); got != `[1,7,1700000000000,"logout","success","u1",null,"ua","{}"]` {
		t.Fatalf("canonical = %s", got)
	}
	// printf '%s\n%s' "" '<canonical>' | sha256sum
	const want = "d939b13c2ff5d53f14f3757f536fc2c85d726f01cd48e3cbe4a20c5c06e82ed5"
	if got := chainHash("", row); got != want {
		t.Fatalf("hash = %s, want %s", got, want)
	}
}
