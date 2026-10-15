package digest

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/mail"
	"github.com/pixari/opentodo/internal/settings"
	"github.com/pixari/opentodo/internal/store"
	opsync "github.com/pixari/opentodo/internal/sync"
)

type fakeSender struct {
	fail bool
	sent []string
}

func (f *fakeSender) Send(_ context.Context, _ mail.Config, to string, data []byte) error {
	if f.fail {
		return &mail.SendError{Stage: mail.StageConnect, Reply: "refused"}
	}
	f.sent = append(f.sent, string(data))
	return nil
}

type fakeKeys map[string]bool

func (k fakeKeys) Enabled(_ context.Context, id string) (bool, error) { return k[id], nil }

type env struct {
	db    *sql.DB
	sync  *opsync.Service
	store *Store
	mail  *mail.Service
	smtp  *fakeSender
	keys  fakeKeys
	clock time.Time
}

func newEnv(t *testing.T) *env {
	t.Helper()
	dir := t.TempDir()
	db, err := store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if _, err := db.Exec(`INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES('u1','ada@example.com','Ada','h','owner',1)`); err != nil {
		t.Fatal(err)
	}
	e := &env{db: db, sync: opsync.NewService(db), store: NewStore(db), smtp: &fakeSender{}, keys: fakeKeys{}}
	e.mail = mail.New(settings.New(db), dir, mail.Options{Env: config.SMTPConfig{Host: "smtp.example.com", Port: 587, Security: "starttls", From: "todo@example.com"},
		Audit: audit.New(db, nil), Transport: e.smtp, E2EE: e.keys})
	return e
}

func (e *env) scheduler() *Scheduler {
	return &Scheduler{Store: e.store, Reader: e.sync, Mail: e.mail, Audit: audit.New(e.db, nil), Origin: "https://todo.example.com", Now: func() time.Time { return e.clock }}
}

func (e *env) at(t *testing.T, local string) {
	t.Helper()
	loc, _ := time.LoadLocation("Europe/Zurich")
	v, err := time.ParseInLocation("2006-01-02 15:04", local, loc)
	if err != nil {
		t.Fatal(err)
	}
	e.clock = v
}

func (e *env) write(t *testing.T, entity, id string, fields map[string]any) {
	t.Helper()
	var ops []opsync.Op
	for f, v := range fields {
		ops = append(ops, opsync.Op{ID: entity + id + f, Entity: entity, EntityID: id, Field: f, Value: mustJSON(v), TS: 1, Device: "d"})
	}
	if _, err := e.sync.ApplyStrict(context.Background(), "u1", ops); err != nil {
		t.Fatal(err)
	}
}

func (e *env) failures(t *testing.T, reason string) int {
	var n int
	e.db.QueryRow(`SELECT COUNT(*) FROM audit_events WHERE name = 'email.failed' AND details LIKE '%"reason":"` + reason + `"%'`).Scan(&n)
	return n
}

func TestSettingsValidation(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	if s, _ := e.store.Get(ctx, "u1"); s != Defaults {
		t.Fatalf("defaults = %+v", s)
	}
	for _, bad := range []Settings{{Weekday: 7, Hour: 7, TimeZone: "UTC", Language: "en"}, {Weekday: 1, Hour: 24, TimeZone: "UTC", Language: "en"},
		{Weekday: 1, Hour: 7, TimeZone: "Mars/Olympus", Language: "en"}, {Weekday: 1, Hour: 7, TimeZone: "UTC", Language: "ja"}} {
		var ie *InvalidError
		if err := e.store.Put(ctx, "u1", bad); !errors.As(err, &ie) {
			t.Fatalf("%+v accepted: %v", bad, err)
		}
	}
	on := Settings{Enabled: true, Weekday: 5, Hour: 7, TimeZone: "Europe/Zurich", Language: "de"}
	if err := e.store.Put(ctx, "u1", on); err != nil {
		t.Fatal(err)
	}
	if got, _ := e.store.Get(ctx, "u1"); got != on {
		t.Fatalf("got %+v", got)
	}
	if was, _ := e.store.Disable(ctx, "u1"); !was {
		t.Fatal("disable reported off")
	}
	if got, _ := e.store.Get(ctx, "u1"); got.Enabled {
		t.Fatal("still enabled")
	}
	next := NextSend(on, time.Date(2026, 10, 14, 12, 0, 0, 0, time.UTC))
	if next == nil || next.Format("2006-01-02 15:04 MST") != "2026-10-16 07:00 CEST" {
		t.Fatalf("next = %v", next)
	}
}

