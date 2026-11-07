package caldav

import (
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/recurrence/recurrence10"
)

// TestWeeklyIntervalOnADay: FREQ=WEEKLY;INTERVAL=2;BYDAY=SA is stored in the
// form a 1.0 client reads when the task's due date (its DTSTART or DUE) is a
// Saturday, and as every 2 weeks on saturday otherwise
// (recurrence-1-0-compatible).
func TestWeeklyIntervalOnADay(t *testing.T) {
	for _, c := range []struct{ lines, due, want string }{
		{"DTSTART;VALUE=DATE:20261107\r\nDUE;VALUE=DATE:20261107", "2026-11-07", "every 2 weeks"},
		{"DUE;VALUE=DATE:20261107", "2026-11-07", "every 2 weeks"},
		{"DTSTART;VALUE=DATE:20261107\r\nDUE;VALUE=DATE:20261110", "2026-11-07", "every 2 weeks"},
		{"DTSTART:20261107T090000\r\nDURATION:PT1H", "2026-11-07", "every 2 weeks"},
		{"DUE;VALUE=DATE:20261104", "2026-11-04", "every 2 weeks on saturday"},
	} {
		in, err := Decode(vtodo(c.lines + "\r\nRRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=SA"))
		if err != nil {
			t.Fatal(err)
		}
		if in.Due == nil || in.Due.Date != c.due || in.Rule != c.want {
			t.Errorf("%q: due %+v rule %q, want %s %q", c.lines, in.Due, in.Rule, c.due, c.want)
			continue
		}
		if err := recurrence10.Check(in.Rule, in.Due.Date); err != nil {
			t.Error(err)
		}
	}
}
