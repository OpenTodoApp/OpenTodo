package demo

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
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
	syncSvc := opsync.NewService(db)
	s := New(auth.NewService(db, time.Hour, false), syncSvc, nil)
	syncSvc.SetWriteGuard(s.Guard())
	if err := s.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	return s, db
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

// sandbox creates a sandbox from a fresh token and returns the visitor and the
// collaborator ids.
func sandbox(t *testing.T, s *Service, addr string) (string, string) {
	t.Helper()
	u, err := s.CreateSandbox(context.Background(), s.Info().Token, addr)
	if err != nil {
		t.Fatal(err)
	}
	var collab string
	if err := s.sync.DB().QueryRow(`SELECT collaborator_id FROM demo_sandboxes WHERE user_id = ?`, u.ID).Scan(&collab); err != nil {
		t.Fatal(err)
	}
	return u.ID, collab
}

func TestFirstStartHasOnlyTheHiddenOwner(t *testing.T) {
	s, db := newDemo(t)
	if n := count(t, db, `SELECT COUNT(*) FROM users`); n != 1 {
		t.Fatalf("users = %d", n)
	}
	if n := count(t, db, `SELECT COUNT(*) FROM users WHERE role = 'owner' AND email = ?`, OwnerEmail); n != 1 {
		t.Fatal("hidden owner missing")
	}
	info := s.Info()
	if info.Token == "" || info.SandboxHours != (SandboxHours{Idle: 2, Max: 24}) || info.ResetsAt == 0 {
		t.Fatalf("info = %+v", info)
	}
	// Restart: nothing created twice.
	if err := s.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	if n := count(t, db, `SELECT COUNT(*) FROM users`); n != 1 {
		t.Fatalf("users after restart = %d", n)
	}
}

func TestSandboxSeedThroughOps(t *testing.T) {
	s, db := newDemo(t)
	me, collab := sandbox(t, s, "203.0.113.1")
	// Every materialized field is backed by an op with the same value: nothing
	// was written around the op log.
	if n := count(t, db, `SELECT COUNT(*) FROM scope_fields f WHERE NOT EXISTS (
		SELECT 1 FROM ops o JOIN op_scopes s ON s.seq = o.seq WHERE s.scope_id = f.scope_id AND o.entity = f.entity
		AND o.entity_id = f.entity_id AND o.field = f.field AND o.value = f.value AND o.ts = f.ts)`); n != 0 {
		t.Fatalf("%d fields without an op", n)
	}
	got := titles(t, s, me, false)
	for _, want := range []string{"Get three quotes for the kitchen", "Water the plants", "Launch email sequence", "Compare payment schedules"} {
		if got[want] == "" {
			t.Errorf("task %q missing", want)
		}
	}
	all := titles(t, s, me, true)
	if all["Old shopping list"] == "" || got["Old shopping list"] != "" {
		t.Error("trashed task should exist only with deleted items")
	}
	// The collaborator sees the shared project's tasks, not personal ones.
	sam := titles(t, s, collab, false)
	if sam["Order new taps"] == "" || sam["Renew passport"] != "" {
		t.Errorf("collaborator view wrong: %v", sam)
	}
	for entity, min := range map[string]int{"project": 5, "label": 4, "view": 4, "section": 6, "reminder": 2, "comment": 3} {
		if n := count(t, db, `SELECT COUNT(DISTINCT entity_id) FROM scope_fields WHERE entity = ?`, entity); n < min {
			t.Errorf("%s: %d < %d", entity, n, min)
		}
	}
	if n := count(t, db, `SELECT COUNT(*) FROM project_members WHERE user_id = ?`, collab); n != 1 {
		t.Errorf("collaborator memberships = %d", n)
	}
	// Dates are relative to today.
	if n := count(t, db, `SELECT COUNT(*) FROM scope_fields WHERE entity = 'task' AND field = 'due' AND value LIKE ?`,
		`%"`+time.Now().UTC().Format("2006-01-02")+`"%`); n == 0 {
		t.Error("no task due today")
	}
	// The seed is not charged to the visitor's write budget.
	if n := count(t, db, `SELECT ops_total FROM demo_sandboxes WHERE user_id = ?`, me); n != 0 {
		t.Errorf("seed charged %d ops", n)
	}
	// Neither account has a usable password.
	if n := count(t, db, `SELECT COUNT(*) FROM users WHERE id IN (?, ?) AND password_hash = ''`, me, collab); n != 2 {
		t.Errorf("password-less accounts = %d", n)
	}

	// A second visitor gets an own copy with fresh ids; edits stay apart.
	other, _ := sandbox(t, s, "203.0.113.2")
	theirs := titles(t, s, other, false)
	if theirs["Water the plants"] == "" || theirs["Water the plants"] == got["Water the plants"] {
		t.Fatal("second sandbox does not have its own copy")
	}
	op := opsync.Op{ID: "e1", Entity: "task", EntityID: got["Water the plants"], Field: "title", Value: json.RawMessage(`"mine only"`), TS: time.Now().UnixMilli(), Device: "d1"}
	if _, err := s.sync.ApplyStrict(context.Background(), me, []opsync.Op{op}); err != nil {
		t.Fatal(err)
	}
	if _, ok := titles(t, s, other, true)["mine only"]; ok {
		t.Fatal("an edit leaked into another sandbox")
	}
}

