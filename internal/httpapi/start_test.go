package httpapi

import (
	"fmt"
	"strings"
	"testing"

	"github.com/pixari/opentodo/internal/recurrence"
)

// TestTaskStartEveningREST covers the REST side of someday-and-evening (task
// 1.4): both fields go through the schema path, invalid values are refused
// with invalid_input, and the export carries them.
func TestTaskStartEveningREST(t *testing.T) {
	e := newEnv(t, false)
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "o@example.com", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Learn Italian", "start": "someday"})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	if out["start"] != "someday" {
		t.Fatalf("created start = %v", out["start"])
	}
	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"start": "2027-03-01", "evening": true})
	e.mustStatus(resp, 200, out)
	if out["start"] != "2027-03-01" || out["evening"] != true {
		t.Fatalf("patched = %v", out)
	}
	for _, bad := range []map[string]any{{"start": "later"}, {"start": "2026-02-30"}, {"evening": "yes"}} {
		resp, out = e.do("PATCH", "/api/v1/tasks/"+id, bad)
		e.mustStatus(resp, 400, out)
		if code := out["error"].(map[string]any)["code"]; code != "invalid_input" {
			t.Fatalf("%v: code %v", bad, code)
		}
	}
	resp, out = e.do("GET", "/api/v1/export", nil)
	e.mustStatus(resp, 200, out)
	tasks, _ := out["tasks"].([]any)
	if len(tasks) != 1 || tasks[0].(map[string]any)["start"] != "2027-03-01" || tasks[0].(map[string]any)["evening"] != true {
		t.Fatalf("export tasks = %v", tasks)
	}
}

// TestCaldavStartEvening: X-OPENTODO-START and -EVENING become field ops, are
// served back, invalid values stay client data, and a client that omits the
// properties leaves a parked task parked (someday-and-evening D7).
func TestCaldavStartEvening(t *testing.T) {
	e, c := davSetup(t)
	c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:Passport", "X-OPENTODO-START:20261021", "X-OPENTODO-EVENING:TRUE"), 201)
	if task := e.task("t1"); task["start"] != "2026-10-21" || task["evening"] != true {
		t.Fatalf("task %v", task)
	}
	_, ics := c.must("GET", c.cal("inbox")+"t1.ics", "", 200)
	if !strings.Contains(ics, "X-OPENTODO-START:20261021\r\n") || !strings.Contains(ics, "X-OPENTODO-EVENING:TRUE\r\n") {
		t.Fatalf("GET:\n%s", ics)
	}
	c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:Passport", "X-OPENTODO-START:LATER"), 204)
	task := e.task("t1")
	if task["start"] != "2026-10-21" || !strings.Contains(fmt.Sprint(task["ical_extra"]), "X-OPENTODO-START:LATER") {
		t.Fatalf("invalid value: %v", task)
	}

	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Learn Italian", "start": "someday"})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	_, ics = c.must("GET", c.cal("inbox")+id+".ics", "", 200)
	if !strings.Contains(ics, "X-OPENTODO-START:SOMEDAY\r\n") || strings.Contains(ics, "DUE") {
		t.Fatalf("someday served:\n%s", ics)
	}
	c.must("PUT", c.cal("inbox")+id+".ics", vtodoBody(id, "SUMMARY:Learn Italian well"), 204)
	if got := e.task(id); got["start"] != "someday" || got["title"] != "Learn Italian well" {
		t.Fatalf("after client without X- properties: %v", got)
	}
}

// TestRestRecurringCompletionShiftsStart (someday-and-evening D8).
func TestRestRecurringCompletionShiftsStart(t *testing.T) {
	e := newEnv(t, false)
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "o@example.com", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Stretch", "due": map[string]any{"date": "2026-10-19"}, "start": "2026-10-17", "evening": true, "recurrence": "every monday"})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"completed_at": 1_800_000_000_000})
	e.mustStatus(resp, 200, out)
	due := out["due"].(map[string]any)["date"].(string)
	if want := recurrence.ShiftDate("2026-10-17", "2026-10-19", due); out["start"] != want || out["evening"] != true {
		t.Fatalf("series after completion: %v (want start %s)", out, want)
	}
	resp, out = e.do("GET", "/api/v1/export", nil)
	e.mustStatus(resp, 200, out)
	for _, x := range out["tasks"].([]any) {
		r := x.(map[string]any)
		if r["series_id"] == id && (r["start"] != "2026-10-17" || r["evening"] != true) {
			t.Fatalf("record = %v", r)
		}
	}
}
