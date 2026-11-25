package calsync

import (
	"strings"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/calfeed"
	"github.com/OpenTodoApp/opentodo/internal/calsync/calsynctest"
)

// A floating timed task is written at its wall time in the calendar's zone,
// with that zone's TZID and VTIMEZONE, so a client that reads a floating time
// as UTC no longer shows it an hour late (GitHub issue 2084), in winter and in
// summer time, and it reads back as the same floating time.
func TestFloatingTaskWrittenInCalendarZone(t *testing.T) {
	forBothServers(t, func(t *testing.T, h *harness) {
		h.srv.AddCalendar("work", &calsynctest.Calendar{Name: "Work", TimeZone: "Europe/Amsterdam"})
		h.task("alice", "winter", map[string]any{"title": "Winter", "due": map[string]string{"date": "2026-11-26", "time": "13:00"}})
		h.task("alice", "summer", map[string]any{"title": "Summer", "due": map[string]string{"date": "2027-07-01", "time": "10:00"}, "estimate_minutes": 45})
		h.task("alice", "zoned", map[string]any{"title": "Zoned", "due": map[string]string{"date": "2026-11-26", "time": "09:00", "tz": "America/New_York"}})
		c := h.connect(false)
		if n := h.cycle(c); n.Written != 3 {
			t.Fatalf("counts = %+v", n)
		}
		for id, want := range map[string][]string{
			"winter": {"DTSTART;TZID=Europe/Amsterdam:20261126T130000", "DTEND;TZID=Europe/Amsterdam:20261126T133000", "BEGIN:VTIMEZONE", "TZID:Europe/Amsterdam"},
			"summer": {"DTSTART;TZID=Europe/Amsterdam:20270701T100000", "DTEND;TZID=Europe/Amsterdam:20270701T104500", "BEGIN:VTIMEZONE"},
			"zoned":  {"DTSTART;TZID=America/New_York:20261126T090000"},
		} {
			body := h.srv.Get("work", id+".ics")
			for _, w := range want {
				if !strings.Contains(body, w) {
					t.Fatalf("%s lacks %q:\n%s", id, w, body)
				}
			}
			// The event's instant is the wall time in Amsterdam: 12:00 UTC in winter, 08:00 UTC in summer.
			cal, err := calfeed.ParseCalendar([]byte(body))
			if err != nil || len(cal.Events) != 1 {
				t.Fatalf("%s: %v", id, err)
			}
			if utc := map[string]string{"winter": "12:00", "summer": "08:00", "zoned": "14:00"}[id]; cal.Events[0].Start.T.UTC().Format("15:04") != utc {
				t.Fatalf("%s starts at %s UTC, want %s", id, cal.Events[0].Start.T.UTC().Format("15:04"), utc)
			}
		}
		// Read back unchanged: the tasks stay floating and nothing is written again.
		puts := h.srv.Count("PUT")
		h.clock = h.clock.Add(time.Minute)
		if n := h.cycle(h.conn(c.ID)); n.Moved != 0 || n.Written != 0 || h.srv.Count("PUT") != puts {
			t.Fatalf("second cycle = %+v", n)
		}
		if d := due(h.get("alice", "summer")); d["date"] != "2027-07-01" || d["time"] != "10:00" || d["tz"] != "" {
			t.Fatalf("summer due = %v", d)
		}
		// Moved in the calendar to 15:00 Amsterdam time: the task is floating at 15:00.
		h.srv.Put("work", "winter.ics", event("winter", "Winter", "DTSTART;TZID=Europe/Amsterdam:20261127T150000", "DTEND;TZID=Europe/Amsterdam:20261127T153000", h.clock))
		h.clock = h.clock.Add(time.Minute)
		if n := h.cycle(h.conn(c.ID)); n.Moved != 1 {
			t.Fatalf("counts = %+v", n)
		}
		if d := due(h.get("alice", "winter")); d["date"] != "2026-11-27" || d["time"] != "15:00" || d["tz"] != "" {
			t.Fatalf("winter due = %v", d)
		}
	})
}

// An event written floating before the fix is written again once in the
// calendar's zone; a calendar that names no zone keeps floating times.
func TestFloatingEventRewrittenInCalendarZone(t *testing.T) {
	h := newHarness(t)
	h.task("alice", "t1", map[string]any{"title": "Test event", "due": map[string]string{"date": "2026-11-26", "time": "13:00"}})
	c := h.connect(false)
	h.cycle(c)
	if body := h.srv.Get("work", "t1.ics"); !strings.Contains(body, "DTSTART:20261126T130000\r\n") || strings.Contains(body, "VTIMEZONE") {
		t.Fatalf("a calendar without a zone got a zoned event:\n%s", body)
	}
	// Discovery now learns the calendar's zone.
	cals := c.Calendars
	for i := range cals {
		if cals[i].URL == c.TargetURL {
			cals[i].TimeZone = "Europe/Amsterdam"
		}
	}
	if _, err := h.db.Exec(`UPDATE calsync_connections SET calendars = ? WHERE id = ?`, jsonText(cals), c.ID); err != nil {
		t.Fatal(err)
	}
	h.clock = h.clock.Add(time.Minute)
	if n := h.cycle(h.conn(c.ID)); n.Written != 1 || n.Moved != 0 {
		t.Fatalf("counts = %+v", n)
	}
	if body := h.srv.Get("work", "t1.ics"); !strings.Contains(body, "DTSTART;TZID=Europe/Amsterdam:20261126T130000") {
		t.Fatalf("not rewritten in the calendar's zone:\n%s", body)
	}
	if n := h.cycle(h.conn(c.ID)); n.Written != 0 {
		t.Fatalf("third cycle = %+v", n)
	}
}
