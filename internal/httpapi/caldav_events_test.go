package httpapi

import (
	"fmt"
	"strings"
	"testing"
)

// veventBody wraps VEVENT lines the way iOS Calendar sends an event.
func veventBody(uid string, lines ...string) string {
	return "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Apple Inc.//iOS 18.0//EN\r\nBEGIN:VEVENT\r\nUID:" + uid + "\r\nDTSTAMP:20261026T180000Z\r\n" +
		strings.Join(lines, "\r\n") + "\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"
}

// TestEventsBecomeTasks (caldav-events-as-tasks, GitHub issue 500): an event
// saved or moved into an OpenTodo calendar from a calendar app becomes a task
// instead of being refused, is served back as a VTODO under the same name and
// UID, is listed by sync, and a later PUT of the event updates the task.
func TestEventsBecomeTasks(t *testing.T) {
	e, c := davSetup(t)
	_, body := c.must("REPORT", c.cal("inbox"), fmt.Sprintf(syncReport, ""), 207, "Depth", "1")
	tok := tokenRe.FindStringSubmatch(body)[1]

	timed := veventBody("ev1", "SUMMARY:Dentist", "DESCRIPTION:Bring the card.", "DTSTART;TZID=Europe/Berlin:20261103T093000",
		"DTEND;TZID=Europe/Berlin:20261103T103000", "TRANSP:OPAQUE", "LOCATION:Hauptstraße 5",
		"BEGIN:VALARM", "UID:al1", "TRIGGER:-PT30M", "ACTION:DISPLAY", "DESCRIPTION:Reminder", "END:VALARM")
	c.must("PUT", c.cal("inbox")+"ev1.ics", timed, 201)
	task := e.task("ev1")
	due, _ := task["due"].(map[string]any)
	if task["title"] != "Dentist" || task["description"] != "Bring the card." || due["date"] != "2026-11-03" || due["time"] != "09:30" || due["tz"] != "Europe/Berlin" {
		t.Fatalf("task from a timed event: %v", task)
	}
	if task["estimate_minutes"] != float64(60) {
		t.Fatalf("estimate: %v", task["estimate_minutes"])
	}
	if ops := e.caldavOps("ev1"); len(ops) == 0 {
		t.Fatal("no caldav ops written")
	}

	// Served back as a task, under the name and UID the calendar app chose.
	_, ics := c.must("GET", c.cal("inbox")+"ev1.ics", "", 200)
	for _, want := range []string{"BEGIN:VTODO", "UID:ev1", "SUMMARY:Dentist", "LOCATION:Hauptstraße 5", "BEGIN:VALARM"} {
		if !strings.Contains(ics, want) {
			t.Fatalf("served object lacks %q:\n%s", want, ics)
		}
	}
	for _, gone := range []string{"VEVENT", "DTEND", "TRANSP"} {
		if strings.Contains(ics, gone) {
			t.Fatalf("served object holds %q:\n%s", gone, ics)
		}
	}
	_, body = c.must("REPORT", c.cal("inbox"), fmt.Sprintf(syncReport, tok), 207, "Depth", "1")
	if !strings.Contains(body, "/ev1.ics</d:href><d:propstat>") {
		t.Fatalf("sync does not list the new task:\n%s", body)
	}

	// The app edits the event before its next sync: the task follows.
	c.must("PUT", c.cal("inbox")+"ev1.ics", veventBody("ev1", "SUMMARY:Dentist (moved)", "DTSTART;TZID=Europe/Berlin:20261104T080000",
		"DTEND;TZID=Europe/Berlin:20261104T083000"), 204)
	task = e.task("ev1")
	due, _ = task["due"].(map[string]any)
	if task["title"] != "Dentist (moved)" || due["date"] != "2026-11-04" || due["time"] != "08:00" || task["estimate_minutes"] != float64(30) {
		t.Fatalf("updated by an event: %v", task)
	}

	// An all-day event is a task on that day, without a time or an estimate.
	c.must("PUT", c.cal("inbox")+"ev2.ics", veventBody("ev2", "SUMMARY:Holiday", "DTSTART;VALUE=DATE:20261224", "DTEND;VALUE=DATE:20261227"), 201)
	task = e.task("ev2")
	due, _ = task["due"].(map[string]any)
	if due["date"] != "2026-12-24" || due["time"] != nil || task["estimate_minutes"] != nil {
		t.Fatalf("all-day event: %v", task)
	}

	// A weekly event repeats as a task.
	c.must("PUT", c.cal("inbox")+"ev3.ics", veventBody("ev3", "SUMMARY:Standup", "DTSTART:20261102T081500Z", "DTEND:20261102T083000Z", "RRULE:FREQ=WEEKLY;BYDAY=MO"), 201)
	if task := e.task("ev3"); task["recurrence"] == nil || task["recurrence"] == "" {
		t.Fatalf("recurring event: %v", task)
	}

	// Moved from another calendar of this account: PUT into the new one, as for a task.
	resp, out := e.do("POST", "/api/v1/projects", map[string]any{"name": "Health"})
	e.mustStatus(resp, 201, out)
	pid := out["id"].(string)
	c.must("PUT", c.cal(pid)+"ev1.ics", veventBody("ev1", "SUMMARY:Dentist (moved)", "DTSTART;TZID=Europe/Berlin:20261104T080000"), 204)
	if task := e.task("ev1"); task["project_id"] != pid {
		t.Fatalf("moved event: %v", task)
	}
}
