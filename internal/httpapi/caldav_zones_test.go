package httpapi

import (
	"fmt"
	"strings"
	"testing"
)

// Zoned dues over CalDAV (issue #1028): a task fixed to a time zone is served
// at its instant in UTC, and the UTC time a client such as Apple Reminders
// sends back is read in the task's zone again, so an unchanged echo writes
// nothing and a moved time keeps the zone.

func TestCaldavZonedDueServedInUTC(t *testing.T) {
	e, c := davSetup(t)
	// Created elsewhere with a zone, as the MCP tools often do.
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Call", "due": map[string]any{"date": "2026-07-10", "time": "09:00", "tz": "Europe/Berlin"}})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	_, ics := c.must("GET", c.cal("inbox")+id+".ics", "", 200)
	for _, want := range []string{"\r\nDUE:20260710T070000Z\r\n", "\r\nDTSTART:20260710T070000Z\r\n"} {
		if !strings.Contains(ics, want) {
			t.Fatalf("GET lacks %q:\n%s", want, ics)
		}
	}
	if strings.Contains(ics, "TZID") || strings.Contains(ics, "VTIMEZONE") {
		t.Fatalf("zoned one-off served with a zone:\n%s", ics)
	}
}

func TestCaldavZonedDueEchoWritesNothing(t *testing.T) {
	cases := []struct {
		name, due, want string
	}{
		{"berlin summer", "DUE;TZID=Europe/Berlin:20260710T090000", "20260710T070000Z"},
		{"berlin winter", "DUE;TZID=Europe/Berlin:20260115T090000", "20260115T080000Z"},
		{"new york", "DUE;TZID=America/New_York:20260710T090000", "20260710T130000Z"},
		// Early in the morning in Kolkata is the day before in UTC.
		{"kolkata", "DUE;TZID=Asia/Kolkata:20260710T030000", "20260709T213000Z"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			e, c := davSetup(t)
			c.must("PUT", c.cal("inbox")+"z.ics", vtodoBody("z", "SUMMARY:Zoned", tc.due,
				"BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-PT15M", "END:VALARM"), 201)
			was := e.task("z")["due"]
			rems := e.reminders("z")
			if len(rems) != 1 {
				t.Fatalf("reminders %v", rems)
			}
			rid := rems[0]["id"].(string)
			before := fmt.Sprint(e.caldavOps("z"), e.caldavOps(rid))
			_, ics := c.must("GET", c.cal("inbox")+"z.ics", "", 200)
			if !strings.Contains(ics, "\r\nDUE:"+tc.want+"\r\n") {
				t.Fatalf("served:\n%s", ics)
			}
			// The client writes the object back as it got it.
			c.must("PUT", c.cal("inbox")+"z.ics", ics, 204)
			if after := fmt.Sprint(e.caldavOps("z"), e.caldavOps(rid)); after != before {
				t.Fatalf("echo wrote ops: %s -> %s", before, after)
			}
			if got := e.task("z")["due"]; fmt.Sprint(got) != fmt.Sprint(was) {
				t.Fatalf("due %v -> %v", was, got)
			}
		})
	}
}

func TestCaldavZonedDueMovedKeepsZone(t *testing.T) {
	e, c := davSetup(t)
	c.must("PUT", c.cal("inbox")+"z.ics", vtodoBody("z", "SUMMARY:Zoned", "DUE;TZID=Europe/Berlin:20260710T090000"), 201)
	_, ics := c.must("GET", c.cal("inbox")+"z.ics", "", 200)
	// Moved to 10:30 local time on the next day, sent in UTC.
	moved := strings.ReplaceAll(ics, "20260710T070000Z", "20260711T083000Z")
	c.must("PUT", c.cal("inbox")+"z.ics", moved, 204)
	if d := e.task("z")["due"].(map[string]any); d["date"] != "2026-07-11" || d["time"] != "10:30" || d["tz"] != "Europe/Berlin" {
		t.Fatalf("moved due: %v", d)
	}
	if n := e.caldavOps("z")["due"]; n != 2 {
		t.Fatalf("due ops %d", n)
	}
	// Past midnight in Berlin is still the evening before in UTC.
	_, ics = c.must("GET", c.cal("inbox")+"z.ics", "", 200)
	moved = strings.ReplaceAll(ics, "20260711T083000Z", "20260711T223000Z")
	c.must("PUT", c.cal("inbox")+"z.ics", moved, 204)
	if d := e.task("z")["due"].(map[string]any); d["date"] != "2026-07-12" || d["time"] != "00:30" || d["tz"] != "Europe/Berlin" {
		t.Fatalf("moved past midnight: %v", d)
	}
	// A client that writes its own zone sets that zone, as before.
	c.must("PUT", c.cal("inbox")+"z.ics", vtodoBody("z", "SUMMARY:Zoned", "DUE;TZID=America/New_York:20260712T080000"), 204)
	if d := e.task("z")["due"].(map[string]any); d["time"] != "08:00" || d["tz"] != "America/New_York" {
		t.Fatalf("client zone: %v", d)
	}
}

func TestCaldavZonedSeriesKeepsTZID(t *testing.T) {
	e, c := davSetup(t)
	resp, out := e.do("POST", "/api/v1/tasks", map[string]any{"title": "Standup", "description": "Notes", "recurrence": "every week",
		"due": map[string]any{"date": "2026-07-10", "time": "09:00", "tz": "Europe/Berlin"}})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	_, ics := c.must("GET", c.cal("inbox")+id+".ics", "", 200)
	for _, want := range []string{"DUE;TZID=Europe/Berlin:20260710T090000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU"} {
		if !strings.Contains(ics, want) {
			t.Fatalf("GET lacks %q:\n%s", want, ics)
		}
	}
	if strings.Index(ics, "BEGIN:VTIMEZONE") > strings.Index(ics, "BEGIN:VTODO") {
		t.Fatalf("VTIMEZONE after the VTODO:\n%s", ics)
	}
	before := fmt.Sprint(e.caldavOps(id))
	c.must("PUT", c.cal("inbox")+id+".ics", ics, 204)
	if after := fmt.Sprint(e.caldavOps(id)); after != before {
		t.Fatalf("echo wrote ops: %s -> %s", before, after)
	}
}