func TestUpgradeDeletesSharedDemoAccount(t *testing.T) {
	ctx := context.Background()
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	authSvc := auth.NewService(db, time.Hour, false)
	syncSvc := opsync.NewService(db)
	// The first demo version: hidden owner, the public account and a second
	// member sharing a project, with a session, a notification and a purge marker.
	if _, err := authSvc.CreateAccount(ctx, OwnerEmail, OwnerName, randomPassword(), "owner"); err != nil {
		t.Fatal(err)
	}
	demoUser, _ := authSvc.CreateAccount(ctx, "demo@example.com", "Alex Demo", "opentodo-demo", "member")
	sam, _ := authSvc.CreateAccount(ctx, "sam@example.com", "Sam Rivera", randomPassword(), "member")
	now := time.Now().UnixMilli()
	write := func(uid, entity, id, field, value string) {
		t.Helper()
		if _, err := syncSvc.ApplyStrict(ctx, uid, []opsync.Op{{ID: id + field, Entity: entity, EntityID: id, Field: field, Value: json.RawMessage(value), TS: now, Device: "d"}}); err != nil {
			t.Fatal(err)
		}
	}
	write(demoUser.ID, "project", "p1", "name", `"Home"`)
	write(demoUser.ID, "task", "t1", "title", `"visitor graffiti"`)
	if _, err := syncSvc.AddMember(ctx, demoUser.ID, "p1", sam.ID, opsync.RoleEditor); err != nil {
		t.Fatal(err)
	}
	write(sam.ID, "task", "t2", "project_id", `"p1"`)
	if _, _, err := authSvc.CreateSession(ctx, demoUser.ID, "browser"); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO notifications(id,user_id,kind,payload,created_at) VALUES('n1',?,'assigned','{}',1)`, demoUser.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO purges(seq,user_id,scope_id,entity,entity_id,purged_at) VALUES(999999,'',?,'task','gone',1)`, opsync.PersonalScope(demoUser.ID)); err != nil {
		t.Fatal(err)
	}

	s := New(authSvc, syncSvc, nil)
	if err := s.Start(ctx); err != nil {
		t.Fatal(err)
	}
	if n := count(t, db, `SELECT COUNT(*) FROM users`); n != 1 {
		t.Fatalf("users after upgrade = %d", n)
	}
	for table, q := range map[string]string{
		"sessions":       `SELECT COUNT(*) FROM sessions`,
		"ops":            `SELECT COUNT(*) FROM ops`,
		"scope_fields":   `SELECT COUNT(*) FROM scope_fields`,
		"project_scopes": `SELECT COUNT(*) FROM project_scopes`,
		"members":        `SELECT COUNT(*) FROM project_members`,
		"notifications":  `SELECT COUNT(*) FROM notifications`,
		"purges":         `SELECT COUNT(*) FROM purges`,
	} {
		if n := count(t, db, q); n != 0 {
			t.Errorf("%s left: %d", table, n)
		}
	}
	// Idempotent.
	if err := s.Start(ctx); err != nil {
		t.Fatal(err)
	}
}

