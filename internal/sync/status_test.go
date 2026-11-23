package sync

import (
	"context"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/notify"
)

// assignee-notifications (task 1.1): the assignee hears when someone else
// completes or reopens their task, never about their own change.

type statusSink struct{ events []notify.StatusChanged }

func (s *statusSink) Assigned(context.Context, notify.Assigned) {}
func (s *statusSink) StatusChanged(_ context.Context, e notify.StatusChanged) {
	s.events = append(s.events, e)
}

func TestStatusNotifiesAssigneeOfCompletionAndReopening(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	rec := &statusSink{}
	f.s.AddSink(rec)
	f.apply("alice", "A", f.op("task", "t2", "assignee_id", `"bob"`))
	f.apply("alice", "A", f.op("task", "t2", "completed_at", `5000`))
	if len(rec.events) != 1 {
		t.Fatalf("completed: events = %+v", rec.events)
	}
	if e := rec.events[0]; e.AssigneeID != "bob" || e.TaskID != "t2" || e.TaskTitle != "Bread" || !e.Completed || e.ActorName != "alice" || e.ProjectName != "Home" {
		t.Fatalf("event = %+v", e)
	}
	// Re-sending the same completion changes nothing and emits nothing.
	f.apply("alice", "A", f.op("task", "t2", "completed_at", `5000`))
	f.apply("alice", "A", f.op("task", "t2", "completed_at", `null`))
	if len(rec.events) != 2 || rec.events[1].Completed {
		t.Fatalf("reopened: events = %+v", rec.events)
	}
}

func TestStatusNotForOwnChangeUnassignedOrDeleted(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	rec := &statusSink{}
	f.s.AddSink(rec)
	f.apply("alice", "A", f.op("task", "t2", "assignee_id", `"bob"`))
	// Bob completes his own task.
	f.apply("bob", "B", f.op("task", "t2", "completed_at", `5000`))
	// An unassigned task.
	f.apply("bob", "B", f.op("task", "t1", "completed_at", `5000`))
	// A deleted task assigned to Bob.
	f.apply("alice", "A", f.op("task", "t3", "assignee_id", `"bob"`), f.op("task", "t3", "project_id", `"p"`))
	f.apply("alice", "A", f.op("task", "t3", "deleted_at", `6000`), f.op("task", "t3", "completed_at", `6000`))
	if len(rec.events) != 0 {
		t.Fatalf("events = %+v", rec.events)
	}
}
