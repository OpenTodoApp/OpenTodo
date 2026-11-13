package calsync

import (
	"fmt"
	"strings"
	"testing"
	"time"
)

// A calendar larger than MaxBody (issue 1226): its listing and its events
// over the window are each more than one answer may carry, so the cycle reads
// them in pieces, and every cycle completes.
func TestLargeCalendarIsReadInPieces(t *testing.T) {
	forBothServers(t, func(t *testing.T, h *harness) {
		h.task("alice", "t1", map[string]any{"title": "Write report", "due": map[string]string{"date": "2026-11-03", "time": "09:00"}})
		h.task("alice", "t2", map[string]any{"title": "Call Anna", "due": map[string]string{"date": "2026-11-05", "time": "10:00"}})
		c := h.connect(false)
		// Other people's events across the store window, with long names (as
		// Google's are) and long descriptions: about 4.6 MB of listing and
		// 11 MB of events.
		const n = 4000
		name := strings.Repeat("g", 1000)
		desc := "DESCRIPTION:" + strings.Repeat("Agenda and notes. ", 85)
		start := time.Date(2026, 8, 20, 8, 0, 0, 0, time.UTC)
		for i := range n {
			day := start.Add(time.Duration(i%440) * 24 * time.Hour).Add(time.Duration(i/440) * time.Hour)
			ev := event(fmt.Sprintf("meeting-%d", i), fmt.Sprintf("Meeting %d", i), "DTSTART:"+day.Format("20060102T150405Z"),
				"DTEND:"+day.Add(30*time.Minute).Format("20060102T150405Z")+"\r\n"+desc, h.clock)
			h.srv.Put("work", fmt.Sprintf("%s-%05d.ics", name, i), ev)
		}
		if got := h.cycle(c); got.Written != 2 {
			t.Fatalf("first cycle = %+v", got)
		}
		events, err := h.w.Feeds.EventsOf(h.ctx, "alice", "2026-08-01", "2027-12-31", false, true)
		if err != nil {
			t.Fatal(err)
		}
		seen := map[string]int{}
		for _, e := range events {
			seen[e.Summary]++
		}
		if len(seen) != n || len(events) != n {
			t.Fatalf("shown %d distinct events (%d occurrences), want %d once each", len(seen), len(events), n)
		}
		// The user moves one task's event and deletes the other's.
		h.clock = h.clock.Add(time.Hour)
		h.srv.Put("work", "t1.ics", event("t1", "Write report", "DTSTART:20261104T140000Z", "DTEND:20261104T143000Z", h.clock))
		h.srv.Delete("work", "t2.ics")
		h.cycle(h.conn(c.ID))
		if d := due(h.get("alice", "t1")); d["date"] != "2026-11-04" || d["time"] != "14:00" {
			t.Fatalf("t1 due = %v", d)
		}
		if raw := string(h.get("alice", "t2")["due"]); raw != "null" {
			t.Fatalf("t2 due = %s, want none after its event was deleted", raw)
		}
		// The calendar was larger than one answer may carry: the server
		// started answers over MaxBody, which the cycle left unread and asked
		// for in pieces instead.
		if got := h.srv.Largest(); got <= MaxBody {
			t.Fatalf("largest answer %d bytes: the calendar is not larger than MaxBody", got)
		}
	})
}

// A batch of events whose answer is over MaxBody is halved until it fits.
func TestMultigetHalvesALargeBatch(t *testing.T) {
	h := newHarness(t)
	desc := "DESCRIPTION:" + strings.Repeat("Long minutes of a long meeting. ", 3000)
	var hrefs []string
	for i := range MultigetBatch {
		name := fmt.Sprintf("big-%02d.ics", i)
		h.srv.Put("work", name, event(fmt.Sprintf("big-%d", i), "Big", "DTSTART:20261103T090000Z", "DTEND:20261103T100000Z\r\n"+desc, h.clock))
		hrefs = append(hrefs, h.srv.CalendarURL("work")+name)
	}
	d := basicDAV(h.w, h.srv.URL, h.srv.User, h.srv.Password)
	got, err := davTransport{d}.fetch(h.ctx, h.srv.CalendarURL("work"), hrefs)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != MultigetBatch {
		t.Fatalf("read %d events, want %d", len(got), MultigetBatch)
	}
	if h.srv.Largest() <= MaxBody || h.srv.Count("REPORT") < 3 {
		t.Fatalf("largest answer %d, %d REPORTs: the batch was not halved", h.srv.Largest(), h.srv.Count("REPORT"))
	}
}
