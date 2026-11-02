package httpapi

import (
	"fmt"
	"os"
	"strings"
	"testing"
)

// location-reminders 1.4: a location reminder is never a VALARM, a PUT
// without it never deletes it, and an inbound PROXIMITY alarm stays client data.
func TestLocationReminderNotServedAsAlarm(t *testing.T) {
	e, c := davSetup(t)
	c.must("PUT", c.cal("inbox")+"t1.ics", vtodoBody("t1", "SUMMARY:Buy stamps", "DUE:20261013T093000"), 201)
	resp, out := e.do("PATCH", "/api/v1/tasks/t1", map[string]any{"location": map[string]any{"name": "Post office", "lat": 45.46, "lon": 9.19}})
	e.mustStatus(resp, 200, out)
	resp, loc := e.do("POST", "/api/v1/reminders", map[string]any{"task_id": "t1", "kind": "arrive", "radius_m": 150})
	e.mustStatus(resp, 201, loc)
	resp, rel := e.do("POST", "/api/v1/reminders", map[string]any{"task_id": "t1", "kind": "relative", "offset_minutes": -30})
	e.mustStatus(resp, 201, rel)
	_, ics := c.must("GET", c.cal("inbox")+"t1.ics", "", 200)
	if strings.Count(ics, "BEGIN:VALARM") != 1 || strings.Contains(ics, loc["id"].(string)) || !strings.Contains(ics, "X-OPENTODO-ALARMS:1") {
		t.Fatalf("served:\n%s", ics)
	}
	// Sent back unchanged: both reminders stay and nothing is written.
	before := fmt.Sprint(e.caldavOps(loc["id"].(string)), e.caldavOps(rel["id"].(string)))
	c.must("PUT", c.cal("inbox")+"t1.ics", ics, 204)
	if rems := e.reminders("t1"); len(rems) != 2 {
		t.Fatalf("after round trip %v", rems)
	}
	if fmt.Sprint(e.caldavOps(loc["id"].(string)), e.caldavOps(rel["id"].(string))) != before {
		t.Fatal("unchanged PUT wrote reminder ops")
	}
	// The client drops its only alarm: the relative reminder goes, the
	// location reminder stays.
	start := strings.Index(ics, "BEGIN:VALARM")
	end := strings.Index(ics, "END:VALARM\r\n") + len("END:VALARM\r\n")
	c.must("PUT", c.cal("inbox")+"t1.ics", ics[:start]+ics[end:], 204)
	if rems := e.reminders("t1"); len(rems) != 1 || rems[0]["id"] != loc["id"] {
		t.Fatalf("after removal %v", rems)
	}
}

func TestAppleProximityAlarmIsClientData(t *testing.T) {
	e, c := davSetup(t)
	raw, err := os.ReadFile("../caldav/testdata/apple-proximity.ics")
	if err != nil {
		t.Fatal(err)
	}
	c.must("PUT", c.cal("inbox")+"7A2E4C1B-3D5F-4E6A-8B9C-0D1E2F3A4B5C.ics", string(raw), 201)
	_, ics := c.must("GET", c.cal("inbox")+"7A2E4C1B-3D5F-4E6A-8B9C-0D1E2F3A4B5C.ics", "", 200)
	id := ""
	resp, out := e.do("GET", "/api/v1/tasks", nil)
	e.mustStatus(resp, 200, out)
	for _, t := range out["tasks"].([]any) {
		if m := t.(map[string]any); m["title"] == "Buy stamps" {
			id = m["id"].(string)
		}
	}
	if id == "" {
		t.Fatal("task not created")
	}
	if rems := e.reminders(id); len(rems) != 0 {
		t.Fatalf("proximity alarm became a reminder: %v", rems)
	}
	if !strings.Contains(ics, "PROXIMITY:ARRIVE") || !strings.Contains(ics, "TRIGGER;VALUE=DATE-TIME:19760401T005545Z") {
		t.Fatalf("served:\n%s", ics)
	}
}
