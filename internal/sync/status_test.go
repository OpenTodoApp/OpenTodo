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

// A recorded occurrence of a repeating task assigned to Bob: its completion by
// Alice is one status event and no assignment (the record copies the series'
// assignee); a skipped occurrence and a task created already completed are none.
type bothSink struct {
	assigned []notify.Assigned
	status   []notify.StatusChanged
}

func (b *bothSink) Assigned(_ context.Context, e notify.Assigned) { b.assigned = append(b.assigned, e) }
func (b *bothSink) StatusChanged(_ context.Context, e notify.StatusChanged) {
	b.status = append(b.status, e)
}

func TestStatusOfOccurrencesSkipsAndCreatedTasks(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	rec := &bothSink{}
	f.s.AddSink(rec)
	record := func(id, date string, skipped bool) []Op {
		ops := []Op{f.op("task", id, "series_id", `"t2"`), f.op("task", id, "occurrence_date", `"`+date+`"`),
			f.op("task", id, "project_id", `"p"`), f.op("task", id, "assignee_id", `"bob"`), f.op("task", id, "created_at", `5000`),
			f.op("task", id, "completed_at", `5000`)}
		if skipped {
			ops = append(ops, f.op("task", id, "skipped", `true`))
		}
		return ops
	}
	f.apply("alice", "A", record("r1", "2026-11-23", false)...)
	if len(rec.status) != 1 || rec.status[0].TaskID != "r1" || !rec.status[0].Completed || len(rec.assigned) != 0 {
		t.Fatalf("completed occurrence: status %+v assigned %+v", rec.status, rec.assigned)
	}
	f.apply("alice", "A", record("r2", "2026-11-24", true)...)
	f.apply("alice", "A", f.op("task", "t9", "title", `"Imported"`), f.op("task", "t9", "project_id", `"p"`),
		f.op("task", "t9", "assignee_id", `"bob"`), f.op("task", "t9", "created_at", `5000`), f.op("task", "t9", "completed_at", `5000`))
	if len(rec.status) != 1 {
		t.Fatalf("skip or created-completed emitted: %+v", rec.status)
	}
}
