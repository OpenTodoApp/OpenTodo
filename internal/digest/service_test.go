package digest

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime/quotedprintable"
	"strings"
	gosync "sync"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/mail"
	"github.com/pixari/opentodo/internal/mail/smtptest"
	"github.com/pixari/opentodo/internal/settings"
	"github.com/pixari/opentodo/internal/store"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// flaky is a real SMTP transport to the in-process sink that can be "down".
type flaky struct {
	mu   gosync.Mutex
	down bool
	real mail.Transport
}

func (f *flaky) Send(ctx context.Context, c mail.Config, to string, data []byte) error {
	f.mu.Lock()
	down := f.down
	f.mu.Unlock()
	if down {
		return &mail.SendError{Stage: mail.StageConnect, Reply: "connection refused"}
	}
	return f.real.Send(ctx, c, to, data)
}

func (f *flaky) set(down bool) { f.mu.Lock(); f.down = down; f.mu.Unlock() }

type fakeE2EE map[string]bool

func (f fakeE2EE) Enabled(_ context.Context, id string) (bool, error) { return f[id], nil }

type env struct {
	t     *testing.T
	db    *sql.DB
	sync  *opsync.Service
	mail  *mail.Service
	smtp  *smtptest.Server
	tr    *flaky
	clock time.Time
	e2ee  fakeE2EE
	seq   int
}

var zurich, _ = time.LoadLocation("Europe/Zurich")

// at is a wall-clock time in Zurich; 2026-10-23 is a Friday.
func at(s string) time.Time {
	t, err := time.ParseInLocation("2006-01-02 15:04", s, zurich)
	if err != nil {
		panic(err)
	}
	return t
}

func newEnv(t *testing.T) *env {
	t.Helper()
	dir := t.TempDir()
	db, err := store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if _, err := db.Exec(`INSERT INTO users(id,email,password_hash,role,created_at) VALUES('u1','ana@example.com','x','owner',1),('u2','bob@example.com','x','member',1)`); err != nil {
		t.Fatal(err)
	}
	e := &env{t: t, db: db, sync: opsync.NewService(db), smtp: smtptest.New(t, smtptest.Options{NoSTARTTLS: true, NoAuth: true}), tr: &flaky{}, e2ee: fakeE2EE{}}
	e.mail = mail.New(settings.New(db), dir, mail.Options{
		Env:       config.SMTPConfig{Host: e.smtp.Host, Port: e.smtp.Port, Security: "none", From: "OpenTodo <todo@example.com>"},
		Audit:     audit.New(db, nil),
		Transport: e.tr,
		Now:       func() time.Time { return e.clock },
		Log:       slog.New(slog.NewTextHandler(io.Discard, nil)),
	})
	return e
}

// service is a fresh digest service, as after a restart.
func (e *env) service() *Service {
	return New(e.db, e.sync, e.mail, Options{Origin: "https://todo.example.com", Now: func() time.Time { return e.clock }, E2EE: e.e2ee,
		Log: slog.New(slog.NewTextHandler(io.Discard, nil))})
}

func (e *env) apply(user string, fields map[string]map[string]any) {
	e.t.Helper()
	var ops []opsync.Op
	for key, f := range fields {
		entity, id, _ := strings.Cut(key, ":")
		for field, v := range f {
			raw, _ := json.Marshal(v)
			e.seq++
			ops = append(ops, opsync.Op{ID: fmt.Sprintf("op-%d", e.seq), Entity: entity, EntityID: id, Field: field, Value: raw, TS: int64(e.seq), Device: "dev-" + user})
		}
	}
	if _, err := e.sync.Apply(context.Background(), user, ops); err != nil {
		e.t.Fatal(err)
	}
}

func (e *env) enable(user string) {
	e.t.Helper()
	if _, err := NewStore(e.db, nil).Put(context.Background(), Settings{UserID: user, Enabled: true, Weekday: 5, Hour: 7, TimeZone: "Europe/Zurich", Lang: "en"}); err != nil {
		e.t.Fatal(err)
	}
}

