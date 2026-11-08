package calfeed

import (
	"strings"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/caldav"
)

func sp(s string) *string { return &s }

func TestWriteFeed(t *testing.T) {
	now := time.Date(2026, 10, 15, 9, 0, 0, 0, time.UTC)
	tasks := []FeedTask{
		{ID: "t-dentist", Title: "Dentist", Date: "2026-10-16", Time: sp("15:00"), Estimate: 45, Labels: []string{"health", "a,b"}, Priority: 1, Description: "Bring the card"},
		{ID: "t-standup", Title: "Standup", Date: "2026-10-19", Time: sp("09:30"), TZ: sp("Europe/Berlin"), RRULE: "FREQ=WEEKLY;BYDAY=MO"},
		{ID: "t-taxes", Title: "Taxes", Date: "2026-10-20"},
		{ID: "t-old", Title: "Long ago", Date: "2025-01-01"},
		{ID: "t-undated", Title: "Someday"},
	}
	out := string(WriteFeed(tasks, FeedOptions{Now: now, BaseURL: "https://todo.example"}))
	for _, want := range []string{
		"METHOD:PUBLISH", "X-WR-CALNAME:OpenTodo", "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
		"UID:t-dentist", "DTSTART:20261016T150000", "DTEND:20261016T154500", "CATEGORIES:health,a\\,b", "DESCRIPTION:Bring the card",
		"DTSTART;TZID=Europe/Berlin:20261019T093000", "DTEND;TZID=Europe/Berlin:20261019T100000", "RRULE:FREQ=WEEKLY;BYDAY=MO", "BEGIN:VTIMEZONE",
		"DTSTART;VALUE=DATE:20261020", "DTEND;VALUE=DATE:20261021", "URL:https://todo.example/day/2026-10-20",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("feed lacks %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, "t-old") || strings.Contains(out, "t-undated") {
		t.Fatalf("out-of-window or undated task in the feed:\n%s", out)
	}
	// The output folds and parses, and reads back as events.
	cal, err := ParseCalendar([]byte(out))
	if err != nil || len(cal.Events) != 3 {
		t.Fatalf("round trip: %v %d", err, len(cal.Events))
	}
	if _, err := caldav.Parse([]byte(out)); err != nil {
		t.Fatal(err)
	}
	enc := string(WriteFeed(tasks[:1], FeedOptions{Now: now, Encrypted: true}))
	if !strings.Contains(enc, "SUMMARY:Encrypted item") || strings.Contains(enc, "DESCRIPTION") || strings.Contains(enc, "CATEGORIES") {
		t.Fatalf("encrypted feed:\n%s", enc)
	}
}

// The feed shares the CalDAV zone definition (issue #1028): a zoned event's
// VTIMEZONE comes before the events and follows the zone's yearly rules, so a
// weekly event keeps its wall time after the year's last transition.
func TestWriteFeedZoneDefinition(t *testing.T) {
	now := time.Date(2026, 10, 15, 9, 0, 0, 0, time.UTC)
	out := string(WriteFeed([]FeedTask{
		{ID: "t-standup", Title: "Standup", Date: "2026-10-19", Time: sp("09:30"), TZ: sp("Europe/Berlin"), RRULE: "FREQ=WEEKLY;BYDAY=MO"},
		{ID: "t-sync", Title: "Sync", Date: "2026-10-20", Time: sp("10:00"), TZ: sp("Europe/Berlin")},
	}, FeedOptions{Now: now}))
	if strings.Count(out, "BEGIN:VTIMEZONE") != 1 || strings.Index(out, "BEGIN:VTIMEZONE") > strings.Index(out, "BEGIN:VEVENT") {
		t.Fatalf("one VTIMEZONE before the events:\n%s", out)
	}
	for _, want := range []string{"TZID:Europe/Berlin", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU"} {
		if !strings.Contains(out, want) {
			t.Errorf("feed lacks %q:\n%s", want, out)
		}
	}
}
