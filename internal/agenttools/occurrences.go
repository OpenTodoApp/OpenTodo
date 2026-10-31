package agenttools

import (
	"github.com/OpenTodoApp/opentodo/internal/recurrence"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// nextOccurrenceCount is how many projected dates a recurring task's output
// carries (OpenSpec change series-occurrences, design D7).
const nextOccurrenceCount = 3

// nextOccurrences is the next three projected occurrence dates of an open
// recurring task due on dueDate, from recurrence.Rule.Occurrences with the
// series' completed records counted toward "for N times"; nil for any other task.
func (snap *snapshot) nextOccurrences(t opsync.Entity, dueDate, today string) []string {
	rule := str(t, "recurrence")
	if rule == "" || !isOpen(t) {
		return nil
	}
	r, err := recurrence.Parse(rule)
	if err != nil {
		return nil
	}
	dates, _, err := r.Occurrences(dueDate, today, snap.completedOf(str(t, "id")), dueDate, "9999-12-31")
	if err != nil || len(dates) == 0 {
		return nil
	}
	return dates[:min(len(dates), nextOccurrenceCount)]
}

// completedOf counts the completed occurrence records of a series: live tasks
// pointing at it whose id is the one derived from their own due date, skipped
// habit records left out (as internal/sync and web/src/lib/recurring.ts count).
func (snap *snapshot) completedOf(seriesID string) int {
	if snap.doneBySeries == nil {
		snap.doneBySeries = map[string]int{}
		for _, t := range snap.tasks {
			sid := str(t, "series_id")
			if sid == "" || isOpen(t) || string(t["skipped"]) == "true" || t.Deleted() {
				continue
			}
			if d := taskDue(t); d != nil && str(t, "id") == opsync.OccurrenceID(sid, d.Date) {
				snap.doneBySeries[sid]++
			}
		}
	}
	return snap.doneBySeries[seriesID]
}
