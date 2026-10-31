package httpapi

import (
	"fmt"
	"strings"
	"testing"
	"time"
)

// TestFeedSpan (multi-day-tasks 6.2): the task feed serves a span as all-day
// days from start to due (DTEND exclusive), a weekly span series with the
// RRULE of its first days, a monthly one with RDATEs, and a deferred task
// that is not a span on its do-on date only.
func TestFeedSpan(t *testing.T) {
	e := ownerEnv(t)
	feedsOn(t, e)
	day := func(n int) string { return time.Now().UTC().AddDate(0, 0, n).Format(time.DateOnly) }
	compact := func(d string) string { return strings.ReplaceAll(d, "-", "") }
	monday := 7 + (8-int(time.Now().UTC().Weekday()))%7 // a Monday 7 to 13 days ahead
	for _, task := range []map[string]any{
		{"title": "Trip", "start": day(10), "due": map[string]any{"date": day(12), "time": "17:00"}, "span": true},
		{"title": "Deferred", "start": day(10), "due": map[string]any{"date": day(12)}},
		{"title": "Away", "start": day(monday - 1), "due": map[string]any{"date": day(monday)}, "span": true, "recurrence": "every monday"},
		{"title": "Retreat", "start": day(20), "due": map[string]any{"date": day(21)}, "span": true, "recurrence": "every month"},
		{"title": "Invalid", "start": day(30), "due": map[string]any{"date": day(30)}, "span": true},
	} {
		resp, out := e.do("POST", "/api/v1/tasks", task)
		e.mustStatus(resp, 201, out)
	}
	resp, out := e.do("POST", "/api/v1/calendar-feeds/feed", nil)
	e.mustStatus(resp, 201, out)
	url := out["url"].(string)
	_, raw := newClientAt(e, "10.9.9.21").raw("GET", url[strings.Index(url, "/feeds/"):], nil)
	body := strings.ReplaceAll(string(raw), "\r\n ", "")
	for _, want := range []string{
		"DTSTART;VALUE=DATE:" + compact(day(10)) + "\r\nDTEND;VALUE=DATE:" + compact(day(13)),
		"DTSTART;VALUE=DATE:" + compact(day(12)) + "\r\nDTEND;VALUE=DATE:" + compact(day(13)),
		"DTSTART;VALUE=DATE:" + compact(day(monday-1)) + "\r\nDTEND;VALUE=DATE:" + compact(day(monday+1)), "RRULE:FREQ=WEEKLY;BYDAY=SU",
		"DTSTART;VALUE=DATE:" + compact(day(20)) + "\r\nDTEND;VALUE=DATE:" + compact(day(22)), "RDATE;VALUE=DATE:",
		"DTSTART;VALUE=DATE:" + compact(day(30)) + "\r\nDTEND;VALUE=DATE:" + compact(day(31)),
	} {
		if !strings.Contains(body, want) {
			t.Errorf("feed lacks %q:\n%s", want, body)
		}
	}
	if strings.Contains(body, "T170000") {
		t.Fatalf("a span with a time is timed:\n%s", body)
	}
}

// TestCaldavSpan (multi-day-tasks 6.1): X-OPENTODO-SPAN sets the flag as an
// op, is served back beside X-OPENTODO-START with DUE as the do-on date, an
// invalid value leaves the flag and stays client data, and a client that drops
// the property leaves the flag alone.
func TestCaldavSpan(t *testing.T) {
	e, c := davSetup(t)
	c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:Lisbon trip", "X-OPENTODO-START:20261103", "DUE;VALUE=DATE:20261105", "X-OPENTODO-SPAN:TRUE"), 201)
	if task := e.task("t1"); task["span"] != true || task["start"] != "2026-11-03" || strings.Contains(fmt.Sprint(task["ical_extra"]), "X-OPENTODO-SPAN") {
		t.Fatalf("task %v", task)
	}
	_, ics := c.must("GET", c.cal("inbox")+"t1.ics", "", 200)
	for _, want := range []string{"DUE;VALUE=DATE:20261105\r\n", "X-OPENTODO-START:20261103\r\n", "X-OPENTODO-SPAN:TRUE\r\n"} {
		if !strings.Contains(ics, want) {
			t.Fatalf("GET without %q:\n%s", want, ics)
		}
	}
	if strings.Contains(ics, "DTSTART") {
		t.Fatalf("GET serves a DTSTART:\n%s", ics)
	}
	c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:Lisbon trip", "X-OPENTODO-START:20261103", "DUE;VALUE=DATE:20261105", "X-OPENTODO-SPAN:MAYBE"), 204)
	if task := e.task("t1"); task["span"] != true || !strings.Contains(fmt.Sprint(task["ical_extra"]), "X-OPENTODO-SPAN:MAYBE") {
		t.Fatalf("invalid value: %v", task)
	}
	c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:Lisbon", "X-OPENTODO-START:20261103", "DUE;VALUE=DATE:20261105"), 204)
	if task := e.task("t1"); task["span"] != true || task["title"] != "Lisbon" {
		t.Fatalf("after client without the property: %v", task)
	}
	c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:Lisbon", "X-OPENTODO-START:20261103", "DUE;VALUE=DATE:20261105", "X-OPENTODO-SPAN:FALSE"), 204)
	if task := e.task("t1"); task["span"] != false {
		t.Fatalf("FALSE: %v", task)
	}
}

// TestTaskSpanREST covers the REST side of multi-day-tasks (task 1.4): span is
// a boolean through the schema path, anything else is invalid_input, a request
// without a session is 401 and leaves the task alone, and the export carries it.
func TestTaskSpanREST(t *testing.T) {
	e := newEnv(t, false)
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "o@example.com", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Lisbon trip", "start": "2026-11-03", "due": map[string]any{"date": "2026-11-05"}, "span": true})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	if out["span"] != true || out["start"] != "2026-11-03" {
		t.Fatalf("created = %v", out)
	}
	for _, bad := range []map[string]any{{"span": "yes"}, {"span": 1}, {"span": nil}} {
		resp, out = e.do("PATCH", "/api/v1/tasks/"+id, bad)
		e.mustStatus(resp, 400, out)
		if code := out["error"].(map[string]any)["code"]; code != "invalid_input" {
			t.Fatalf("%v: code %v", bad, code)
		}
	}
	resp, out = newClientFor(e).do("PATCH", "/api/v1/tasks/"+id, map[string]any{"span": false})
	e.mustStatus(resp, 401, out)
	if got := e.task(id); got["span"] != true {
		t.Fatalf("after anonymous PATCH: %v", got)
	}
	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"span": false})
	e.mustStatus(resp, 200, out)
	if out["span"] != false {
		t.Fatalf("patched = %v", out)
	}
	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"span": true})
	e.mustStatus(resp, 200, out)
	resp, out = e.do("GET", "/api/v1/export", nil)
	e.mustStatus(resp, 200, out)
	tasks, _ := out["tasks"].([]any)
	if len(tasks) != 1 || tasks[0].(map[string]any)["span"] != true {
		t.Fatalf("export tasks = %v", tasks)
	}
}