func TestSandboxExpiry(t *testing.T) {
	ctx := context.Background()
	s, db := newDemo(t)
	base := time.Now()
	clock := base
	s.SetClock(func() time.Time { return clock })
	idle, idleCollab := sandbox(t, s, "198.51.100.1")
	busy, _ := sandbox(t, s, "198.51.100.2")
	// The busy visitor keeps working; the idle one does not.
	for _, d := range []time.Duration{40 * time.Minute, 80 * time.Minute, 121 * time.Minute} {
		clock = base.Add(d)
		if err := s.Touch(ctx, busy); err != nil {
			t.Fatal(err)
		}
	}
	if n, err := s.Cleanup(ctx); err != nil || n != 1 {
		t.Fatalf("cleanup = %d, %v", n, err)
	}
	for _, uid := range []string{idle, idleCollab} {
		for table, q := range map[string]string{
			"users":    `SELECT COUNT(*) FROM users WHERE id = ?`,
			"sessions": `SELECT COUNT(*) FROM sessions WHERE user_id = ?`,
			"ops":      `SELECT COUNT(*) FROM ops WHERE user_id = ?`,
			"fields":   `SELECT COUNT(*) FROM scope_fields WHERE scope_id = 'user:' || ?`,
			"sandbox":  `SELECT COUNT(*) FROM demo_sandboxes WHERE user_id = ?`,
			"notes":    `SELECT COUNT(*) FROM notifications WHERE user_id = ?`,
			"members":  `SELECT COUNT(*) FROM project_members WHERE user_id = ?`,
			"projects": `SELECT COUNT(*) FROM project_scopes WHERE owner_id = ?`,
		} {
			if n := count(t, db, q, uid); n != 0 {
				t.Errorf("%s of the expired sandbox left: %d", table, n)
			}
		}
	}
	if ok, _ := s.IsSandbox(ctx, busy); !ok {
		t.Fatal("active sandbox was deleted")
	}
	// No purge markers were written for the deleted data.
	if n := count(t, db, `SELECT COUNT(*) FROM purges`); n != 0 {
		t.Errorf("purge markers = %d", n)
	}
	// Touch writes at most once a minute.
	clock = clock.Add(10 * time.Second)
	before := count(t, db, `SELECT last_active_at FROM demo_sandboxes WHERE user_id = ?`, busy)
	_ = s.Touch(ctx, busy)
	if after := count(t, db, `SELECT last_active_at FROM demo_sandboxes WHERE user_id = ?`, busy); after != before {
		t.Fatal("last_active_at written twice within a minute")
	}
	// A day after creation the sandbox goes, however active.
	clock = base.Add(MaxLifetime + time.Minute)
	_ = s.Touch(ctx, busy)
	if n, err := s.Cleanup(ctx); err != nil || n != 1 {
		t.Fatalf("max lifetime cleanup = %d, %v", n, err)
	}
	if n := count(t, db, `SELECT COUNT(*) FROM users`); n != 1 {
		t.Fatalf("users left = %d", n)
	}
}

