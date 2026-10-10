package email

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/mail"
	"strings"
	"testing"
	"time"
)

func TestRouteRecipient(t *testing.T) {
	cases := []struct {
		name   string
		header string
		secret string
		ok     bool
	}{
		{"to", "To: todo+abc@example.com", "abc", true},
		{"display name and case", "To: \"Todo\" <ToDo+AbC@Example.COM>", "abc", true},
		{"delivered-to first", "Delivered-To: todo+first@example.com\nTo: todo+second@example.com", "first", true},
		{"x-original-to before to", "X-Original-To: todo+orig@example.com\nTo: someone@else.example", "orig", true},
		{"cc", "To: a@b.example\nCc: x@y.example, todo+cc@example.com", "cc", true},
		{"plain address skipped", "Delivered-To: todo@example.com\nTo: todo+later@example.com", "later", true},
		{"other domain", "To: todo+abc@example.net", "", false},
		{"other local part", "To: tasks+abc@example.com", "", false},
		{"empty secret", "To: todo+@example.com", "", false},
		{"no recipients", "Subject: x", "", false},
		{"malformed list falls back", "To: broken <<todo+fb@example.com>", "fb", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			msg, err := mail.ReadMessage(strings.NewReader(tc.header + "\n\nbody"))
			if err != nil {
				t.Fatal(err)
			}
			got, ok := Route(msg.Header, "todo", "example.com")
			if ok != tc.ok || got != tc.secret {
				t.Fatalf("Route = %q, %v; want %q, %v", got, ok, tc.secret, tc.ok)
			}
		})
	}
}

func TestProcessCreatesTaskOnce(t *testing.T) {
	h := newHarness(t)
	in := h.inbox("alice")
	raw := message(in.Secret, "<once@example.org>", "Alice <alice@example.org>", "Fwd: Renew passport", "Appointment link inside.")
	out, err := h.proc.Process(h.ctx, raw)
	if err != nil || out != Created {
		t.Fatalf("first = %s, %v", out, err)
	}
	out, err = h.proc.Process(h.ctx, raw)
	if err != nil || out != Duplicate {
		t.Fatalf("second = %s, %v", out, err)
	}
	tasks := h.tasks("alice")
	if len(tasks) != 1 {
		t.Fatalf("tasks = %d", len(tasks))
	}
	tk := tasks[0]
	var title, desc string
	var prio float64
	_ = json.Unmarshal(tk["title"], &title)
	_ = json.Unmarshal(tk["description"], &desc)
	_ = json.Unmarshal(tk["priority"], &prio)
	if title != "Renew passport" || desc != "Appointment link inside." || prio != 4 {
		t.Fatalf("task = %s / %s / %v", title, desc, prio)
	}
	if v, ok := tk["due"]; ok && string(v) != "null" {
		t.Fatalf("due = %s", v)
	}
	if v, ok := tk["project_id"]; ok && string(v) != "null" {
		t.Fatalf("project_id = %s", v)
	}
	// The ops carry device "server".
	if n := h.count(`SELECT COUNT(*) FROM ops WHERE user_id = 'alice' AND device = 'server' AND entity_id = ?`, TaskID("alice", "<once@example.org>")); n != 5 {
		t.Fatalf("server ops = %d", n)
	}
	if len(h.tasks("bob")) != 0 {
		t.Fatal("task leaked to another account")
	}
}

func TestProcessReplayAfterCrash(t *testing.T) {
	// A crash after Apply but before the receipt: the receipt is missing, the
	// replay produces only duplicate ops and still no second task.
	h := newHarness(t)
	in := h.inbox("alice")
	raw := message(in.Secret, "<crash@example.org>", "alice@example.org", "Crash", "x")
	if out, _ := h.proc.Process(h.ctx, raw); out != Created {
		t.Fatal(out)
	}
	if _, err := h.db.Exec(`DELETE FROM email_receipts`); err != nil {
		t.Fatal(err)
	}
	h.clock = h.clock.Add(time.Minute)
	out, err := h.proc.Process(h.ctx, raw)
	if err != nil || out != Duplicate {
		t.Fatalf("replay = %s, %v", out, err)
	}
	if n := len(h.tasks("alice")); n != 1 {
		t.Fatalf("tasks = %d", n)
	}
}

