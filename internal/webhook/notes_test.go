package webhook

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// TestNotesQueueNoDelivery (notes-overview): a standalone note is not a webhook
// subject, and a pending append (appends.<id>) on a task is no task.updated: the
// folded description is the readable change.
func TestNotesQueueNoDelivery(t *testing.T) {
	h := newHarness(t)
	rcv := newReceiver(t, 200)
	p := "P"
	// Every event but the note ones (note-webhooks: existing webhooks gain nothing).
	var taskEvents []string
	for _, e := range Events {
		if !strings.HasPrefix(e, "note.") {
			taskEvents = append(taskEvents, e)
		}
	}
	scoped := h.create("u1", rcv.srv.URL, taskEvents, &p)
	all := h.create("u1", rcv.srv.URL, taskEvents, nil)
	h.apply("u1", setOp("project", "P", "created_at", `1`), setOp("project", "P", "name", `"P"`))
	h.apply("u1", setOp("task", "t1", "created_at", `1`), setOp("task", "t1", "project_id", `"P"`))
	before := len(h.deliveries(scoped.ID))
	beforeAll := len(h.deliveries(all.ID))
	if before == 0 {
		t.Fatal("the task itself queued no delivery: the harness is not observing")
	}

	h.apply("u1",
		setOp("note", "n1", "created_at", `1`), setOp("note", "n1", "title", `"Meeting"`),
		setOp("note", "n1", "description", `"text"`), setOp("note", "n1", "project_id", `"P"`))
	h.apply("u1", setOp("note", "n1", "title", `"Meeting 2"`))
	h.apply("u1", setOp("note", "n1", "appends.a1", `"more"`))
	h.apply("u1", setOp("note", "n1", "deleted_at", `5`))
	h.apply("u1", setOp("task", "t1", "appends.a2", `"pending text"`))

	if n := len(h.deliveries(scoped.ID)); n != before {
		t.Fatalf("project webhook: %d deliveries from notes or appends", n-before)
	}
	if n := len(h.deliveries(all.ID)); n != beforeAll {
		for _, d := range h.deliveries(all.ID)[:n-beforeAll] {
			t.Logf("leaked delivery: %+v", d)
		}
		t.Fatalf("all-projects webhook: %d deliveries from notes or appends", n-beforeAll)
	}
}

// payloadOf is the stored body of a delivery.
func (h *harness) payloadOf(id string) map[string]any {
	h.t.Helper()
	var body string
	if err := h.db.QueryRow(`SELECT payload FROM webhook_deliveries WHERE id = ?`, id).Scan(&body); err != nil {
		h.t.Fatal(err)
	}
	var out map[string]any
	if err := json.Unmarshal([]byte(body), &out); err != nil {
		h.t.Fatal(err)
	}
	return out
}

// release runs the webhook job's release of held note events.
func (h *harness) release() {
	h.t.Helper()
	if err := h.hooks.releaseHeld(context.Background()); err != nil {
		h.t.Fatal(err)
	}
}

