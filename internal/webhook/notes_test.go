package webhook

import "testing"

// TestNotesQueueNoDelivery (notes-overview): a standalone note is not a webhook
// subject, and a pending append (appends.<id>) on a task is no task.updated: the
// folded description is the readable change.
func TestNotesQueueNoDelivery(t *testing.T) {
	h := newHarness(t)
	rcv := newReceiver(t, 200)
	p := "P"
	scoped := h.create("u1", rcv.srv.URL, Events, &p)
	all := h.create("u1", rcv.srv.URL, Events, nil)
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
