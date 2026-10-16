package httpapi

import (
	"strings"
	"testing"
)

// TestHabitOverRESTAndCalDAV (OpenSpec change habits, design D7): the REST API
// takes habit as a plain boolean and refuses anything else, CalDAV serves a
// habit as an ordinary recurring VTODO with no new property, and a client
// round trip and completion keep the flag and record a done occurrence.
func TestHabitOverRESTAndCalDAV(t *testing.T) {
	e, c := davSetup(t)
	c.must("PUT", c.cal("inbox")+"h1.ics", vtodoBody("h1", "SUMMARY:Stretch", "DUE;VALUE=DATE:20261012", "RRULE:FREQ=DAILY"), 201)
	r, out := e.do("PATCH", "/api/v1/tasks/h1", map[string]any{"habit": true})
	e.mustStatus(r, 200, out)
	if out["habit"] != true {
		t.Fatalf("habit not returned: %v", out)
	}
	r, out = e.do("PATCH", "/api/v1/tasks/h1", map[string]any{"habit": "yes"})
	e.mustStatus(r, 400, out)
	if e.task("h1")["habit"] != true {
		t.Fatal("invalid habit value changed the task")
	}
	_, ics := c.must("GET", c.cal("inbox")+"h1.ics", "", 200)
	if !strings.Contains(ics, "RRULE:FREQ=DAILY") || strings.Contains(strings.ToUpper(ics), "HABIT") {
		t.Fatalf("habit served as: %s", ics)
	}
	done := strings.Replace(ics, "STATUS:NEEDS-ACTION", "STATUS:COMPLETED\r\nCOMPLETED:20261012T090000Z", 1)
	c.must("PUT", c.cal("inbox")+"h1.ics", done, 204)
	task := e.task("h1")
	if task["habit"] != true || task["completed_at"] != nil || task["due"].(map[string]any)["date"] == "2026-10-12" {
		t.Fatalf("series after CalDAV completion: %v", task)
	}
	rec := e.task(occurrenceID("h1", "2026-10-12"))
	if rec["completed_at"] == nil || rec["skipped"] == true || rec["habit"] == true {
		t.Fatalf("occurrence record: %v", rec)
	}
}
