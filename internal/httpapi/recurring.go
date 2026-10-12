package httpapi

import (
	"context"
	"encoding/json"
	"time"

	"github.com/pixari/opentodo/internal/recurrence"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// REST behaviour of recurring tasks (OpenSpec change recurring-tasks, design D5).
// The completion rule itself lives in internal/sync (RecurringCompletion) so the
// REST API, CalDAV and the AI assistant tools share it.

type due struct {
	Date string  `json:"date"`
	Time *string `json:"time,omitempty"`
	// TZ makes the due zoned (OpenSpec change absolute-datetimes): the wall time
	// in that IANA zone. Kept as the series rolls forward.
	TZ *string `json:"tz,omitempty"`
}

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
// "record the occurrence and move the series" (see sync.RecurringCompletion,
// shared with the AI assistant tools).
func (s *Server) recurringCompletion(ctx context.Context, uid, id string, body map[string]json.RawMessage, existing opsync.Entity, today string) (recordID string, record map[string]json.RawMessage, ok bool, err error) {
	return s.sync.RecurringCompletion(ctx, uid, id, body, existing, today)
}

func mustJSON(v any) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}

// localToday is the server's local calendar date, the "today" of REST completions.
func localToday(now time.Time) string { return now.Local().Format("2006-01-02") }