func TestNightlyResetDeletesAllSandboxes(t *testing.T) {
	ctx := context.Background()
	s, db := newDemo(t)
	for i, addr := range []string{"192.0.2.1", "192.0.2.2", "192.0.2.3"} {
		me, _ := sandbox(t, s, addr)
		if _, _, err := s.auth.CreateSession(ctx, me, "tab"); err != nil {
			t.Fatal(err)
		}
		_ = i
	}
	var pagesBefore int
	_ = db.QueryRow(`PRAGMA page_count`).Scan(&pagesBefore)
	if err := s.Reset(ctx); err != nil {
		t.Fatal(err)
	}
	for table, q := range map[string]string{
		"sandboxes":    `SELECT COUNT(*) FROM demo_sandboxes`,
		"sessions":     `SELECT COUNT(*) FROM sessions`,
		"ops":          `SELECT COUNT(*) FROM ops`,
		"scope_fields": `SELECT COUNT(*) FROM scope_fields`,
		"op_scopes":    `SELECT COUNT(*) FROM op_scopes`,
		"members":      `SELECT COUNT(*) FROM project_members`,
	} {
		if n := count(t, db, q); n != 0 {
			t.Errorf("%s left: %d", table, n)
		}
	}
	if n := count(t, db, `SELECT COUNT(*) FROM users`); n != 1 {
		t.Errorf("users left = %d", n)
	}
	// VACUUM gave the space back: no free pages, fewer pages.
	var pagesAfter, free int
	_ = db.QueryRow(`PRAGMA page_count`).Scan(&pagesAfter)
	_ = db.QueryRow(`PRAGMA freelist_count`).Scan(&free)
	if free != 0 || pagesAfter >= pagesBefore {
		t.Errorf("pages %d -> %d, free %d", pagesBefore, pagesAfter, free)
	}
	at, err := s.LastReset(ctx)
	if err != nil || Stale(at, time.Now()) {
		t.Fatalf("last reset not recorded: %v %v", at, err)
	}
	// New visitors can start a sandbox right away.
	sandbox(t, s, "192.0.2.9")
}

func TestStartResetsAfterMissedNight(t *testing.T) {
	ctx := context.Background()
	s, db := newDemo(t)
	sandbox(t, s, "192.0.2.1")
	// Restart the same day: the sandbox survives.
	if err := s.Start(ctx); err != nil {
		t.Fatal(err)
	}
	if n := count(t, db, `SELECT COUNT(*) FROM demo_sandboxes`); n != 1 {
		t.Fatalf("sandboxes after restart = %d", n)
	}
	// The server was down at 03:00 UTC: the next start deletes every sandbox.
	if err := s.settings.Set(ctx, resetKey, time.Now().Add(-48*time.Hour).UnixMilli()); err != nil {
		t.Fatal(err)
	}
	if err := s.Start(ctx); err != nil {
		t.Fatal(err)
	}
	if n := count(t, db, `SELECT COUNT(*) FROM demo_sandboxes`); n != 0 {
		t.Fatalf("sandboxes after a missed reset = %d", n)
	}
}

func TestCreationTokenRules(t *testing.T) {
	ctx := context.Background()
	s, _ := newDemo(t)
	tok := s.Info().Token
	if _, err := s.CreateSandbox(ctx, tok, "a"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateSandbox(ctx, tok, "a"); !errors.Is(err, ErrBadToken) {
		t.Fatalf("reused token: %v", err)
	}
	for _, bad := range []string{"", "x.y", tok + "x", "AAAA." + tok} {
		if _, err := s.CreateSandbox(ctx, bad, "a"); !errors.Is(err, ErrBadToken) {
			t.Fatalf("token %q: %v", bad, err)
		}
	}
	// Expired after TokenTTL.
	old := s.Info().Token
	s.SetClock(func() time.Time { return time.Now().Add(TokenTTL + time.Second) })
	if _, err := s.CreateSandbox(ctx, old, "a"); !errors.Is(err, ErrBadToken) {
		t.Fatalf("expired token: %v", err)
	}
	// A token from another process with the same data directory is accepted.
	s.SetClock(time.Now)
	other := New(s.auth, s.sync, nil)
	if err := other.Start(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := other.CreateSandbox(ctx, s.Info().Token, "b"); err != nil {
		t.Fatalf("token across processes: %v", err)
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
		"2026-10-11T03:30:00Z": false, // reset after this morning's reset time
		"2026-10-11T02:59:00Z": true,  // missed this morning's reset
		"2026-10-09T12:00:00Z": true,  // older than a day
	} {
		if got := Stale(at(seeded), now); got != want {
			t.Errorf("Stale(%s) = %v", seeded, got)
		}
	}
	if !Stale(time.Time{}, now) {
		t.Error("never reset must be stale")
	}
}