func TestSentOnceAndRestartSafe(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	e.store.Put(ctx, "u1", Settings{Enabled: true, Weekday: 5, Hour: 7, TimeZone: "Europe/Zurich", Language: "de"})
	e.write(t, "project", "garage", map[string]any{"name": "Garage"})
	e.write(t, "task", "t1", map[string]any{"title": "Miete zahlen", "due": map[string]string{"date": "2026-10-14"}})
	e.at(t, "2026-10-16 06:58")
	e.scheduler().RunOnce(ctx)
	if len(e.smtp.sent) != 0 {
		t.Fatal("sent before the hour")
	}
	e.at(t, "2026-10-16 07:03")
	e.scheduler().RunOnce(ctx)
	e.at(t, "2026-10-16 07:08")
	e.scheduler().RunOnce(ctx)                                                                                               // a later pass
	(&Scheduler{Store: NewStore(e.db), Reader: e.sync, Mail: e.mail, Now: func() time.Time { return e.clock }}).RunOnce(ctx) // after a restart
	if len(e.smtp.sent) != 1 {
		t.Fatalf("sent %d", len(e.smtp.sent))
	}
	msg := e.smtp.sent[0]
	if !strings.Contains(msg, "Garage") || !strings.Contains(msg, "/review") {
		t.Fatalf("message = %s", msg)
	}
	var n int
	e.db.QueryRow(`SELECT COUNT(*) FROM audit_events WHERE name = 'email.sent' AND details LIKE '%"email_kind":"digest"%'`).Scan(&n)
	if n != 1 {
		t.Fatalf("email.sent = %d", n)
	}
	// Not on another weekday.
	e.at(t, "2026-10-17 07:03")
	e.scheduler().RunOnce(ctx)
	if len(e.smtp.sent) != 1 {
		t.Fatal("sent on Saturday")
	}
}

func TestRelayDownThenSkipped(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	e.store.Put(ctx, "u1", Settings{Enabled: true, Weekday: 5, Hour: 7, TimeZone: "Europe/Zurich", Language: "en"})
	e.smtp.fail = true
	for _, at := range []string{"2026-10-16 07:00", "2026-10-16 07:30", "2026-10-16 07:55"} {
		e.at(t, at)
		e.scheduler().RunOnce(ctx)
	}
	if e.failures(t, "connect") != 3 {
		t.Fatalf("connect failures = %d", e.failures(t, "connect"))
	}
	e.smtp.fail = false
	e.at(t, "2026-10-16 08:02")
	e.scheduler().RunOnce(ctx)
	if len(e.smtp.sent) != 1 {
		t.Fatalf("sent after the relay came back = %d", len(e.smtp.sent))
	}
	// The next Friday the relay stays down past the window: skipped once.
	e.smtp.fail = true
	e.at(t, "2026-10-23 07:01")
	e.scheduler().RunOnce(ctx)
	e.at(t, "2026-10-23 13:01")
	e.scheduler().RunOnce(ctx)
	e.at(t, "2026-10-23 13:06")
	e.scheduler().RunOnce(ctx)
	if e.failures(t, "skipped") != 1 {
		t.Fatalf("skipped = %d", e.failures(t, "skipped"))
	}
	if s, _ := e.store.Get(ctx, "u1"); s.LastSentFor != "2026-10-23" || s.LastOutcome != "skipped" {
		t.Fatalf("settings = %+v", s)
	}
}

