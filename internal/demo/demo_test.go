package demo

import (
	"context"
	"database/sql"
	"encoding/json"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/store"
	opsync "github.com/pixari/opentodo/internal/sync"
)

func newDemo(t *testing.T) (*Service, *sql.DB) {
	t.Helper()
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return New(auth.NewService(db, time.Hour, false), opsync.NewService(db), nil), db
}

func count(t *testing.T, db *sql.DB, q string, args ...any) int {
	t.Helper()
	var n int
	if err := db.QueryRow(q, args...).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func titles(t *testing.T, s *Service, uid string, deleted bool) map[string]string {
	t.Helper()
	list, err := s.sync.List(context.Background(), uid, "task", deleted)
	if err != nil {
		t.Fatal(err)
	}
	out := map[string]string{}
	for _, e := range list {
		var title, id string
		_ = json.Unmarshal(e["title"], &title)
		_ = json.Unmarshal(e["id"], &id)
		out[title] = id
	}
	return out
}

func TestStartProvisionsAccountsAndSeedsThroughOps(t *testing.T) {
	ctx := context.Background()
	s, db := newDemo(t)
	if err := s.Start(ctx); err != nil {
		t.Fatal(err)
	}
	a, err := s.EnsureAccounts(ctx)
	if err != nil {
		t.Fatal(err)
	}
	// Hidden owner plus two members; the demo user is not the owner.
	if n := count(t, db, `SELECT COUNT(*) FROM users`); n != 3 {
		t.Fatalf("users = %d", n)
	}
	if a.Demo.Role != "member" || a.Member.Role != "member" {
		t.Fatalf("roles demo=%s member=%s", a.Demo.Role, a.Member.Role)
	}
	if n := count(t, db, `SELECT COUNT(*) FROM users WHERE role = 'owner' AND email = ?`, OwnerEmail); n != 1 {
		t.Fatal("hidden owner missing")
	}
	if u, err := s.auth.Authenticate(ctx, Email, Password); err != nil || u.ID != a.Demo.ID {
		t.Fatalf("demo credentials: %v", err)
	}
	// Every materialized field is backed by an op with the same value: nothing
	// was written around the op log.
	if n := count(t, db, `SELECT COUNT(*) FROM scope_fields f WHERE NOT EXISTS (
		SELECT 1 FROM ops o JOIN op_scopes s ON s.seq = o.seq WHERE s.scope_id = f.scope_id AND o.entity = f.entity
		AND o.entity_id = f.entity_id AND o.field = f.field AND o.value = f.value AND o.ts = f.ts)`); n != 0 {
		t.Fatalf("%d fields without an op", n)
	}
	got := titles(t, s, a.Demo.ID, false)
	for _, want := range []string{"Get three quotes for the kitchen", "Water the plants", "Launch email sequence", "Compare payment schedules"} {
		if got[want] == "" {
			t.Errorf("task %q missing", want)
		}
	}
	all := titles(t, s, a.Demo.ID, true)
	if all["Old shopping list"] == "" || got["Old shopping list"] != "" {
		t.Error("trashed task should exist only with deleted items")
	}
	// The second account sees the shared project's tasks, not personal ones.
	sam := titles(t, s, a.Member.ID, false)
	if sam["Order new taps"] == "" || sam["Renew passport"] != "" {
		t.Errorf("member view wrong: %v", sam)
	}
	for entity, min := range map[string]int{"project": 5, "label": 4, "view": 4, "section": 6, "reminder": 2, "comment": 3} {
		if n := count(t, db, `SELECT COUNT(DISTINCT entity_id) FROM scope_fields WHERE entity = ?`, entity); n < min {
			t.Errorf("%s: %d < %d", entity, n, min)
		}
	}
	if n := count(t, db, `SELECT COUNT(*) FROM project_members WHERE user_id = ?`, a.Member.ID); n != 1 {
		t.Errorf("member memberships = %d", n)
	}
	if n := count(t, db, `SELECT COUNT(*) FROM scope_fields WHERE entity = 'task' AND field = 'recurrence' AND value != 'null'`); n < 3 {
		t.Errorf("recurring tasks = %d", n)
	}
	// Dates are relative to today.
	due := count(t, db, `SELECT COUNT(*) FROM scope_fields WHERE entity = 'task' AND field = 'due' AND value LIKE ?`,
		`%"`+time.Now().UTC().Format("2006-01-02")+`"%`)
	if due == 0 {
		t.Error("no task due today")
	}

	// Starting again is idempotent: no new accounts, no reseed.
	ops := count(t, db, `SELECT COUNT(*) FROM ops`)
	if err := s.Start(ctx); err != nil {
		t.Fatal(err)
	}
	if n := count(t, db, `SELECT COUNT(*) FROM users`); n != 3 {
		t.Fatalf("users after restart = %d", n)
	}
	if n := count(t, db, `SELECT COUNT(*) FROM ops`); n != ops {
		t.Fatalf("ops %d -> %d after a fresh restart", ops, n)
	}
}

func TestResetWipesAndReseeds(t *testing.T) {
	ctx := context.Background()
	s, db := newDemo(t)
	if err := s.Start(ctx); err != nil {
		t.Fatal(err)
	}
	a, _ := s.EnsureAccounts(ctx)
	before := titles(t, s, a.Demo.ID, true)
	// A visitor adds something private and a device remembers its cursor.
	private := opsync.Op{ID: "v1", Entity: "task", EntityID: "visitor-task", Field: "title", Value: json.RawMessage(`"my bank PIN"`), TS: time.Now().UnixMilli(), Device: "dev1"}
	if _, err := s.sync.ApplyStrict(ctx, a.Demo.ID, []opsync.Op{private}); err != nil {
		t.Fatal(err)
	}
	pull, err := s.sync.PullAll(ctx, a.Demo.ID, 0, "dev1", opsync.MaxOpsPerRequest)
	for pull.More && err == nil {
		pull, err = s.sync.PullAll(ctx, a.Demo.ID, pull.Cursor, "dev1", opsync.MaxOpsPerRequest)
	}
	if err != nil {
		t.Fatal(err)
	}
	cursor := pull.Cursor

	if err := s.Reset(ctx); err != nil {
		t.Fatal(err)
	}
	after := titles(t, s, a.Demo.ID, true)
	if _, ok := after["my bank PIN"]; ok {
		t.Fatal("visitor data survived the reset")
	}
	if after["Get three quotes for the kitchen"] == "" || after["Get three quotes for the kitchen"] == before["Get three quotes for the kitchen"] {
		t.Fatal("reset did not reseed with fresh ids")
	}
	if len(after) != len(before) {
		t.Fatalf("task count %d -> %d", len(before), len(after))
	}
	if n := count(t, db, `SELECT COUNT(*) FROM project_scopes`); n != 1 {
		t.Fatalf("shared projects after reset = %d", n)
	}
	// The device's next exchange from its old cursor reports the old entities
	// as purged and brings the new ones.
	purged := map[string]bool{}
	gotNew := false
	for {
		pull, err = s.sync.PullAll(ctx, a.Demo.ID, cursor, "dev1", opsync.MaxOpsPerRequest)
		if err != nil {
			t.Fatal(err)
		}
		for _, p := range pull.Purged {
			purged[p.EntityID] = true
		}
		for _, op := range pull.Ops {
			if op.EntityID == after["Get three quotes for the kitchen"] {
				gotNew = true
			}
		}
		cursor = pull.Cursor
		if !pull.More {
			break
		}
	}
	if !purged["visitor-task"] || !purged[before["Renew passport"]] || !purged[before["Order new taps"]] {
		t.Fatalf("old entities not reported purged (%d markers)", len(purged))
	}
	if !gotNew {
		t.Fatal("new seed not pulled")
	}
	// A stale queued op for a wiped entity is discarded, not resurrected.
	stale := private
	stale.ID, stale.Value = "v2", json.RawMessage(`"edited offline"`)
	if res, err := s.sync.Apply(ctx, a.Demo.ID, []opsync.Op{stale}); err != nil || res.Applied != 0 {
		t.Fatalf("stale op: %+v %v", res, err)
	}
	if n := count(t, db, `SELECT COUNT(*) FROM notifications WHERE user_id = ?`, a.Demo.ID); n > 3 {
		t.Fatalf("notifications accumulate across resets: %d", n)
	}
}

func TestResetSchedule(t *testing.T) {
	at := func(s string) time.Time {
		v, err := time.Parse(time.RFC3339, s)
		if err != nil {
			t.Fatal(err)
		}
		return v
	}
	if got := NextReset(at("2026-10-11T02:59:00Z")); !got.Equal(at("2026-10-11T03:00:00Z")) {
		t.Errorf("before 3: %v", got)
	}
	if got := NextReset(at("2026-10-11T03:00:00Z")); !got.Equal(at("2026-10-12T03:00:00Z")) {
		t.Errorf("at 3: %v", got)
	}
	now := at("2026-10-11T10:00:00Z")
	for seeded, want := range map[string]bool{
		"2026-10-11T03:30:00Z": false, // seeded after this morning's reset
		"2026-10-11T02:59:00Z": true,  // missed this morning's reset
		"2026-10-09T12:00:00Z": true,  // older than a day
	} {
		if got := Stale(at(seeded), now); got != want {
			t.Errorf("Stale(%s) = %v", seeded, got)
		}
	}
	if !Stale(time.Time{}, now) {
		t.Error("never seeded must be stale")
	}
}