func TestRateCap(t *testing.T) {
	h := newHarness(t)
	in := h.inbox("alice")
	counts := map[Outcome]int{}
	for i := 0; i < 70; i++ {
		raw := message(in.Secret, fmt.Sprintf("<m%d@example.org>", i), "alice@example.org", fmt.Sprintf("Task %d", i), "x")
		out, err := h.proc.Process(h.ctx, raw)
		if err != nil {
			t.Fatal(err)
		}
		counts[out]++
		h.clock = h.clock.Add(10 * time.Second)
	}
	if counts[Created] != 60 || counts[RateLimited] != 10 {
		t.Fatalf("counts = %v", counts)
	}
	if n := len(h.tasks("alice")); n != 60 {
		t.Fatalf("tasks = %d", n)
	}
	// An hour after the first message the window has room again.
	h.clock = h.clock.Add(time.Hour)
	if out, _ := h.proc.Process(h.ctx, message(in.Secret, "<later@example.org>", "alice@example.org", "Later", "x")); out != Created {
		t.Fatalf("after the window: %s", out)
	}
}

func TestAllowlistRejects(t *testing.T) {
	h := newHarness(t)
	in := h.inbox("alice")
	list, _ := NormalizeAllowlist([]string{"alice@example.org"})
	if _, err := h.store.Update(h.ctx, "alice", nil, list); err != nil {
		t.Fatal(err)
	}
	if out, _ := h.proc.Process(h.ctx, message(in.Secret, "<a@x>", "Mallory <mallory@evil.example>", "Hi", "x")); out != NotAllowed {
		t.Fatalf("stranger = %s", out)
	}
	if out, _ := h.proc.Process(h.ctx, message(in.Secret, "<b@x>", "Alice <ALICE@example.org>", "Hi", "x")); out != Created {
		t.Fatalf("allowed sender = %s", out)
	}
	if n := len(h.tasks("alice")); n != 1 {
		t.Fatalf("tasks = %d", n)
	}
}

func TestUnknownSecretDiscarded(t *testing.T) {
	h := newHarness(t)
	in := h.inbox("alice")
	var logBuf bytes.Buffer
	h.proc.log = slog.New(slog.NewTextHandler(&logBuf, &slog.HandlerOptions{Level: slog.LevelInfo}))
	cases := map[string]Outcome{
		string(message("zzzzzzzzzzzzzzzzzzzzzzzzzz", "<u1@x>", "x@y.example", "Secret subject", "secret body")): UnknownInbox,
		string(message("short", "<u2@x>", "x@y.example", "Secret subject", "secret body")):                      UnknownInbox,
		"From: x@y.example\r\nTo: someone@example.com\r\nSubject: Secret subject\r\n\r\nsecret body":                Unroutable,
	}
	for raw, want := range cases {
		if out, err := h.proc.Process(h.ctx, []byte(raw)); err != nil || out != want {
			t.Fatalf("outcome = %s, %v; want %s", out, err, want)
		}
	}
	if len(h.tasks("alice")) != 0 || len(h.tasks("bob")) != 0 {
		t.Fatal("a task was created")
	}
	if strings.Contains(logBuf.String(), "Secret subject") || strings.Contains(logBuf.String(), "secret body") {
		t.Fatalf("content logged: %s", logBuf.String())
	}
	// Rotation: the old address stops at once.
	old := in.Secret
	if _, err := h.store.Rotate(h.ctx, "alice"); err != nil {
		t.Fatal(err)
	}
	if out, _ := h.proc.Process(h.ctx, message(old, "<r@x>", "x@y.example", "Old", "x")); out != UnknownInbox {
		t.Fatalf("old address = %s", out)
	}
}

func TestProcessRefusesDisabledAndDeactivated(t *testing.T) {
	h := newHarness(t)
	alice, bob := h.inbox("alice"), h.inbox("bob")
	off := false
	if _, err := h.store.Update(h.ctx, "alice", &off, nil); err != nil {
		t.Fatal(err)
	}
	if out, _ := h.proc.Process(h.ctx, message(alice.Secret, "<d1@x>", "x@y.example", "Off", "x")); out != Disabled {
		t.Fatalf("disabled = %s", out)
	}
	if _, err := h.db.Exec(`INSERT INTO user_status(user_id, deactivated_at) VALUES('bob', 1)`); err != nil {
		t.Fatal(err)
	}
	if out, _ := h.proc.Process(h.ctx, message(bob.Secret, "<d2@x>", "x@y.example", "Gone", "x")); out != Deactivated {
		t.Fatalf("deactivated = %s", out)
	}
	if out, _ := h.proc.Process(h.ctx, append([]byte("Subject: x\n\n"), bytes.Repeat([]byte("a"), MaxMessageBytes)...)); out != TooLarge {
		t.Fatalf("large = %s", out)
	}
}