func TestEncryptedAccountRefused(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	e.store.Put(ctx, "u1", Settings{Enabled: true, Weekday: 5, Hour: 7, TimeZone: "Europe/Zurich", Language: "en"})
	e.write(t, "task", "t1", map[string]any{"title": "OTE1:ciphertext", "due": map[string]string{"date": "2026-10-14"}})
	e.keys["u1"] = true
	e.at(t, "2026-10-16 07:03")
	e.scheduler().RunOnce(ctx)
	if len(e.smtp.sent) != 0 || e.failures(t, "encrypted_account") != 1 {
		t.Fatalf("sent %d, refusals %d", len(e.smtp.sent), e.failures(t, "encrypted_account"))
	}
}

func TestDigestContentRules(t *testing.T) {
	ctx := context.Background()
	ent := func(fields map[string]any) opsync.Entity {
		e := opsync.Entity{}
		for k, v := range fields {
			e[k] = mustJSON(v)
		}
		return e
	}
	r := fakeReader{
		lists: map[string][]opsync.Entity{
			"project": {ent(map[string]any{"id": "shared", "name": "Team"}), ent(map[string]any{"id": "garage", "name": "Garage"}), ent(map[string]any{"id": "view", "name": "Read only"})},
			"task": {
				ent(map[string]any{"id": "theirs", "title": "Their task", "project_id": "shared", "assignee_id": "u2", "due": map[string]string{"date": "2026-10-12"}}),
				ent(map[string]any{"id": "mine", "title": "My task", "project_id": "shared", "assignee_id": "u1", "due": map[string]string{"date": "2026-10-12"}}),
				ent(map[string]any{"id": "inbox", "title": "Inbox task", "due": map[string]string{"date": "2026-10-18"}}),
			},
		},
		gets:    map[string]opsync.Entity{"review": ent(map[string]any{"id": "me", "completed_at": time.Date(2026, 10, 9, 10, 0, 0, 0, time.UTC).UnixMilli()})},
		members: []opsync.Membership{{ProjectID: "shared", Role: "editor"}, {ProjectID: "view", Role: "viewer"}},
	}
	loc, _ := time.LoadLocation("Europe/Zurich")
	now := time.Date(2026, 10, 16, 7, 3, 0, 0, loc)
	m, err := Build(ctx, r, Row{UserID: "u1", Email: "ada@example.com", Settings: Settings{TimeZone: "Europe/Zurich", Language: "en", Weekday: 5, Hour: 7}}, now, "https://todo.example.com")
	if err != nil {
		t.Fatal(err)
	}
	d := m.Vars.Digest
	if len(d.Overdue) != 1 || d.Overdue[0].Title != "My task" || d.Overdue[0].Date != "Mon 12 Oct" || d.Overdue[0].Project != "Team" {
		t.Fatalf("overdue = %+v", d.Overdue)
	}
	if len(d.Ahead) != 1 || d.Ahead[0].Title != "Inbox task" {
		t.Fatalf("ahead = %+v", d.Ahead)
	}
	// Garage has no open task; Team has open tasks; the viewer project is not offered.
	if strings.Join(d.Projects, ",") != "Garage" {
		t.Fatalf("projects = %v", d.Projects)
	}
	if d.LastReview != "Fri 9 Oct" || d.Period != "Mon 5 Oct – Sun 11 Oct" || m.Vars.Link != "https://todo.example.com/review" {
		t.Fatalf("digest = %+v", d)
	}
	if got := dayLabel("2026-10-23", "de"); got != "Fr. 23. Okt." {
		t.Fatalf("german label %q", got)
	}
}

type fakeReader struct {
	lists   map[string][]opsync.Entity
	gets    map[string]opsync.Entity
	members []opsync.Membership
}

func (f fakeReader) List(_ context.Context, _, entity string, _ bool) ([]opsync.Entity, error) {
	return f.lists[entity], nil
}
func (f fakeReader) Get(_ context.Context, _, entity, _ string) (opsync.Entity, error) {
	return f.gets[entity], nil
}
func (f fakeReader) Memberships(context.Context, string) ([]opsync.Membership, error) {
	return f.members, nil
}

func mustJSON(v any) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	return b
}