// note-webhooks: "One sitting, one delivery", "Title change", "Deleted while
// held", "Restore from the Trash", "Project filter".
func TestNoteEventsWaitForQuiet(t *testing.T) {
	h := newHarness(t)
	rcv := newReceiver(t, 200)
	home := "Home"
	w := h.create("u1", rcv.srv.URL, []string{"note.created", "note.updated", "note.deleted"}, nil)
	work := h.create("u1", rcv.srv.URL, []string{"note.created", "note.updated"}, &home)
	h.apply("u1", setOp("project", "Work", "created_at", `1`), setOp("project", "Work", "name", `"Work"`))

	// Twelve minutes of writing with pauses under a minute: nothing yet.
	h.apply("u1", setOp("note", "n1", "created_at", `1`), setOp("note", "n1", "title", `"Trip"`), setOp("note", "n1", "project_id", `"Work"`),
		setOp("note", "n1", "notes_doc", `""`))
	for i := 0; i < 12; i++ {
		h.clock.Advance(time.Minute)
		h.apply("u1", setOp("note", "n1", "description", `"day `+string(rune('a'+i))+`"`))
		h.release()
	}
	h.apply("u1", setOp("note", "n1", "title", `"Lisbon trip"`))
	if n := len(h.deliveries(w.ID)); n != 0 {
		t.Fatalf("%d deliveries while writing", n)
	}
	if at, ok, _ := h.hooks.NextDue(context.Background()); !ok || at.Sub(h.clock.Now()) != NoteQuiet {
		t.Fatalf("next due %v %v", at, ok)
	}
	h.clock.Advance(NoteQuiet)
	h.release()
	ds := h.deliveries(w.ID)
	if len(ds) != 1 || ds[0].Event != "note.created" {
		t.Fatalf("deliveries %+v", ds)
	}
	p := h.payloadOf(ds[0].ID)
	note := p["data"].(map[string]any)["note"].(map[string]any)
	if note["title"] != "Lisbon trip" || note["description"] != "day l" || note["notes_doc"] != nil || note["updated_at"] == nil {
		t.Fatalf("note %v", note)
	}
	ch := p["changes"].(map[string]any)
	if d, ok := ch["description"].(map[string]any); !ok || len(d) != 0 {
		t.Fatalf("description change %v", ch["description"])
	}
	if title := ch["title"].(map[string]any); title["to"] != "Lisbon trip" {
		t.Fatalf("title change %v", title)
	}
	if n := len(h.deliveries(work.ID)); n != 0 {
		t.Fatalf("project filter Home got %d", n)
	}

	// Edited, then moved to the Trash two minutes later: one note.deleted at once.
	h.apply("u1", setOp("note", "n1", "title", `"Lisbon"`))
	h.clock.Advance(2 * time.Minute)
	h.apply("u1", setOp("note", "n1", "deleted_at", `5`))
	h.clock.Advance(NoteHoldCap)
	h.release()
	ds = h.deliveries(w.ID)
	if len(ds) != 2 || ds[0].Event != "note.deleted" {
		t.Fatalf("after delete %+v", ds)
	}

	// Restored: a note.updated whose changes name deleted_at.
	h.apply("u1", setOp("note", "n1", "deleted_at", `null`))
	h.clock.Advance(NoteQuiet)
	h.release()
	ds = h.deliveries(w.ID)
	if len(ds) != 3 || ds[0].Event != "note.updated" {
		t.Fatalf("after restore %+v", ds)
	}
	del := h.payloadOf(ds[0].ID)["changes"].(map[string]any)["deleted_at"].(map[string]any)
	if del["from"] != float64(5) || del["to"] != nil {
		t.Fatalf("restore change %v", del)
	}
}

// note-webhooks: "Long session" and "Restart while held".
func TestNoteEventsCapAndRestart(t *testing.T) {
	h := newHarness(t)
	rcv := newReceiver(t, 200)
	w := h.create("u1", rcv.srv.URL, []string{"note.created", "note.updated"}, nil)
	h.apply("u1", setOp("note", "n2", "created_at", `1`), setOp("note", "n2", "title", `"Log"`))
	h.clock.Advance(NoteQuiet)
	h.release()
	// Forty minutes without a five-minute pause: one delivery at the cap.
	for i := 0; i < 40; i++ {
		h.clock.Advance(time.Minute)
		h.apply("u1", setOp("note", "n2", "description", `"line`+strings.Repeat(".", i)+`"`))
		h.release()
	}
	ds := h.deliveries(w.ID)
	if len(ds) != 2 || ds[0].Event != "note.updated" {
		t.Fatalf("long session %+v", ds)
	}
	// The next one is held; a restart keeps it and releases it when due.
	h.open()
	h.clock.Advance(10 * time.Minute)
	h.drain()
	if ds := h.deliveries(w.ID); len(ds) != 3 {
		t.Fatalf("after restart %+v", ds)
	}
}

// note-webhooks: "Shared project member" and "A routine's note".
func TestNoteEventsMembersAndSource(t *testing.T) {
	h := newHarness(t)
	rcv := newReceiver(t, 200)
	h.apply("u1", setOp("project", "R", "created_at", `1`), setOp("project", "R", "name", `"Renovation"`))
	if _, err := h.sync.AddMember(context.Background(), "u1", "R", "u2", opsync.RoleEditor); err != nil {
		t.Fatal(err)
	}
	anna := h.create("u2", rcv.srv.URL, []string{"note.updated", "note.created"}, nil)
	ops := []opsync.Op{setOp("note", "n3", "created_at", `1`), setOp("note", "n3", "project_id", `"R"`), setOp("note", "n3", "title", `"Tiles"`)}
	for i := range ops {
		ops[i].Device = opsync.RuleDevicePrefix + "r1"
	}
	h.apply("u1", ops...)
	h.clock.Advance(NoteQuiet)
	h.release()
	ds := h.deliveries(anna.ID)
	if len(ds) != 1 {
		t.Fatalf("anna %+v", ds)
	}
	if p := h.payloadOf(ds[0].ID); p["source"] != "rule" {
		t.Fatalf("source %v", p["source"])
	}
}
