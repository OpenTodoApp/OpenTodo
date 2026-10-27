package caldav

import (
	"os"
	"strings"
	"testing"
)

// event wraps VEVENT lines in a calendar object.
func event(lines ...string) []byte {
	return []byte("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\n" + strings.Join(lines, "\r\n") + "\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n")
}

// TestDecodeAppleCalendarEvent (caldav-events-as-tasks): an event saved in
// iOS Calendar becomes a task on its start, its length the estimate, its
// alarm a reminder candidate; VEVENT-only properties are not kept.
func TestDecodeAppleCalendarEvent(t *testing.T) {
	raw, err := os.ReadFile("testdata/apple-calendar-event.ics")
	if err != nil {
		t.Fatal(err)
	}
	in, err := Decode(raw)
	if err != nil {
		t.Fatal(err)
	}
	if in.UID != "9A7B6C5D-4E3F-4A2B-8C1D-0E9F8A7B6C5D" || in.Title != "Dentist" || in.Description != "Bring the insurance card." {
		t.Fatalf("text fields: %+v", in)
	}
	if in.Due == nil || in.Due.Date != "2026-11-03" || in.Due.Time == nil || *in.Due.Time != "09:30" || in.Due.TZ == nil || *in.Due.TZ != "Europe/Berlin" {
		t.Fatalf("due: %+v", in.Due)
	}
	if in.Shape != ShapeStartDuration {
		t.Fatalf("shape %v, want a scheduled block", in.Shape)
	}
	if in.EstimateMinutes == nil || *in.EstimateMinutes != 60 {
		t.Fatalf("estimate: %v", in.EstimateMinutes)
	}
	if len(in.Alarms) != 1 {
		t.Fatalf("alarms: %d", len(in.Alarms))
	}
	if in.Completed {
		t.Fatal("an event is not completed")
	}
	for _, gone := range []string{"DTEND", "TRANSP", "DTSTART"} {
		if strings.Contains(in.Extra, gone) {
			t.Fatalf("%s kept as client data: %q", gone, in.Extra)
		}
	}
	// What a task has no field for stays with the object, as for a VTODO.
	if !strings.Contains(in.Extra, "LOCATION:Hauptstraße 5\\, Berlin") || !strings.Contains(in.Extra, "X-APPLE-TRAVEL-ADVISORY-BEHAVIOR") {
		t.Fatalf("client data: %q", in.Extra)
	}
}

func TestDecodeEventTiming(t *testing.T) {
	cases := []struct {
		name     string
		lines    []string
		date     string
		clock    string // "" for a date-only due
		estimate int    // 0 for none
	}{
		{"all-day", []string{"UID:a", "SUMMARY:Holiday", "DTSTART;VALUE=DATE:20261224", "DTEND;VALUE=DATE:20261227"}, "2026-12-24", "", 0},
		{"duration", []string{"UID:b", "SUMMARY:Call", "DTSTART:20261103T140000Z", "DURATION:PT45M"}, "2026-11-03", "14:00", 45},
		{"floating", []string{"UID:c", "SUMMARY:Walk", "DTSTART:20261103T070000", "DTEND:20261103T073000"}, "2026-11-03", "07:00", 30},
		{"across DST", []string{"UID:d", "SUMMARY:Night shift", "DTSTART;TZID=Europe/Berlin:20261024T220000", "DTEND;TZID=Europe/Berlin:20261025T060000"}, "2026-10-24", "22:00", 9 * 60},
		{"no end", []string{"UID:e", "SUMMARY:Ping", "DTSTART:20261103T090000Z"}, "2026-11-03", "09:00", 0},
		{"end before start", []string{"UID:f", "SUMMARY:Odd", "DTSTART:20261103T090000Z", "DTEND:20261103T080000Z"}, "2026-11-03", "09:00", 0},
		{"longer than a week", []string{"UID:g", "SUMMARY:Trip", "DTSTART:20261101T090000Z", "DTEND:20261120T090000Z"}, "2026-11-01", "09:00", 0},
	}
	for _, c := range cases {
		in, err := Decode(event(c.lines...))
		if err != nil {
			t.Fatalf("%s: %v", c.name, err)
		}
		if in.Due == nil || in.Due.Date != c.date {
			t.Fatalf("%s: due %+v", c.name, in.Due)
		}
		if (c.clock == "") != (in.Due.Time == nil) || (in.Due.Time != nil && *in.Due.Time != c.clock) {
			t.Fatalf("%s: time %v, want %q", c.name, in.Due.Time, c.clock)
		}
		got := 0
		if in.EstimateMinutes != nil {
			got = *in.EstimateMinutes
		}
		if got != c.estimate {
			t.Fatalf("%s: estimate %d, want %d", c.name, got, c.estimate)
		}
		if strings.Contains(in.Extra, "DTEND") || strings.Contains(in.Extra, "DURATION") {
			t.Fatalf("%s: timing kept as client data: %q", c.name, in.Extra)
		}
	}
}

func TestDecodeEventRecurrenceAndStatus(t *testing.T) {
	in, err := Decode(event("UID:r", "SUMMARY:Standup", "DTSTART;TZID=Europe/Berlin:20261102T091500", "DTEND;TZID=Europe/Berlin:20261102T093000", "RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR"))
	if err != nil {
		t.Fatal(err)
	}
	if in.Rule == "" || strings.Contains(in.Extra, "RRULE") {
		t.Fatalf("a weekly event repeats as a task: rule %q extra %q", in.Rule, in.Extra)
	}
	if in.EstimateMinutes == nil || *in.EstimateMinutes != 15 {
		t.Fatalf("estimate: %v", in.EstimateMinutes)
	}
	// A rule the task grammar cannot express is kept with the object; the task is still created.
	in, err = Decode(event("UID:r2", "SUMMARY:Odd rule", "DTSTART:20261102T090000Z", "RRULE:FREQ=MINUTELY;INTERVAL=7"))
	if err != nil || in.Rule != "" || !strings.Contains(in.Extra, "RRULE:FREQ=MINUTELY") {
		t.Fatalf("unmapped rule: %v %q %q", err, in.Rule, in.Extra)
	}
	// Confirmed and tentative events are open tasks; a cancelled one is done.
	for status, done := range map[string]bool{"CONFIRMED": false, "TENTATIVE": false, "CANCELLED": true} {
		in, err := Decode(event("UID:s", "SUMMARY:x", "DTSTART:20261102T090000Z", "STATUS:"+status))
		if err != nil || in.Completed != done || strings.Contains(in.Extra, "STATUS") {
			t.Fatalf("%s: err %v completed %v extra %q", status, err, in.Completed, in.Extra)
		}
	}
}

// An event's DTEND or TRANSP never reaches the VTODO this server serves back.
func TestEventServedBackAsVTODO(t *testing.T) {
	raw, _ := os.ReadFile("testdata/apple-calendar-event.ics")
	in, err := Decode(raw)
	if err != nil {
		t.Fatal(err)
	}
	out := string(Encode(Task{UID: in.UID, Title: in.Title, Description: in.Description, Priority: in.Priority, Due: in.Due, Extra: in.Extra}))
	if !strings.Contains(out, "BEGIN:VTODO") || strings.Contains(out, "VEVENT") || strings.Contains(out, "DTEND") || strings.Contains(out, "TRANSP") {
		t.Fatalf("served object:\n%s", out)
	}
	if back, err := Decode([]byte(out)); err != nil || back.UID != in.UID || back.Title != "Dentist" {
		t.Fatalf("the served VTODO reads back: %v %+v", err, back)
	}
}