func (e *env) tick(s *Service, when string) int {
	e.t.Helper()
	e.clock = at(when)
	n, err := s.Tick(context.Background())
	if err != nil {
		e.t.Fatal(err)
	}
	return n
}

func (e *env) audit(name audit.Name) []string {
	rows, err := e.db.Query(`SELECT details FROM audit_events WHERE name = ? ORDER BY rowid`, name)
	if err != nil {
		e.t.Fatal(err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var s string
		rows.Scan(&s)
		out = append(out, s)
	}
	return out
}

func body(m smtptest.Message) string {
	_, raw, _ := strings.Cut(strings.ReplaceAll(string(m.Data), "\r\n", "\n"), "\n\n")
	b, _ := io.ReadAll(quotedprintable.NewReader(strings.NewReader(raw)))
	return string(b)
}

// TestSentOnceBefore0715 (email-digest "Sent once"): one message within 15
// minutes of the hour, email.sent with kind digest, nothing more that day even
// after a restart.
func TestSentOnceBefore0715(t *testing.T) {
	e := newEnv(t)
	e.enable("u1")
	s := e.service()
	if n := e.tick(s, "2026-10-23 06:58"); n != 0 {
		t.Fatalf("sent %d before the hour", n)
	}
	if n := e.tick(s, "2026-10-22 07:03"); n != 0 { // Thursday
		t.Fatalf("sent %d on another weekday", n)
	}
	if n := e.tick(s, "2026-10-23 07:03"); n != 1 {
		t.Fatalf("sent %d at 07:03", n)
	}
	if n := e.tick(s, "2026-10-23 07:08"); n != 0 {
		t.Fatalf("second send at 07:08: %d", n)
	}
	if n := e.tick(e.service(), "2026-10-23 07:13"); n != 0 {
		t.Fatalf("second send after a restart: %d", n)
	}
	if got := len(e.smtp.Messages()); got != 1 {
		t.Fatalf("sink received %d messages", got)
	}
	if sent := e.audit(audit.EmailSentName); len(sent) != 1 || !strings.Contains(sent[0], `"email_kind":"digest"`) {
		t.Fatalf("email.sent = %v", sent)
	}
	st, _ := NewStore(e.db, nil).Get(context.Background(), "u1")
	if st.LastSentFor != "2026-10-23" || st.LastOutcome != OutcomeSent {
		t.Fatalf("state = %+v", st)
	}
	// The next Friday sends again.
	if n := e.tick(s, "2026-10-30 07:01"); n != 1 {
		t.Fatalf("next week sent %d", n)
	}
}

// TestRelayDownForAnHour (email-digest "Relay down for an hour"): retries come
// every RetryEvery, each failed attempt records email.failed, and the first
// attempt after the relay is back sends. Retries never hit the per-recipient limit.
func TestRelayDownForAnHour(t *testing.T) {
	e := newEnv(t)
	e.enable("u1")
	s := e.service()
	e.tr.set(true)
	for m := 0; m < 60; m += 5 {
		e.tick(s, fmt.Sprintf("2026-10-23 07:%02d", m))
	}
	failed := e.audit(audit.EmailFailedName)
	if len(failed) != 4 { // 07:00, 07:15, 07:30, 07:45
		t.Fatalf("email.failed = %d, want one per failed attempt (4): %v", len(failed), failed)
	}
	for _, f := range failed {
		if !strings.Contains(f, `"reason":"connect"`) {
			t.Fatalf("failure reason = %s", f)
		}
	}
	st, _ := NewStore(e.db, nil).Get(context.Background(), "u1")
	if st.LastOutcome != mail.StageConnect || st.LastSentFor != "" {
		t.Fatalf("state while down = %+v", st)
	}
	e.tr.set(false)
	if n := e.tick(s, "2026-10-23 08:00"); n != 1 {
		t.Fatalf("sent %d after the relay came back", n)
	}
	if len(e.smtp.Messages()) != 1 {
		t.Fatal("sink did not receive the digest")
	}
}

// TestSkippedAfterSixHours: a relay down for the whole window gives up once,
// with email.failed reason skipped, and nothing is sent that day.
func TestSkippedAfterSixHours(t *testing.T) {
	e := newEnv(t)
	e.enable("u1")
	s := e.service()
	e.tr.set(true)
	for h := 7; h < 13; h++ {
		e.tick(s, fmt.Sprintf("2026-10-23 %02d:00", h))
	}
	e.tr.set(false)
	if n := e.tick(s, "2026-10-23 13:00"); n != 0 {
		t.Fatalf("sent %d after the window", n)
	}
	failed := e.audit(audit.EmailFailedName)
	if !strings.Contains(failed[len(failed)-1], `"reason":"skipped"`) {
		t.Fatalf("last email.failed = %v", failed[len(failed)-1])
	}
	e.tick(s, "2026-10-23 13:05")
	if got := len(e.audit(audit.EmailFailedName)); got != len(failed) {
		t.Fatal("skipped was recorded twice")
	}
	st, _ := NewStore(e.db, nil).Get(context.Background(), "u1")
	if st.LastOutcome != OutcomeSkipped || st.LastSentFor != "2026-10-23" || len(e.smtp.Messages()) != 0 {
		t.Fatalf("state = %+v, messages %d", st, len(e.smtp.Messages()))
	}
}

// TestEncryptedAccountRefused (email-digest "Encryption turns the digest off"):
// a scheduled send that meets an encrypted account builds nothing, records
// encrypted_account and turns the digest off.
func TestEncryptedAccountRefused(t *testing.T) {
	e := newEnv(t)
	e.enable("u1")
	e.e2ee["u1"] = true
	if n := e.tick(e.service(), "2026-10-23 07:01"); n != 0 || len(e.smtp.Messages()) != 0 {
		t.Fatalf("sent %d to an encrypted account", n)
	}
	failed := e.audit(audit.EmailFailedName)
	if len(failed) != 1 || !strings.Contains(failed[0], `"reason":"encrypted_account"`) {
		t.Fatalf("email.failed = %v", failed)
	}
	if st, _ := NewStore(e.db, nil).Get(context.Background(), "u1"); st.Enabled {
		t.Fatal("digest still enabled")
	}
}

// TestDigestContent (email-digest "Content" and "Shared project tasks"): last
// week's numbers, the overdue tasks, the project without a next action, the
// last review and the review link; another member's overdue task is not listed.
func TestDigestContent(t *testing.T) {
	e := newEnv(t)
	e.enable("u1")
	ms := func(s string) int64 { return at(s).UnixMilli() }
	fields := map[string]map[string]any{
		"project:work":   {"name": "Work", "position": 1},
		"project:garage": {"name": "Garage", "position": 2},
		"project:home":   {"name": "Home", "position": 3},
		"task:o1":        {"title": "Renew passport", "due": map[string]string{"date": "2026-10-20"}, "created_at": ms("2026-10-01 09:00"), "completed_at": nil},
		"task:o2":        {"title": "File taxes", "project_id": "work", "due": map[string]string{"date": "2026-10-21"}, "created_at": ms("2026-10-01 09:00"), "completed_at": nil},
		"task:g1":        {"title": "Sweep", "project_id": "garage", "created_at": ms("2026-10-01 09:00"), "completed_at": ms("2026-10-02 09:00")},
		"task:soon":      {"title": "Dentist", "project_id": "work", "due": map[string]string{"date": "2026-10-26"}, "created_at": ms("2026-10-01 09:00"), "completed_at": nil},
		"review:me":      {"completed_at": ms("2026-10-16 18:00")},
		"user_prefs:me":  {"week_start": "mon"},
	}
	for i := 0; i < 12; i++ {
		fields[fmt.Sprintf("task:d%d", i)] = map[string]any{"title": fmt.Sprintf("Done %d", i), "project_id": "work",
			"created_at": ms("2026-10-01 09:00"), "completed_at": ms(fmt.Sprintf("2026-10-%02d 10:00", 12+i%7))}
	}
	e.apply("u1", fields)
	// A shared project whose overdue task is assigned to Bob.
	e.apply("u1", map[string]map[string]any{"project:home": {"name": "Home"}, "task:h0": {"title": "Ana's open task", "project_id": "home", "created_at": ms("2026-10-01 09:00"), "completed_at": nil}})
	if _, err := e.sync.AddMember(context.Background(), "u1", "home", "u2", "editor"); err != nil {
		t.Fatal(err)
	}
	e.apply("u1", map[string]map[string]any{"task:h1": {"title": "Bob's chore", "project_id": "home", "assignee_id": "u2", "due": map[string]string{"date": "2026-10-19"}, "created_at": ms("2026-10-01 09:00"), "completed_at": nil}})

	if n := e.tick(e.service(), "2026-10-23 07:02"); n != 1 {
		t.Fatalf("sent %d", n)
	}
	msg := e.smtp.Messages()[0]
	text := body(msg)
	for _, want := range []string{
		"Last week (Mon 12 Oct – Sun 18 Oct)", "Completed: 12",
		"- Renew passport · Tue 20 Oct · Inbox", "- File taxes · Wed 21 Oct · Work",
		"- Dentist · Mon 26 Oct · Work", "Projects without a next action\n  - Garage\n",
		"Last review: Fri 16 Oct", "\nhttps://todo.example.com/review\n",
	} {
		if !strings.Contains(text, want) {
			t.Fatalf("digest lacks %q:\n%s\n---\n%s", want, text, msg.Data)
		}
	}
	if strings.Contains(text, "Bob's chore") {
		t.Fatalf("another member's task is listed:\n%s", text)
	}
	if !strings.Contains(string(msg.Data), "Subject: ") || msg.To[0] != "ana@example.com" {
		t.Fatalf("envelope = %+v", msg.To)
	}
}

func TestStoreValidationAndNextSend(t *testing.T) {
	e := newEnv(t)
	st := NewStore(e.db, nil)
	ctx := context.Background()
	for _, c := range []struct {
		s     Settings
		field string
	}{
		{Settings{UserID: "u1", Weekday: 5, Hour: 24, TimeZone: "UTC", Lang: "en"}, "hour"},
		{Settings{UserID: "u1", Weekday: 7, Hour: 7, TimeZone: "UTC", Lang: "en"}, "weekday"},
		{Settings{UserID: "u1", Weekday: 5, Hour: 7, TimeZone: "Mars/Olympus", Lang: "en"}, "timeZone"},
		{Settings{UserID: "u1", Weekday: 5, Hour: 7, TimeZone: "UTC", Lang: "ja"}, "language"},
	} {
		var ie *InvalidError
		if _, err := st.Put(ctx, c.s); !errors.As(err, &ie) || ie.Field != c.field {
			t.Fatalf("%+v: err = %v", c.s, err)
		}
	}
	got, err := st.Get(ctx, "u1")
	if err != nil || got.Enabled || got.Weekday != 5 || got.Hour != 7 {
		t.Fatalf("defaults = %+v %v", got, err)
	}
	e.enable("u1")
	if on, _ := st.Disable(ctx, "u1"); !on {
		t.Fatal("disable reported nothing to do")
	}
	got, _ = st.Get(ctx, "u1")
	got.Enabled = true
	// Wednesday 2026-10-21 noon: next Friday 07:00 Zurich.
	if next := NextSendAt(got, at("2026-10-21 12:00")); !next.Equal(at("2026-10-23 07:00")) {
		t.Fatalf("next = %v", next)
	}
	// Inside today's window and not sent yet: today's hour.
	if next := NextSendAt(got, at("2026-10-23 08:00")); !next.Equal(at("2026-10-23 07:00")) {
		t.Fatalf("next = %v", next)
	}
	got.LastSentFor = "2026-10-23"
	if next := NextSendAt(got, at("2026-10-23 08:00")); !next.Equal(at("2026-10-30 07:00")) {
		t.Fatalf("next after sending = %v", next)
	}
}
