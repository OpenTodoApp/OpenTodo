package timetrack

import (
	"encoding/json"

	"github.com/OpenTodoApp/opentodo/internal/ids"
)

// Occurrence is the part of a task row OccurrenceStarts reads: enough to tell a
// series' occurrence record (series-exceptions D1) and when it was completed or
// skipped.
type Occurrence struct {
	ID             string `json:"id"`
	SeriesID       string `json:"series_id"`
	OccurrenceDate string `json:"occurrence_date"`
	// DueDate is the date of the task's due, "" without one.
	DueDate     string `json:"due_date"`
	CompletedAt *int64 `json:"completed_at"`
	DeletedAt   *int64 `json:"deleted_at"`
}

// OccurrenceFromRow reads an Occurrence from a materialized task row.
func OccurrenceFromRow(row map[string]json.RawMessage) Occurrence {
	var o Occurrence
	_ = json.Unmarshal(row["id"], &o.ID)
	_ = json.Unmarshal(row["series_id"], &o.SeriesID)
	_ = json.Unmarshal(row["occurrence_date"], &o.OccurrenceDate)
	var due struct {
		Date string `json:"date"`
	}
	if json.Unmarshal(row["due"], &due) == nil {
		o.DueDate = due.Date
	}
	if v, ok := row["completed_at"]; ok && string(v) != "null" {
		n := int64Of(v)
		o.CompletedAt = &n
	}
	if v, ok := row["deleted_at"]; ok && string(v) != "null" {
		n := int64Of(v)
		o.DeletedAt = &n
	}
	return o
}

// OccurrenceStarts is when each repeating task's current occurrence began
// (OpenSpec change fix-recurring-tracked-time): the latest completion or skip
// among its live occurrence records dated before the series' due date. A
// repeating task is one row that moves to its next date, so its entries keep
// the same task id from one occurrence to the next; a task without such a
// record has no entry here. A plain series' skip writes no record, so it does
// not start a new occurrence here. The twin of web/src/lib/time.ts
// occurrenceStarts, pinned by testdata/occurrence_fixture.json.
func OccurrenceStarts(tasks []Occurrence) map[string]int64 {
	due := make(map[string]string, len(tasks))
	for _, t := range tasks {
		due[t.ID] = t.DueDate
	}
	out := map[string]int64{}
	for _, t := range tasks {
		if t.SeriesID == "" || t.CompletedAt == nil || t.DeletedAt != nil {
			continue
		}
		cur, ok := due[t.SeriesID]
		if !ok {
			continue
		}
		date := t.OccurrenceDate
		if date == "" {
			date = t.DueDate
		}
		if date == "" || (cur != "" && date >= cur) || t.ID != ids.NameID("occurrence", t.SeriesID+":"+date) {
			continue
		}
		if *t.CompletedAt > out[t.SeriesID] {
			out[t.SeriesID] = *t.CompletedAt
		}
	}
	return out
}

// CurrentTotals is TotalsByTask with each repeating task's current occurrence
// only (OccurrenceStarts): the tracked minutes shown against the estimate.
func CurrentTotals(entries []Entry, tasks []Occurrence, now int64) map[string]int {
	return TotalsByTask(entries, now, OccurrenceStarts(tasks))
}
