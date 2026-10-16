package sync

import (
	"context"
	"encoding/json"

	"github.com/pixari/opentodo/internal/ids"
	"github.com/pixari/opentodo/internal/recurrence"
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

func nullish(raw json.RawMessage) bool { return len(raw) == 0 || string(raw) == "null" }

func jsonOf(v any) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}

// RecurringCompletion turns a write that completes an open recurring task into
// "record the occurrence and move the series": it removes completed_at from
// body, sets body.due to the next occurrence and returns the fields of the
// occurrence record to create. It returns ok=false when the write is an
// ordinary one (no completion, no valid rule, already completed, or the end
// condition is reached, in which case the series completes like a plain task).
// today is the caller's calendar date (YYYY-MM-DD). It only reads.
func (s *Service) RecurringCompletion(ctx context.Context, uid, id string, body map[string]json.RawMessage, existing Entity, today string) (recordID string, record map[string]json.RawMessage, ok bool, err error) {
	completedAt, completing := body["completed_at"]
	if !completing || nullish(completedAt) || !nullish(existing["completed_at"]) || existing.Deleted() {
		return "", nil, false, nil
	}
	// The rule in effect is the one this write sets, if any.
	ruleRaw := existing["recurrence"]
	if r, has := body["recurrence"]; has {
		ruleRaw = r
	}
	var ruleText string
	if nullish(ruleRaw) || json.Unmarshal(ruleRaw, &ruleText) != nil {
		return "", nil, false, nil
	}
	rule, perr := recurrence.Parse(ruleText)
	if perr != nil {
		return "", nil, false, nil
	}
	merged := Entity{}
	for k, v := range existing {
		merged[k] = v
	}
	for k, v := range body {
		merged[k] = v
	}
	cur := decodeRecurringDue(merged["due"])
	date := today
	dueDate := ""
	if cur != nil {
		date, dueDate = cur.Date, cur.Date
	}
	tasks, err := s.List(ctx, uid, "task", false)
	if err != nil {
		return "", nil, false, err
	}
	done := 0
	for _, t := range tasks {
		if idValue(t["series_id"]) != id || nullish(t["completed_at"]) {
			continue
		}
		// A habit's skipped record is not a completion and never counts
		// towards `for N times` (OpenSpec change habits, design D2).
		if string(t["skipped"]) == "true" {
			continue
		}
		d := decodeRecurringDue(t["due"])
		if d == nil || d.Date == date {
			continue
		}
		if idValue(t["id"]) == OccurrenceID(id, d.Date) {
			done++
		}
	}
	next, more, err := rule.Following(dueDate, today, today, done)
	if err != nil || !more {
		return "", nil, false, err
	}
	occurrenceDue := merged["due"]
	if cur == nil {
		occurrenceDue = jsonOf(recurringDue{Date: date})
	}
	record = map[string]json.RawMessage{
		"due":          occurrenceDue,
		"created_at":   completedAt,
		"completed_at": completedAt,
		"deleted_at":   json.RawMessage("null"),
		"recurrence":   json.RawMessage("null"),
		"series_id":    jsonOf(id),
	}
	for _, f := range []string{"title", "description", "project_id", "parent_id", "priority", "labels", "position", "estimate_minutes"} {
		if v, has := merged[f]; has {
			record[f] = v
		}
	}
	// The record stays in the series' column (board-view); only sent when set, like the client.
	if sid := idValue(merged["section_id"]); sid != "" {
		record["section_id"] = jsonOf(sid)
	}
	// The record keeps the occurrence's deadline and the series' deadline moves
	// by the same days as its due date (OpenSpec change deadlines, design D8).
	deadline := idValue(merged["deadline"])
	if deadline != "" {
		record["deadline"] = jsonOf(deadline)
	}
	// Start and evening likewise (OpenSpec change someday-and-evening, design D8).
	start := idValue(merged["start"])
	if start != "" {
		record["start"] = jsonOf(start)
	}
	if string(merged["evening"]) == "true" {
		record["evening"] = json.RawMessage("true")
	}
	nd := recurringDue{Date: next}
	if cur != nil {
		nd.Time, nd.TZ = cur.Time, cur.TZ
	}
	delete(body, "completed_at")
	// Who completed it belongs to the occurrence (completed-date-filters D5).
	if by, has := body["completed_by"]; has {
		record["completed_by"] = by
		delete(body, "completed_by")
	}
	body["due"] = jsonOf(nd)
	if deadline != "" {
		body["deadline"] = jsonOf(recurrence.ShiftDate(deadline, date, next))
	}
	if start != "" && start != "someday" {
		body["start"] = jsonOf(recurrence.ShiftDate(start, date, next))
	}
	return OccurrenceID(id, date), record, true, nil
}
