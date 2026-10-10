package httpapi

import (
	"context"
	"encoding/json"
	"time"

	"github.com/pixari/opentodo/internal/ids"
	"github.com/pixari/opentodo/internal/recurrence"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// REST behaviour of recurring tasks (OpenSpec change recurring-tasks, design D5).
// The web client computes the same thing in web/src/lib/recurring.ts; both derive
// the occurrence record id with ids.NameID so a REST completion and a device
// completing the same occurrence offline converge to one record.

type due struct {
	Date string  `json:"date"`
	Time *string `json:"time,omitempty"`
}

func occurrenceID(seriesID, date string) string { return ids.NameID("occurrence", seriesID+":"+date) }

// canonicalizeRecurrence rewrites body.recurrence to its canonical form when it
// parses; an invalid rule is left untouched so op validation rejects it with the
// usual invalid_input error.
func canonicalizeRecurrence(body map[string]json.RawMessage) {
	raw, ok := body["recurrence"]
	if !ok || string(raw) == "null" {
		return
	}
	var s string
	if json.Unmarshal(raw, &s) != nil {
		return
	}
	if c, err := recurrence.Canonicalize(s); err == nil {
		body["recurrence"], _ = json.Marshal(c)
	}
}

func decodeDue(raw json.RawMessage) *due {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	var d due
	if json.Unmarshal(raw, &d) != nil || d.Date == "" {
		return nil
	}
	return &d
}

func isNullish(raw json.RawMessage) bool { return len(raw) == 0 || string(raw) == "null" }

// recurringCompletion turns a PATCH that completes an open recurring task into
// "record the occurrence and move the series": it removes completed_at from body,
// sets body.due to the next occurrence and returns the fields of the occurrence
// record to create. It returns ok=false when the PATCH is an ordinary write (no
// completion, no valid rule, already completed, or the end condition is reached,
// in which case the series completes like a plain task).
func (s *Server) recurringCompletion(ctx context.Context, uid, id string, body map[string]json.RawMessage, existing opsync.Entity, today string) (recordID string, record map[string]json.RawMessage, ok bool, err error) {
	completedAt, completing := body["completed_at"]
	if !completing || isNullish(completedAt) || !isNullish(existing["completed_at"]) || existing.Deleted() {
		return "", nil, false, nil
	}
	// The rule in effect is the one this PATCH sets, if any.
	ruleRaw := existing["recurrence"]
	if r, has := body["recurrence"]; has {
		ruleRaw = r
	}
	var ruleText string
	if isNullish(ruleRaw) || json.Unmarshal(ruleRaw, &ruleText) != nil {
		return "", nil, false, nil
	}
	rule, perr := recurrence.Parse(ruleText)
	if perr != nil {
		return "", nil, false, nil
	}
	merged := opsync.Entity{}
	for k, v := range existing {
		merged[k] = v
	}
	for k, v := range body {
		merged[k] = v
	}
	cur := decodeDue(merged["due"])
	date := today
	dueDate := ""
	if cur != nil {
		date, dueDate = cur.Date, cur.Date
	}
	tasks, err := s.sync.List(ctx, uid, "task", false)
	if err != nil {
		return "", nil, false, err
	}
	done := 0
	for _, t := range tasks {
		if idOf(t["series_id"]) != id || isNullish(t["completed_at"]) {
			continue
		}
		d := decodeDue(t["due"])
		if d == nil || d.Date == date {
			continue
		}
		if idOf(t["id"]) == occurrenceID(id, d.Date) {
			done++
		}
	}
	next, more, err := rule.Following(dueDate, today, today, done)
	if err != nil || !more {
		return "", nil, false, err
	}
	occurrenceDue := merged["due"]
	if cur == nil {
		occurrenceDue, _ = json.Marshal(due{Date: date})
	}
	record = map[string]json.RawMessage{
		"due":          occurrenceDue,
		"created_at":   completedAt,
		"completed_at": completedAt,
		"deleted_at":   json.RawMessage("null"),
		"recurrence":   json.RawMessage("null"),
		"series_id":    mustJSON(id),
	}
	for _, f := range []string{"title", "description", "project_id", "parent_id", "priority", "labels", "position", "estimate_minutes"} {
		if v, has := merged[f]; has {
			record[f] = v
		}
	}
	nd := due{Date: next}
	if cur != nil {
		nd.Time = cur.Time
	}
	delete(body, "completed_at")
	body["due"] = mustJSON(nd)
	return occurrenceID(id, date), record, true, nil
}

func mustJSON(v any) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}

// localToday is the server's local calendar date, the "today" of REST completions.
func localToday(now time.Time) string { return now.Local().Format("2006-01-02") }
