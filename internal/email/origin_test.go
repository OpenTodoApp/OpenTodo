package email

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/origin"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// The Message-ID becomes the task's origin (OpenSpec change task-origin,
// email-capture "Message becomes a task", design D5).
func TestTaskOriginIsTheMessageID(t *testing.T) {
	h := newHarness(t)
	in := h.inbox("alice")
	raw := message(in.Secret, "<a1@mail.example>", "Alice <alice@example.org>", "Invoice", "x")
	if out, err := h.proc.Process(h.ctx, raw); err != nil || out != Created {
		t.Fatalf("first = %s, %v", out, err)
	}
	tasks := h.tasks("alice")
	if len(tasks) != 1 {
		t.Fatalf("tasks = %d", len(tasks))
	}
	o, err := origin.Decode(tasks[0]["origin"])
	if err != nil || o != (origin.Origin{Kind: "email", ID: "<a1@mail.example>"}) {
		t.Fatalf("origin = %s (%v)", tasks[0]["origin"], err)
	}
	if strings.Contains(string(tasks[0]["origin"]), "alice@example.org") {
		t.Fatal("the sender is in the origin")
	}
	// A second poll of the same message adds no op (same op ids, receipt kept or not).
	before := h.count(`SELECT COUNT(*) FROM ops WHERE user_id = 'alice'`)
	if _, err := h.db.Exec(`DELETE FROM email_receipts`); err != nil {
		t.Fatal(err)
	}
	h.clock = h.clock.Add(time.Minute)
	if out, _ := h.proc.Process(h.ctx, raw); out != Duplicate {
		t.Fatalf("replay = %s", out)
	}
	if after := h.count(`SELECT COUNT(*) FROM ops WHERE user_id = 'alice'`); after != before {
		t.Fatalf("ops %d -> %d", before, after)
	}
}

func TestNoOriginWithoutARealMessageID(t *testing.T) {
	for name, header := range map[string]string{
		"missing":   "",
		"over-long": "<" + strings.Repeat("a", 600) + "@mail.example>",
	} {
		raw := "From: a@example.org\nSubject: s\n"
		if header != "" {
			raw = "Message-ID: " + header + "\n" + raw
		}
		p, err := Parse([]byte(raw + "\nbody"))
		if err != nil {
			t.Fatal(err)
		}
		for _, op := range taskOps("u1", p, time.Unix(1_760_000_000, 0), 1_760_000_000_000) {
			if op.Field == "origin" {
				t.Fatalf("%s: origin op %s", name, op.Value)
			}
		}
	}
	// A parsed message whose header id exceeds the origin limit gets none either.
	p := &Parsed{MessageID: "x", HeaderMessageID: strings.Repeat("é", origin.MaxID+1), Title: "t"}
	for _, op := range taskOps("u1", p, time.Unix(1_760_000_000, 0), 1_760_000_000_000) {
		if op.Field == "origin" {
			t.Fatal("over-long id became an origin")
		}
	}
	// And a normal one validates on the sync path.
	p = &Parsed{MessageID: "<a1@mail.example>", HeaderMessageID: "<a1@mail.example>", Title: "t"}
	found := false
	for _, op := range taskOps("u1", p, time.Unix(1_760_000_000, 0), 1_760_000_000_000) {
		if err := opsync.Validate(op); err != nil {
			t.Fatalf("%s: %v", op.Field, err)
		}
		if op.Field == "origin" {
			var o map[string]string
			_ = json.Unmarshal(op.Value, &o)
			found = o["kind"] == "email" && o["id"] == "<a1@mail.example>" && len(o) == 2
		}
	}
	if !found {
		t.Fatal("no origin op")
	}
}
