package sync

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/pixari/opentodo/internal/e2ee"
	"github.com/pixari/opentodo/internal/notify"
)

// envelope builds a ciphertext envelope of n payload bytes (nonce + ciphertext +
// tag); the server never decrypts, so random-looking bytes are enough.
func envelope(n int, fill byte) string {
	b := make([]byte, n)
	for i := range b {
		b[i] = fill + byte(i)
	}
	return e2ee.PrefixV1 + base64.RawURLEncoding.EncodeToString(b)
}

func quoted(s string) string { b, _ := json.Marshal(s); return string(b) }

// TestCiphertextValuesValidateUnchanged: ciphertext is an ordinary string value
// under the existing schema and limits (OpenSpec e2ee, task 3.2). Every content
// field accepts it; a value over MaxValueBytes is refused with ErrInvalidOp like
// any other oversized value.
func TestCiphertextValuesValidateUnchanged(t *testing.T) {
	for entity, fields := range e2ee.ContentFields {
		for _, f := range fields {
			o := op("o-"+entity+f, entity, "e1", f, quoted(envelope(60, 1)), 100, "A")
			if err := Validate(o); err != nil {
				t.Errorf("%s.%s ciphertext refused: %v", entity, f, err)
			}
			if _, ok := Schema[entity][f]; !ok {
				t.Errorf("content field %s.%s is not in the op schema", entity, f)
			}
		}
	}
	// The largest description the client allows (48,000 plaintext bytes) fits.
	if err := Validate(op("big", "task", "t1", "description", quoted(envelope(12+48000+16, 2)), 100, "A")); err != nil {
		t.Fatalf("maximal ciphertext refused: %v", err)
	}
	tooBig := op("huge", "task", "t1", "description", quoted(envelope(MaxValueBytes, 3)), 100, "A")
	if err := Validate(tooBig); !errors.Is(err, ErrInvalidOp) {
		t.Fatalf("oversized ciphertext: %v, want ErrInvalidOp", err)
	}
}

// TestCiphertextConvergence: last-writer-wins picks winners by (ts, device) on
// ciphertext exactly as on plaintext, in any order and with duplicates; a
// concurrent plaintext field edit is unaffected.
func TestCiphertextConvergence(t *testing.T) {
	ctx := context.Background()
	a1 := op("a1", "task", "t1", "title", quoted(envelope(40, 10)), 200, "A")
	b1 := op("b1", "task", "t1", "title", quoted(envelope(40, 20)), 300, "B")
	b2 := op("b2", "task", "t1", "due", `{"date":"2026-10-12"}`, 300, "B")
	orders := [][]Op{{a1, b1, b2}, {b2, b1, a1}, {b1, a1, b1, b2, a1}}
	var want string
	for i, ops := range orders {
		s := newTestService(t)
		for _, o := range ops {
			if _, err := s.Apply(ctx, "u1", []Op{o}); err != nil {
				t.Fatal(err)
			}
		}
		e, err := s.Get(ctx, "u1", "task", "t1")
		if err != nil {
			t.Fatal(err)
		}
		got := string(e["title"]) + "|" + string(e["due"])
		if string(e["title"]) != string(b1.Value) {
			t.Fatalf("order %d: title = %s, want the later write", i, e["title"])
		}
		if i == 0 {
			want = got
		} else if got != want {
			t.Fatalf("order %d diverged: %s vs %s", i, got, want)
		}
	}
}

// TestNotificationsNeverShowCiphertext: server-built notification text uses the
// placeholder instead of an envelope (assignment and mention titles).
func TestNotificationsNeverShowCiphertext(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	rec := &recordingSink{s: f.s}
	f.s.AddSink(rec)
	f.apply("alice", "A", f.op("task", "t1", "title", quoted(envelope(40, 5))))
	f.apply("alice", "A", f.op("task", "t1", "assignee_id", `"bob"`))
	if len(rec.events) != 1 {
		t.Fatalf("events = %+v", rec.events)
	}
	if got := rec.events[0].TaskTitle; got != e2ee.Placeholder || strings.Contains(got, "enc:") {
		t.Fatalf("task title in notification = %q", got)
	}
	var _ notify.Sink = rec
}

func TestPurgeSupersededContentScope(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	// A superseded title in the shared project and one in alice's personal scope.
	f.apply("alice", "A", f.op("task", "t1", "title", `"Oat milk"`), f.op("task", "inbox", "title", quoted(envelope(40, 9))))
	n, err := f.s.PurgeSupersededContent(f.ctx, "alice", e2ee.ContentFields)
	if err != nil {
		t.Fatal(err)
	}
	// Only the personal scope's superseded content op ("Private") goes; the
	// shared project's history and every winner stay.
	if n != 1 {
		t.Fatalf("purged %d, want 1", n)
	}
	var shared int
	_ = f.s.db.QueryRow(`SELECT COUNT(*) FROM ops WHERE entity_id = 't1' AND field = 'title'`).Scan(&shared)
	if shared != 2 {
		t.Fatalf("shared title ops = %d, want 2", shared)
	}
	e, _ := f.s.Get(f.ctx, "alice", "task", "inbox")
	if !e2ee.IsCiphertextJSON(e["title"]) {
		t.Fatalf("winner lost: %s", e["title"])
	}
}
