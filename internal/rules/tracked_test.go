package rules

import (
	"slices"
	"testing"
	"time"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// OpenSpec change tracked-time-api-compatible: a routine's tracked condition
// and the `tracked` filter terms of a Find tasks step keep their v1.0.0 meaning,
// every entry of the task; `tracked occurrence` reads a repeating task's
// current occurrence. 30 minutes before a completion and 10 after.
func TestTrackedKeepsTheTotal(t *testing.T) {
	h, _, _ := routineHarness(t)
	done := h.clock.Add(-2 * time.Hour).UnixMilli()
	h.task("alice", "s1", map[string]any{"due": map[string]string{"date": "2026-10-22"}, "recurrence": "every day", "position": 1})
	rec := opsync.OccurrenceID("s1", "2026-10-21")
	h.task("alice", rec, map[string]any{"due": map[string]string{"date": "2026-10-21"}, "series_id": "s1", "occurrence_date": "2026-10-21", "completed_at": done, "position": 2})
	h.task("alice", "plain", map[string]any{"position": 3})
	entry := func(id, task string, from, to int64) {
		h.write("alice", "laptop", "time_entry", id, map[string]any{"task_id": task, "user_id": "alice", "started_at": from, "ended_at": to, "note": "", "device_id": "laptop", "created_at": 1, "deleted_at": nil})
	}
	const min = int64(60000)
	entry("before", "s1", done-60*min, done-30*min)
	entry("after", "s1", done+10*min, done+20*min)
	entry("other", "plain", done, done+20*min)
	for _, c := range []struct {
		source string
		want   []string
	}{
		{`"condition":{"literal":{"tracked":{"min_minutes":30}}}`, []string{"s1"}},
		{`"query":{"literal":"tracked >= 30m"}`, []string{"s1"}},
		{`"query":{"literal":"tracked"}`, []string{"s1", "plain"}},
		{`"query":{"literal":"tracked occurrence >= 30m"}`, []string{}},
		{`"query":{"literal":"tracked occurrence >= 10m"}`, []string{"s1", "plain"}},
		{`"query":{"literal":"tracked occurrence = 10m"}`, []string{"s1"}},
	} {
		h.routine("alice", "r1", "Find", `{"kind":"manual"}`, "", `[{"id":"a","kind":"find_tasks","in":{`+c.source+`}}]`)
		if got := foundIDs(t, h.runNow("alice", "r1", "", true)); !slices.Equal(got, c.want) {
			t.Errorf("%s: found %v, want %v", c.source, got, c.want)
		}
	}
}
