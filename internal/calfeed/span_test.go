package calfeed

import (
	"strings"
	"testing"
	"time"
)

// TestFeedSpan (OpenSpec change multi-day-tasks, task 6.2): a span is an
// all-day event from its start to the day after its do-on date, also with a
// due time; its RRULE or RDATE carries the first days; a plain task is unchanged.
func TestFeedSpan(t *testing.T) {
	now := time.Date(2026, 10, 31, 9, 0, 0, 0, time.UTC)
	tasks := []FeedTask{
		{ID: "t-trip", Title: "Lisbon trip", Date: "2026-11-05", Start: "2026-11-03"},
		{ID: "t-conf", Title: "Conference", Date: "2026-11-12", Time: sp("17:00"), TZ: sp("Europe/Berlin"), Start: "2026-11-10"},
		{ID: "t-away", Title: "Weekend away", Date: "2026-11-09", Start: "2026-11-08", RRULE: "FREQ=WEEKLY;BYDAY=SU"},
		{ID: "t-month", Title: "Retreat", Date: "2026-11-15", Start: "2026-11-14", RDates: []string{"2026-12-14", "2027-01-14"}},
	}
	out := string(WriteFeed(tasks, FeedOptions{Now: now}))
	for _, want := range []string{
		"DTSTART;VALUE=DATE:20261103\r\nDTEND;VALUE=DATE:20261106",
		"DTSTART;VALUE=DATE:20261110\r\nDTEND;VALUE=DATE:20261113",
		"DTSTART;VALUE=DATE:20261108\r\nDTEND;VALUE=DATE:20261110", "RRULE:FREQ=WEEKLY;BYDAY=SU",
		"DTSTART;VALUE=DATE:20261114\r\nDTEND;VALUE=DATE:20261116", "RDATE;VALUE=DATE:20261214,20270114",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("feed lacks %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, "VTIMEZONE") || strings.Contains(out, "T170000") {
		t.Fatalf("a span with a due time is not all-day:\n%s", out)
	}
	if cal, err := ParseCalendar([]byte(out)); err != nil || len(cal.Events) != 4 {
		t.Fatalf("round trip: %v", err)
	}
	plain := string(WriteFeed([]FeedTask{{ID: "t", Title: "Deferred", Date: "2026-11-05"}}, FeedOptions{Now: now}))
	if !strings.Contains(plain, "DTSTART;VALUE=DATE:20261105\r\nDTEND;VALUE=DATE:20261106") {
		t.Fatalf("plain task:\n%s", plain)
	}
	ev := string(WriteEvent(tasks[2], FeedOptions{Now: now}))
	if strings.Contains(ev, "RRULE") || strings.Contains(ev, "RDATE") || !strings.Contains(ev, "DTSTART;VALUE=DATE:20261108") {
		t.Fatalf("sync event:\n%s", ev)
	}
}
