package push

import (
	"context"
	"testing"
	"time"
)

// A kept subtask (keep-open-subtasks D5: open under a completed ancestor) fires
// no reminder while its parent is completed; nothing is recorded, so once the
// parent is reopened the reminder goes out.
func TestKeptSubtaskReminderWaits(t *testing.T) {
	e := newTestEnv(t)
	ctx := context.Background()
	s := e.service()
	var got []string
	s.SetReminderHook(func(_ context.Context, r DueReminder) { got = append(got, r.ID) })
	*e.clock = time.Date(2026, 11, 26, 9, 0, 0, 0, time.UTC)
	e.apply(t, "u1", map[string]map[string]any{
		"task:trip":  {"title": "Plan trip", "completed_at": e.clock.UnixMilli() - 1000},
		"task:hotel": {"title": "Book hotel", "parent_id": "trip"},
		"task:deep":  {"title": "Compare prices", "parent_id": "hotel"},
	})
	e.reminder(t, "u1", "r1", "hotel", e.clock.UnixMilli()-1)
	e.reminder(t, "u1", "r2", "deep", e.clock.UnixMilli()-1)
	if _, err := s.Tick(ctx); err != nil {
		t.Fatal(err)
	}
	if len(got) != 0 {
		t.Fatalf("kept reminders handed over: %v", got)
	}
	*e.clock = e.clock.Add(time.Minute)
	e.apply(t, "u1", map[string]map[string]any{"task:trip": {"completed_at": nil}})
	if _, err := s.Tick(ctx); err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 {
		t.Fatalf("after the parent reopened: %v", got)
	}
}
