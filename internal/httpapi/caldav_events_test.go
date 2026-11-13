package httpapi

import (
	"strings"
	"testing"
)

// An app password in event mode (caldav-events): the Inbox is an event
// calendar holding the open dated tasks as VEVENTs, a multi-day task as one
// all-day event; editing an event changes only its timing, title and notes;
// deleting it clears the due date; a to-do password is unchanged.
func TestCalDAVEventMode(t *testing.T) {
	e, todos := davSetup(t)
	resp, out := e.do("POST", "/api/v1/app-passwords", map[string]any{"name": "Calendar", "events": true})
	e.mustStatus(resp, 201, out)
	if out["appPassword"].(map[string]any)["events"] != true {
		t.Fatalf("app password = %v", out)
	}
	ev := &davClient{e: e, email: todos.email, secret: out["secret"].(string), uid: todos.uid}
	mk := func(body map[string]any) string {
		resp, out := e.do("POST", "/api/v1/tasks", body)
		e.mustStatus(resp, 201, out)
		return out["id"].(string)
	}
	trip := mk(map[string]any{"title": "Trip", "start": "2026-11-03", "span": true, "due": map[string]string{"date": "2026-11-05"}, "labels": []string{}, "priority": 2})
	call := mk(map[string]any{"title": "Call", "due": map[string]string{"date": "2026-11-04", "time": "09:00"}, "estimate_minutes": 30, "priority": 1})
	mk(map[string]any{"title": "Someday"})

	_, props := ev.must("PROPFIND", ev.cal("inbox"), propfindCalendars, 207, "Depth", "0")
	if !strings.Contains(props, `name="VEVENT"`) || strings.Contains(props, `name="VTODO"`) {
		t.Fatalf("component set:\n%s", props)
	}
	_, body := ev.must("GET", ev.cal("inbox")+trip+".ics", "", 200)
	for _, want := range []string{"BEGIN:VEVENT", "SUMMARY:Trip", "DTSTART;VALUE=DATE:20261103", "DTEND;VALUE=DATE:20261106", "/task/" + trip} {
		if !strings.Contains(body, want) {
			t.Fatalf("event lacks %q:\n%s", want, body)
		}
	}
	// The undated task is not in the event calendar; the to-do password still sees VTODOs.
	_, list := ev.must("PROPFIND", ev.cal("inbox"), `<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getetag/></d:prop></d:propfind>`, 207, "Depth", "1")
	if strings.Count(list, ".ics") != 2 {
		t.Fatalf("event calendar members:\n%s", list)
	}
	if _, b := todos.must("GET", todos.cal("inbox")+trip+".ics", "", 200); !strings.Contains(b, "BEGIN:VTODO") {
		t.Fatalf("to-do password:\n%s", b)
	}

	// Moving the trip to 10-12 November moves the task and keeps its priority.
	moved := strings.NewReplacer("DTSTART;VALUE=DATE:20261103", "DTSTART;VALUE=DATE:20261110", "DTEND;VALUE=DATE:20261106", "DTEND;VALUE=DATE:20261113").Replace(body)
	ev.must("PUT", ev.cal("inbox")+trip+".ics", moved, 204)
	got := e.task(trip)
	if got["start"] != "2026-11-10" || got["due"].(map[string]any)["date"] != "2026-11-12" || got["span"] != true || got["priority"].(float64) != 2 {
		t.Fatalf("moved trip = %v", got)
	}
	// Renaming and retiming the call; its priority stays although the event has none.
	_, cb := ev.must("GET", ev.cal("inbox")+call+".ics", "", 200)
	re := strings.NewReplacer("SUMMARY:Call", "SUMMARY:Call the bank", "T090000", "T110000", "T093000", "T113000").Replace(cb)
	ev.must("PUT", ev.cal("inbox")+call+".ics", re, 204)
	got = e.task(call)
	if got["title"] != "Call the bank" || got["due"].(map[string]any)["time"] != "11:00" || got["priority"].(float64) != 1 {
		t.Fatalf("edited call = %v", got)
	}
	// Deleting the event keeps the task without a due date.
	ev.must("DELETE", ev.cal("inbox")+call+".ics", "", 204)
	got = e.task(call)
	if got["deleted_at"] != nil || got["due"] != nil {
		t.Fatalf("after delete = %v", got)
	}
}
