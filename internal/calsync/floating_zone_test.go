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

// A wall time the clocks skip is written as given, ends its length after the
// instant RFC 5545 §3.3.5 gives it, and reads back as the same task, floating
// in the calendar's zone or zoned.
func TestDaylightSavingGapRoundTrip(t *testing.T) {
	for _, c := range []struct{ zone, date, clock, end string }{
		{"Europe/Amsterdam", "2027-03-28", "02:30", "20270328T040000"},
		{"Australia/Sydney", "2026-10-04", "02:30", "20261004T040000"},
		{"America/New_York", "2027-03-14", "02:15", "20270314T034500"},
	} {
		loc, err := time.LoadLocation(c.zone)
		if err != nil {
			t.Fatal(err)
		}
		zone, clock := c.zone, c.clock
		for _, task := range []calfeed.FeedTask{
			{ID: "floating", Title: "X", Date: c.date, Time: &clock},
			{ID: "zoned", Title: "X", Date: c.date, Time: &clock, TZ: &zone},
		} {
			body := string(calfeed.WriteEvent(task, calfeed.FeedOptions{Now: time.Now(), FloatingZone: c.zone}))
			start := "DTSTART;TZID=" + c.zone + ":" + strings.ReplaceAll(c.date, "-", "") + "T" + strings.ReplaceAll(c.clock, ":", "") + "00"
			if !strings.Contains(body, start) || !strings.Contains(body, "DTEND;TZID="+c.zone+":"+c.end) {
				t.Fatalf("%s %s: want %s and end %s:\n%s", c.zone, task.ID, start, c.end, body)
			}
			cal, err := calfeed.ParseCalendar([]byte(body))
			if err != nil || len(cal.Events) != 1 {
				t.Fatalf("%s %s: %v", c.zone, task.ID, err)
			}
			want := TaskSnapshot(task, false)
			if got := EventSnapshot(cal.Events[0], want, loc); !got.SameTimes(want) {
				t.Fatalf("%s %s: read back %+v, want %+v", c.zone, task.ID, got, want)
			}
		}
	}
}

// With a calendar per project, a task is written in the zone of its own
// calendar, not the main one's.
func TestProjectCalendarZone(t *testing.T) {
	h := newHarness(t)
	h.srv.AddCalendar("work", &calsynctest.Calendar{Name: "Work", TimeZone: "Europe/Amsterdam"})
	h.srv.AddCalendar("home", &calsynctest.Calendar{Name: "Home", TimeZone: "America/New_York"})
	h.task("alice", "t1", map[string]any{"title": "Paint the fence", "project_id": "p-home", "due": map[string]string{"date": "2026-11-03", "time": "09:00"}})
	h.task("alice", "t2", map[string]any{"title": "Write report", "due": map[string]string{"date": "2026-11-04", "time": "10:00"}})
	c := h.connect(false)
	// A server that lists the calendar without its trailing slash, which the
	// cycle adds to its target.
	var home string
	cals := c.Calendars
	for i := range cals {
		if cals[i].Name == "Home" {
			cals[i].URL = strings.TrimSuffix(cals[i].URL, "/")
			home = cals[i].URL
		}
	}
	if _, err := h.db.Exec(`UPDATE calsync_connections SET calendars = ? WHERE id = ?`, jsonText(cals), c.ID); err != nil {
		t.Fatal(err)
	}
	if err := h.w.Store.SetProjectTargets(h.ctx, c.ID, map[string]string{"p-home": home}); err != nil {
		t.Fatal(err)
	}
	if n := h.cycle(h.conn(c.ID)); n.Written != 2 {
		t.Fatalf("counts = %+v", n)
	}
	if b := h.srv.Get("home", "t1.ics"); !strings.Contains(b, "DTSTART;TZID=America/New_York:20261103T090000") {
		t.Fatalf("home event:\n%s", b)
	}
	if b := h.srv.Get("work", "t2.ics"); !strings.Contains(b, "DTSTART;TZID=Europe/Amsterdam:20261104T100000") {
		t.Fatalf("work event:\n%s", b)
	}
	if n := h.cycle(h.conn(c.ID)); n.Written != 0 || n.Moved != 0 {
		t.Fatalf("quiet cycle = %+v", n)
	}
}
