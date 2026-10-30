package httpapi

import (
	"context"
	"encoding/json"

	"github.com/OpenTodoApp/opentodo/internal/daypart"
	"github.com/OpenTodoApp/opentodo/internal/recurrence"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// REST behaviour of recurring tasks (OpenSpec change recurring-tasks, design D5).
// The completion rule itself lives in internal/sync (RecurringCompletion) so the
// REST API, CalDAV and the AI assistant tools share it.

func occurrenceID(seriesID, date string) string { return opsync.OccurrenceID(seriesID, date) }

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

// pairDayPart completes a task body that sets Morning or Afternoon without the
// evening flag with evening false, the pairing of OpenSpec change day-parts
// (design D2), so the part is the one written. A body that names both is kept
// as sent; an invalid value is left for op validation to reject.
func pairDayPart(body map[string]json.RawMessage) {
	if _, has := body["evening"]; has {
		return
	}
	var part string
	if raw, ok := body["day_part"]; ok && json.Unmarshal(raw, &part) == nil && daypart.Stored(part) {
		body["evening"] = json.RawMessage("false")
	}
}

// recurringCompletion turns a PATCH that completes an open recurring task into
// "record the occurrence and move the series" (see sync.RecurringCompletion,
// shared with the AI assistant tools).
func (s *Server) recurringCompletion(ctx context.Context, uid, id string, body map[string]json.RawMessage, existing opsync.Entity, today string) (recordID string, record map[string]json.RawMessage, ok bool, err error) {
	return s.sync.RecurringCompletion(ctx, uid, id, body, existing, today)
}
