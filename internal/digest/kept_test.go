package digest

import (
	"testing"
	"time"
)

// TestKeptSubtasksNotCounted (keep-open-subtasks D5): an open subtask of a
// completed parent is neither overdue nor ahead in the digest; once the parent
// is reopened it counts again.
func TestKeptSubtasksNotCounted(t *testing.T) {
	done := time.Date(2026, 11, 23, 9, 0, 0, 0, time.UTC).UnixMilli()
	tasks := []Task{
		{ID: "trip", Title: "Plan trip", CompletedAt: &done},
		{ID: "hotel", Title: "Book hotel", ParentID: "trip", Due: "2026-11-20"},
		{ID: "bags", Title: "Pack bags", Due: "2026-11-21"},
	}
	in := Input{Me: "u1", Today: "2026-11-24", Loc: time.UTC, Shared: map[string]string{}, Tasks: tasks}
	s := Compute(in, ThisWeek(in.Today, 1))
	if s.Overdue != 1 || len(s.OverdueTasks) != 1 || s.OverdueTasks[0].ID != "bags" {
		t.Fatalf("overdue with a kept subtask: %+v", s)
	}
	in.Tasks[0].CompletedAt = nil
	if s := Compute(in, ThisWeek(in.Today, 1)); s.Overdue != 2 {
		t.Fatalf("overdue after the parent reopened: %+v", s)
	}
}
