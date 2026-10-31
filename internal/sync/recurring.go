package sync

import (
	"context"
	"encoding/json"

	"github.com/OpenTodoApp/opentodo/internal/ids"
)

// Server-side completion of recurring tasks (OpenSpec change recurring-tasks,
// design D5), shared by the REST API, CalDAV and the AI assistant tools
// (mcp-write-tools D4). The web client computes the same thing in
// web/src/lib/recurring.ts; both derive the occurrence record id with
// ids.NameID so a server completion and a device completing the same
// occurrence offline converge to one record.

// recurringDue is the stored shape of task.due.
type recurringDue struct {
	Date string  `json:"date"`
	Time *string `json:"time,omitempty"`
	TZ   *string `json:"tz,omitempty"`
}

// OccurrenceID is the id of the completed record of one occurrence of a series.
func OccurrenceID(seriesID, date string) string {
	return ids.NameID("occurrence", seriesID+":"+date)
}

func decodeRecurringDue(raw json.RawMessage) *recurringDue {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	var d recurringDue
	if json.Unmarshal(raw, &d) != nil || d.Date == "" {
		return nil
	}
	return &d
}

// IsNull reports whether an op or field value is absent or JSON null.
func IsNull(raw json.RawMessage) bool { return len(raw) == 0 || string(raw) == "null" }

// StringOf is a string op value, "" when absent, null or not a string.
func StringOf(raw json.RawMessage) string {
	var s string
	if IsNull(raw) {
		return ""
	}
	_ = json.Unmarshal(raw, &s)
	return s
}

// NumberOf is a number op value, 0 when absent, null or not a number.
func NumberOf(raw json.RawMessage) float64 {
	var f float64
	_ = json.Unmarshal(raw, &f)
	return f
}

// JSONOf is v as an op value; v must be JSON-encodable.
func JSONOf(v any) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}

// RecurringCompletion turns a write that completes an open recurring task into
// "record the occurrence and move the series": it removes completed_at from
// body, sets body.due to the next occurrence that is not an exception date and
// returns the fields of the occurrence record to create (with occurrence_date,
// OpenSpec change series-exceptions). A series standing on an exception date (a
// device rolled before it saw another's record) is repaired first, so the
// completion never lands on an exception (M5). It returns ok=false when the
// write is an ordinary one (no completion, no valid rule, already completed, or
// the end condition is reached, in which case the series completes like a
// plain task). today is the caller's calendar date (YYYY-MM-DD). It only reads.
func (s *Service) RecurringCompletion(ctx context.Context, uid, id string, body map[string]json.RawMessage, existing Entity, today string) (recordID string, record map[string]json.RawMessage, ok bool, err error) {
	completedAt, completing := body["completed_at"]
	if !completing || IsNull(completedAt) || !IsNull(existing["completed_at"]) || existing.Deleted() {
		return "", nil, false, nil
	}
	merged := Entity{}
	for k, v := range existing {
		merged[k] = v
	}
	for k, v := range body {
		merged[k] = v
	}
	// The rule in effect is the one this write sets, if any.
	merged["completed_at"] = json.RawMessage("null")
	series, isSeries := openSeries(id, merged)
	if !isSeries {
		return "", nil, false, nil
	}
	tasks, err := s.List(ctx, uid, "task", false)
	if err != nil {
		return "", nil, false, err
	}
	date, more, err := series.current(tasks, today)
	if err != nil || !more {
		return "", nil, false, err
	}
	at := series.standOn(date, today)
	b := SeriesBudget(id, tasks, date)
	dueDate := ""
	if cur := decodeRecurringDue(at["due"]); cur != nil {
		dueDate = cur.Date
	}
	next, more, err := series.rule.NextFree(dueDate, today, today, b.Taken, b.Except)
	if err != nil || !more {
		return "", nil, false, err
	}
	record = recordFields(at, id, date, date, int64(NumberOf(completedAt)))
	record["created_at"], record["completed_at"] = completedAt, completedAt
	delete(body, "completed_at")
	// Who completed it belongs to the occurrence (completed-date-filters D5).
	if by, has := body["completed_by"]; has {
		record["completed_by"] = by
		delete(body, "completed_by")
	}
	// The series' deadline and start move by the same days as its due date
	// (OpenSpec changes deadlines D8, someday-and-evening D8).
	for k, v := range movedDates(at, date, next) {
		body[k] = v
	}
	return OccurrenceID(id, date), record, true, nil
}

// CompletedOccurrences is the number of done occurrence records of the series
// id the user can see (OpenSpec change series-occurrences, design D2).
func (s *Service) CompletedOccurrences(ctx context.Context, uid, id string) (int, error) {
	tasks, err := s.List(ctx, uid, "task", false)
	if err != nil {
		return 0, err
	}
	return SeriesBudget(id, tasks, "").Done, nil
}

// SeriesTasks are the live tasks the user can see, the rows a series' records
// are read from (RecordsOf, SeriesBudget, PlanActOn).
func (s *Service) SeriesTasks(ctx context.Context, uid string) ([]Entity, error) {
	return s.List(ctx, uid, "task", false)
}
