package httpapi

import (
	"fmt"
	"net/http"
	"time"

	"github.com/pixari/opentodo/internal/agenttools"
	"github.com/pixari/opentodo/internal/zoned"
)

// completionRange reads `completed_after` and `completed_before` of a list request
// (OpenSpec change completed-date-filters, design D6) as Unix ms, 0 for an open
// end. A date is local midnight in the `timezone` parameter's zone (UTC by
// default). It answers a message for a 400 invalid_input, or "".
func completionRange(r *http.Request, entity string) (after, before int64, msg string) {
	q := r.URL.Query()
	a, b := q.Get("completed_after"), q.Get("completed_before")
	if a == "" && b == "" {
		return 0, 0, ""
	}
	if entity != "task" {
		name := "completed_after"
		if a == "" {
			name = "completed_before"
		}
		return 0, 0, name + ": only the tasks collection can be filtered by completion time"
	}
	loc := time.UTC
	if tz := q.Get("timezone"); tz != "" && tz != "UTC" {
		l, err := zoned.Load(tz)
		if err != nil {
			return 0, 0, fmt.Sprintf("timezone: unknown IANA time zone %q", tz)
		}
		loc = l
	}
	var err error
	if after, err = agenttools.ParseCompletionBound("completed_after", a, loc); err != nil {
		return 0, 0, err.Error()
	}
	if before, err = agenttools.ParseCompletionBound("completed_before", b, loc); err != nil {
		return 0, 0, err.Error()
	}
	return after, before, ""
}
