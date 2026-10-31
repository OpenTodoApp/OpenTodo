package agenttools

import (
	"github.com/OpenTodoApp/opentodo/internal/recurrence"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// nextOccurrenceCount is how many projected dates a recurring task's output
// carries (OpenSpec change series-occurrences, design D7).
const nextOccurrenceCount = 3

// nextOccurrences is the next three projected occurrence dates of an open
// recurring task due on dueDate, from recurrence.Rule.OccurrencesExcept with the
// series' exception dates left out and its done and open records counted toward
// "for N times" (OpenSpec change series-exceptions); nil for any other task.
func (snap *snapshot) nextOccurrences(t opsync.Entity, dueDate, today string) []string {
	rule := str(t, "recurrence")
	if rule == "" || !isOpen(t) {
		return nil
	}
	r, err := recurrence.Parse(rule)
	if err != nil {
		return nil
	}
	b := opsync.SeriesBudget(str(t, "id"), t, snap.lineageRows(str(t, "id")), dueDate, today)
	dates, _, err := r.Bounded(b.End).OccurrencesExcept(dueDate, today, b.Taken, dueDate, "9999-12-31", b.Except)
	if err != nil || len(dates) == 0 {
		return nil
	}
	return dates[:min(len(dates), nextOccurrenceCount)]
}

// seriesRows are the tasks pointing at a series, grouped once per snapshot.
func (snap *snapshot) seriesRows(seriesID string) []opsync.Entity {
	if snap.bySeries == nil {
		snap.bySeries = map[string][]opsync.Entity{}
		for _, t := range snap.tasks {
			if _, ok := opsync.DecodeSplitFrom(t["split_from"]); ok {
				snap.hasSplit = true
			}
			if sid := str(t, "series_id"); sid != "" {
				snap.bySeries[sid] = append(snap.bySeries[sid], t)
			}
		}
	}
	return snap.bySeries[seriesID]
}

// lineageRows are the rows a series' budget reads: its records, or every task
// when the snapshot holds a split lineage (OpenSpec change series-split).
func (snap *snapshot) lineageRows(seriesID string) []opsync.Entity {
	rows := snap.seriesRows(seriesID)
	if snap.hasSplit {
		return snap.tasks
	}
	return rows
}
