package sync

import (
	"context"
	"testing"

	"github.com/pixari/opentodo/internal/notify"
)

// task-dependencies (task 6.2): the assignee of a task hears when its last open
// blocker is completed by someone else.

type unblockedSink struct{ events []notify.Unblocked }

func (u *unblockedSink) Assigned(context.Context, notify.Assigned) {}
func (u *unblockedSink) Unblocked(_ context.Context, e notify.Unblocked) {
	u.events = append(u.events, e)
}

func TestUnblockedNotifiesAssigneeOnce(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	rec := &unblockedSink{}
	f.s.AddSink(rec)
	// t2 (assigned to Bob) waits for t1.
	f.apply("alice", "A", f.op("task", "t2", "assignee_id", `"bob"`), f.op("task", "t2", "blocked_by", `["t1"]`))
	f.apply("alice", "A", f.op("task", "t1", "completed_at", `5000`))
	if len(rec.events) != 1 {
		t.Fatalf("events = %+v", rec.events)
	}
	e := rec.events[0]
	if e.AssigneeID != "bob" || e.TaskID != "t2" || e.TaskTitle != "Bread" || e.BlockerID != "t1" || e.BlockerTitle != "Milk" || e.ActorName != "alice" || e.ProjectName != "Home" {
		t.Fatalf("event = %+v", e)
	}
	// Re-sending the completion changes nothing and emits nothing.
	f.apply("alice", "A", f.op("task", "t1", "completed_at", `5000`))
	if len(rec.events) != 1 {
		t.Fatalf("again = %+v", rec.events)
	}
}

func TestUnblockedWaitsForTheLastBlocker(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	rec := &unblockedSink{}
	f.s.AddSink(rec)
	f.apply("alice", "A", f.op("task", "t3", "title", `"Butter"`), f.op("task", "t3", "project_id", `"p"`))
	f.apply("alice", "A", f.op("task", "t2", "assignee_id", `"bob"`), f.op("task", "t2", "blocked_by", `["t1","t3"]`))
	f.apply("alice", "A", f.op("task", "t1", "completed_at", `5000`))
	if len(rec.events) != 0 {
		t.Fatalf("one of two blockers = %+v", rec.events)
	}
	f.apply("alice", "A", f.op("task", "t3", "deleted_at", `6000`))
	f.apply("alice", "A", f.op("task", "t3", "completed_at", `6000`))
	if len(rec.events) != 1 || rec.events[0].BlockerID != "t3" {
		t.Fatalf("last blocker = %+v", rec.events)
	}
}

func TestUnblockedNotForOwnTask(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	rec := &unblockedSink{}
	f.s.AddSink(rec)
	f.apply("alice", "A", f.op("task", "t2", "assignee_id", `"bob"`), f.op("task", "t2", "blocked_by", `["t1"]`))
	// Bob completes the blocker of his own task: nobody to tell.
	f.apply("bob", "B", f.op("task", "t1", "completed_at", `5000`))
	if len(rec.events) != 0 {
		t.Fatalf("own task = %+v", rec.events)
	}
	// An unassigned dependent is not notified either.
	f.apply("alice", "A", f.op("task", "t1", "completed_at", `null`), f.op("task", "t2", "assignee_id", `null`))
	f.apply("alice", "A", f.op("task", "t1", "completed_at", `7000`))
	if len(rec.events) != 0 {
		t.Fatalf("unassigned = %+v", rec.events)
	}
}
