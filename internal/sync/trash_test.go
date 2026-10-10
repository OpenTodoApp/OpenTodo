package sync

import (
	"context"
	"errors"
	"strconv"
	"testing"
	"time"
)

func mustApply(t *testing.T, s *Service, user string, ops ...Op) ApplyResult {
	t.Helper()
	res, err := s.Apply(context.Background(), user, ops)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Rejected) > 0 {
		t.Fatalf("rejected: %+v", res.Rejected)
	}
	return res
}

func countRows(t *testing.T, s *Service, query string, args ...any) int {
	t.Helper()
	var n int
	if err := s.db.QueryRow(query, args...).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func TestHistoryIncludesLosingOps(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	mustApply(t, s, "u1",
		op("c1", "task", "t1", "title", `"Draft"`, 100, "laptop"),
		op("c2", "task", "t1", "created_at", `100`, 100, "laptop"),
	)
	mustApply(t, s, "u1", op("p1", "task", "t1", "title", `"Final"`, 300, "phone"))
	// An older offline edit arrives late: it loses under LWW.
	mustApply(t, s, "u1", op("l1", "task", "t1", "title", `"Stale"`, 200, "tablet"))
	mustApply(t, s, "u1", op("a1", "task", "t1", "due", `{"date":"2026-10-11"}`, 400, "server"))

	h, err := s.History(ctx, "u1", "task", "t1", 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(h.ChangeSets) != 4 {
		t.Fatalf("change sets = %d, want 4: %+v", len(h.ChangeSets), h.ChangeSets)
	}
	devices := []string{"laptop", "tablet", "phone", "server"}
	for i, d := range devices {
		if h.ChangeSets[i].Device != d {
			t.Fatalf("set %d device = %s, want %s", i, h.ChangeSets[i].Device, d)
		}
	}
	if len(h.ChangeSets[0].Changes) != 2 {
		t.Fatalf("creation set should group both fields: %+v", h.ChangeSets[0])
	}
	stale := h.ChangeSets[1].Changes[0]
	if !stale.Lost || string(stale.To) != `"Stale"` {
		t.Fatalf("late op not marked lost: %+v", stale)
	}
	final := h.ChangeSets[2].Changes[0]
	if final.Lost || string(final.From) != `"Draft"` || string(final.To) != `"Final"` {
		t.Fatalf("phone change = %+v", final)
	}
	// Foreign users and unknown ids get ErrNotFound.
	if _, err := s.History(ctx, "u2", "task", "t1", 0, 0); !errors.Is(err, ErrNotFound) {
		t.Fatalf("foreign history err = %v", err)
	}
	if _, err := s.History(ctx, "u1", "task", "nope", 0, 0); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown history err = %v", err)
	}
	// Paging backwards.
	p, err := s.History(ctx, "u1", "task", "t1", 0, 2)
	if err != nil || len(p.ChangeSets) != 2 || !p.More || p.Before != 300 {
		t.Fatalf("page 1 = %+v %v", p, err)
	}
	p, err = s.History(ctx, "u1", "task", "t1", p.Before, 2)
	if err != nil || len(p.ChangeSets) != 2 || p.More || p.ChangeSets[0].Device != "laptop" {
		t.Fatalf("page 2 = %+v %v", p, err)
	}
}

func TestHistoryRespectsSharingScopes(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	seedUsers(t, s, "owner", "bob")
	mustApply(t, s, "owner",
		op("p1", "project", "P", "name", `"Shared"`, 100, "A"),
		op("t1", "task", "T", "project_id", `"P"`, 100, "A"),
		op("t2", "task", "T", "title", `"Hello"`, 100, "A"),
		op("t3", "task", "Private", "title", `"Mine"`, 100, "A"),
	)
	if _, err := s.History(ctx, "bob", "task", "T", 0, 0); !errors.Is(err, ErrNotFound) {
		t.Fatalf("non-member saw history: %v", err)
	}
	if _, err := s.AddMember(ctx, "owner", "P", "bob", RoleViewer); err != nil {
		t.Fatal(err)
	}
	h, err := s.History(ctx, "bob", "task", "T", 0, 0)
	if err != nil || len(h.ChangeSets) != 1 {
		t.Fatalf("member history = %+v %v", h, err)
	}
	if _, err := s.History(ctx, "bob", "task", "Private", 0, 0); !errors.Is(err, ErrNotFound) {
		t.Fatalf("member saw owner's personal task: %v", err)
	}
}

func TestPurgeRemovesOpsAndCascades(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	mustApply(t, s, "u1",
		op("1", "project", "P", "name", `"Garden"`, 100, "A"),
		op("2", "task", "T1", "project_id", `"P"`, 100, "A"),
		op("3", "task", "T1", "title", `"Lawn"`, 100, "A"),
		op("4", "task", "T2", "project_id", `"P"`, 100, "A"),
		op("5", "task", "Keep", "title", `"Other"`, 100, "A"),
		op("6", "reminder", "R1", "task_id", `"T1"`, 100, "A"),
		op("7", "task", "Parent", "title", `"Parent"`, 100, "A"),
		op("8", "task", "Child", "parent_id", `"Parent"`, 100, "A"),
		op("9", "task", "LiveChild", "parent_id", `"Parent"`, 100, "A"),
	)
	if _, err := s.Purge(ctx, "u1", "project", []string{"P"}); !errors.Is(err, ErrNotDeleted) {
		t.Fatalf("live project purge err = %v", err)
	}
	if _, err := s.Purge(ctx, "u1", "project", []string{"missing"}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing purge err = %v", err)
	}
	mustApply(t, s, "u1", op("d1", "project", "P", "deleted_at", `200`, 200, "A"))
	res, err := s.Purge(ctx, "u1", "project", []string{"P"})
	if err != nil {
		t.Fatal(err)
	}
	if res.Projects != 1 || res.Tasks != 2 || res.Reminders != 1 {
		t.Fatalf("purge result = %+v", res)
	}
	for _, id := range []string{"P", "T1", "T2", "R1"} {
		if n := countRows(t, s, `SELECT COUNT(*) FROM ops WHERE entity_id = ?`, id); n != 0 {
			t.Fatalf("%s: %d ops left", id, n)
		}
		if n := countRows(t, s, `SELECT COUNT(*) FROM scope_fields WHERE entity_id = ?`, id); n != 0 {
			t.Fatalf("%s: %d fields left", id, n)
		}
		if n := countRows(t, s, `SELECT COUNT(*) FROM purges WHERE entity_id = ?`, id); n != 1 {
			t.Fatalf("%s: %d markers", id, n)
		}
	}
	if n := countRows(t, s, `SELECT COUNT(*) FROM op_scopes WHERE seq NOT IN (SELECT seq FROM ops)`); n != 0 {
		t.Fatalf("%d orphan op_scopes", n)
	}
	if e, _ := s.Get(ctx, "u1", "task", "Keep"); e == nil {
		t.Fatal("unrelated task purged")
	}
	// Task purge takes deleted descendants only.
	mustApply(t, s, "u1",
		op("d2", "task", "Parent", "deleted_at", `300`, 300, "A"),
		op("d3", "task", "Child", "deleted_at", `300`, 300, "A"),
	)
	res, err = s.Purge(ctx, "u1", "task", []string{"Parent"})
	if err != nil || res.Tasks != 2 {
		t.Fatalf("task purge = %+v %v", res, err)
	}
	if e, _ := s.Get(ctx, "u1", "task", "LiveChild"); e == nil {
		t.Fatal("live descendant purged")
	}
	// Markers take numbers from the ops sequence: a new op sorts after them.
	var maxMarker int64
	_ = s.db.QueryRow(`SELECT MAX(seq) FROM purges`).Scan(&maxMarker)
	mustApply(t, s, "u1", op("n1", "task", "New", "title", `"x"`, 400, "A"))
	var newSeq int64
	_ = s.db.QueryRow(`SELECT seq FROM ops WHERE op_id = 'n1'`).Scan(&newSeq)
	if newSeq <= maxMarker {
		t.Fatalf("new op seq %d not after marker %d", newSeq, maxMarker)
	}
}

func TestPurgeRespectsRoles(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	seedUsers(t, s, "owner", "ed")
	mustApply(t, s, "owner",
		op("1", "project", "P", "name", `"Shared"`, 100, "A"),
		op("2", "task", "T", "project_id", `"P"`, 100, "A"),
	)
	if _, err := s.AddMember(ctx, "owner", "P", "ed", RoleEditor); err != nil {
		t.Fatal(err)
	}
	mustApply(t, s, "owner",
		op("3", "project", "P", "deleted_at", `200`, 200, "A"),
		op("4", "task", "T", "deleted_at", `200`, 200, "A"),
	)
	if _, err := s.Purge(ctx, "ed", "project", []string{"P"}); !errors.Is(err, ErrForbidden) {
		t.Fatalf("editor purged project: %v", err)
	}
	// Emptying the Trash as editor removes the task but not the project.
	res, err := s.PurgeTrash(ctx, "ed")
	if err != nil || res.Tasks != 1 || res.Projects != 0 {
		t.Fatalf("editor empty trash = %+v %v", res, err)
	}
	if len(res.Audience) != 2 {
		t.Fatalf("audience = %v", res.Audience)
	}
}

func TestApplyDiscardsPurgedEntity(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	mustApply(t, s, "u1",
		op("1", "task", "T", "title", `"Doomed"`, 100, "A"),
		op("2", "task", "T", "deleted_at", `200`, 200, "A"),
	)
	if _, err := s.Purge(ctx, "u1", "task", []string{"T"}); err != nil {
		t.Fatal(err)
	}
	// Device B edited offline before learning of the purge.
	res := mustApply(t, s, "u1", op("b1", "task", "T", "title", `"Offline edit"`, 150, "B"))
	if res.Applied != 0 || res.Duplicates != 1 {
		t.Fatalf("stale op result = %+v", res)
	}
	if e, _ := s.Get(ctx, "u1", "task", "T"); e != nil {
		t.Fatalf("purged task resurrected: %v", e)
	}
	if n := countRows(t, s, `SELECT COUNT(*) FROM ops WHERE entity_id = 'T'`); n != 0 {
		t.Fatalf("%d ops stored for purged entity", n)
	}
}

func TestPullReportsPurged(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	mustApply(t, s, "u1",
		op("1", "task", "T", "title", `"x"`, 100, "A"),
		op("2", "task", "T", "deleted_at", `200`, 200, "A"),
	)
	r, err := s.PullAll(ctx, "u1", 0, "B", 0)
	if err != nil {
		t.Fatal(err)
	}
	cursor := r.Cursor
	if _, err := s.Purge(ctx, "u1", "task", []string{"T"}); err != nil {
		t.Fatal(err)
	}
	r, err = s.PullAll(ctx, "u1", cursor, "B", 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(r.Purged) != 1 || r.Purged[0].EntityID != "T" || r.Purged[0].Entity != "task" {
		t.Fatalf("purged = %+v", r.Purged)
	}
	if r.Cursor <= cursor {
		t.Fatalf("cursor did not advance past marker: %d <= %d", r.Cursor, cursor)
	}
	// Once past the marker it is not repeated.
	r2, err := s.PullAll(ctx, "u1", r.Cursor, "B", 0)
	if err != nil || len(r2.Purged) != 0 {
		t.Fatalf("marker repeated: %+v %v", r2, err)
	}
	// Another account never learns about it.
	r3, err := s.PullAll(ctx, "u2", 0, "X", 0)
	if err != nil || len(r3.Purged) != 0 {
		t.Fatalf("foreign marker: %+v %v", r3, err)
	}
}

func TestPurgeExpiredUsesCutoff(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
	old := now.Add(-31 * 24 * time.Hour).UnixMilli()
	recent := now.Add(-2 * 24 * time.Hour).UnixMilli()
	mustApply(t, s, "u1",
		op("1", "task", "Old", "deleted_at", jsonNum(old), old, "A"),
		op("2", "task", "Recent", "deleted_at", jsonNum(recent), recent, "A"),
		op("3", "task", "Live", "title", `"x"`, 100, "A"),
	)
	res, err := s.PurgeExpired(ctx, now.Add(-30*24*time.Hour))
	if err != nil || res.Tasks != 1 {
		t.Fatalf("retention = %+v %v", res, err)
	}
	if e, _ := s.Get(ctx, "u1", "task", "Old"); e != nil {
		t.Fatal("old tombstone kept")
	}
	if e, _ := s.Get(ctx, "u1", "task", "Recent"); e == nil {
		t.Fatal("recent tombstone purged")
	}
	if len(res.Audience) != 1 || res.Audience[0] != "u1" {
		t.Fatalf("audience = %v", res.Audience)
	}
}

func jsonNum(n int64) string { return strconv.FormatInt(n, 10) }

func seedUsers(t *testing.T, s *Service, ids ...string) {
	t.Helper()
	for _, u := range ids {
		if _, err := s.db.Exec(`INSERT INTO users(id,email,name,password_hash,created_at) VALUES(?,?,?,'h',1)`, u, u+"@example.com", u); err != nil {
			t.Fatal(err)
		}
	}
}

func TestRetentionPurgesOldTombstones(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
	s.now = func() time.Time { return now }
	old := now.Add(-31 * 24 * time.Hour).UnixMilli()
	fresh := now.UnixMilli() - 1000
	mustApply(t, s, "u1",
		op("1", "project", "P", "deleted_at", jsonNum(old), old, "A"),
		op("2", "task", "InP", "project_id", `"P"`, old, "A"),
		op("3", "task", "Fresh", "deleted_at", jsonNum(fresh), fresh, "A"),
	)
	// Disabled retention purges nothing.
	if res, err := s.RetentionPass(ctx, 0); err != nil || res.Tasks+res.Projects != 0 {
		t.Fatalf("disabled pass = %+v %v", res, err)
	}
	res, err := s.RetentionPass(ctx, 30)
	if err != nil || res.Projects != 1 || res.Tasks != 1 {
		t.Fatalf("default pass = %+v %v", res, err)
	}
	r, err := s.PullAll(ctx, "u1", 0, "B", 0)
	if err != nil || len(r.Purged) != 2 {
		t.Fatalf("devices not told: %+v %v", r.Purged, err)
	}
	if e, _ := s.Get(ctx, "u1", "task", "Fresh"); e == nil {
		t.Fatal("fresh tombstone purged")
	}
}
