package rules

import (
	"slices"
	"testing"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// OpenSpec change habits-assistant, routines "Habit steps": the habits at risk
// for an evening nudge, and a habit logged by a routine (a webhook's walk).
func TestHabitSteps(t *testing.T) {
	h, _, _ := routineHarness(t)
	h.task("alice", "read", map[string]any{"title": "Read", "habit": true, "recurrence": "every day", "due": map[string]string{"date": "2026-10-21"}, "position": 1})
	for _, d := range []string{"2026-10-17", "2026-10-18"} {
		h.task("alice", opsync.OccurrenceID("read", d), map[string]any{"series_id": "read", "occurrence_date": d, "due": map[string]string{"date": d}, "completed_at": 1, "position": 2})
	}
	h.task("alice", "walk", map[string]any{"title": "Walk", "habit": true, "recurrence": "every day", "due": map[string]string{"date": "2026-10-21"}, "position": 3})
	h.task("alice", "plain", map[string]any{"title": "Report", "recurrence": "every day", "due": map[string]string{"date": "2026-10-21"}, "position": 4})

	// An evening nudge: only Read was missed on its last two scheduled days.
	h.routine("alice", "nudge", "Nudge", `{"kind":"manual"}`, "", `[{"id":"a","kind":"find_habits","in":{"only":{"literal":"at_risk"}}}]`)
	if got := foundIDs(t, h.runNow("alice", "nudge", "", true)); !slices.Equal(got, []string{"read"}) {
		t.Fatalf("at risk = %v", got)
	}
	h.routine("alice", "all", "All", `{"kind":"manual"}`, "", `[{"id":"a","kind":"find_habits","in":{}}]`)
	if got := foundIDs(t, h.runNow("alice", "all", "", true)); !slices.Equal(got, []string{"read", "walk"}) {
		t.Fatalf("habits = %v", got)
	}

	// A walk from a webhook: today's record done with the note, the series moved on.
	h.routine("alice", "walk-log", "Walk", `{"kind":"manual"}`, "", `[{"id":"a","kind":"log_habit","in":{"habit":{"literal":{"task":"walk"}},"state":{"literal":"done"},"note":{"literal":"from Home Assistant"}}}]`)
	h.runNow("alice", "walk-log", "", false)
	rec := h.get("alice", opsync.OccurrenceID("walk", "2026-10-21"))
	if rec == nil || opsync.IsNull(rec["completed_at"]) || opsync.StringOf(rec["description"]) != "from Home Assistant" {
		t.Fatalf("record = %v", rec)
	}
	if s := h.get("alice", "walk"); string(s["due"]) != `{"date":"2026-10-22"}` {
		t.Fatalf("walk due = %s", s["due"])
	}
	// A plain repeating task is not a habit: the step fails and writes nothing.
	h.routine("alice", "bad", "Bad", `{"kind":"manual"}`, "", `[{"id":"a","kind":"log_habit","in":{"habit":{"literal":{"task":"plain"}},"state":{"literal":"done"}}}]`)
	if res := h.runNow("alice", "bad", "", false); res.Run.Outcome == "succeeded" || res.Writes != 0 {
		t.Fatalf("plain task logged: %+v", res)
	}
}
