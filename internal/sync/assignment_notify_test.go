package sync

import (
	"context"
	"testing"

	"github.com/pixari/opentodo/internal/notify"
)

// recordingSink checks, from inside the sink, that the batch is already visible.
type recordingSink struct {
	s      *Service
	events []notify.Assigned
	seen   []string // assignee_id as read by the sink at emission time
}

func (r *recordingSink) Assigned(ctx context.Context, e notify.Assigned) {
	r.events = append(r.events, e)
	got, _ := r.s.Get(ctx, e.AssigneeID, "task", e.TaskID)
	r.seen = append(r.seen, string(got["assignee_id"]))
}

func TestAssignmentEmitsNotificationAfterCommit(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	f.add("alice", "carol", RoleViewer)
	rec := &recordingSink{s: f.s}
	inbox := notify.NewInApp(f.s.db, nil)
	f.s.AddSink(nil) // ignored
	f.s.AddSink(rec)
	f.s.AddSink(inbox)
	f.apply("alice", "A", f.op("task", "t1", "assignee_id", `"bob"`))
	if len(rec.events) != 1 {
		t.Fatalf("events = %+v", rec.events)
	}
	e := rec.events[0]
	if e.AssigneeID != "bob" || e.ActorID != "alice" || e.ActorName != "alice" || e.TaskID != "t1" || e.TaskTitle != "Milk" ||
		e.ProjectID != "p" || e.ProjectName != "Home" || e.At == 0 {
		t.Fatalf("event = %+v", e)
	}
	if rec.seen[0] != `"bob"` {
		t.Fatalf("sink ran before commit: saw %s", rec.seen[0])
	}
	// No event for: self-assignment, unassignment, re-sending the same value,
	// a rejected assignment, or a viewer's refused write.
	f.apply("bob", "B", f.op("task", "t2", "assignee_id", `"bob"`))
	f.apply("alice", "A", f.op("task", "t2", "assignee_id", `null`))
	f.apply("alice", "A", f.op("task", "t1", "assignee_id", `"bob"`))
	f.apply("alice", "A", f.op("task", "t1", "assignee_id", `"mallory"`))
	f.apply("carol", "C", f.op("task", "t2", "assignee_id", `"alice"`))
	if len(rec.events) != 1 {
		t.Fatalf("unexpected events: %+v", rec.events[1:])
	}
	// The in-app sink stored one unread notification for bob.
	list, unread, err := inbox.List(f.ctx, "bob")
	if err != nil || len(list) != 1 || unread != 1 || list[0].Kind != notify.KindAssigned {
		t.Fatalf("bob's notifications = %+v unread %d, %v", list, unread, err)
	}
	if other, _, _ := inbox.List(f.ctx, "alice"); len(other) != 0 {
		t.Fatalf("alice got %+v", other)
	}
	// Strict (REST) batches emit too.
	if _, err := f.s.ApplyStrict(f.ctx, "bob", []Op{{ID: "rest-1", Entity: "task", EntityID: "t2", Field: "assignee_id", Value: []byte(`"alice"`), TS: 9000, Device: ServerDevice}}); err != nil {
		t.Fatal(err)
	}
	if len(rec.events) != 2 || rec.events[1].AssigneeID != "alice" || rec.events[1].ActorName != "bob" {
		t.Fatalf("strict events = %+v", rec.events)
	}
}
