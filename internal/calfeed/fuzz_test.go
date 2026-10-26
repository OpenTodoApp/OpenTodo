package calfeed

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// FuzzParseAndExpand: a subscribed calendar is whatever the remote server
// sends (wave 2 of the 2026-10 audit, Z1). Parsing must not panic, and the
// expansion of whatever parses stays within the stored-occurrence limit, keeps
// only occurrences in the window, and stops within its work budget (a fuzz
// input that loops forever shows up as a hang).
func FuzzParseAndExpand(f *testing.F) {
	files, _ := filepath.Glob("testdata/*.ics")
	for _, p := range files {
		b, err := os.ReadFile(p)
		if err != nil {
			f.Fatal(err)
		}
		f.Add(b)
	}
	for _, s := range []string{
		"BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:a\r\nDTSTART;VALUE=DATE:20261001\r\nRRULE:FREQ=MONTHLY;BYDAY=-1FR;BYSETPOS=1,-1;COUNT=40\r\nEXDATE:20261031\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n",
		"BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:a\r\nDTSTART;TZID=Europe/Berlin:20261025T023000\r\nDURATION:PT1H\r\nRRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=SU;WKST=SU;INTERVAL=1\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:a\r\nRECURRENCE-ID;RANGE=THISANDFUTURE:20271031T023000\r\nDTSTART:20271101T100000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n",
		"BEGIN:VCALENDAR\r\nX-WR-TIMEZONE:America/New_York\r\nREFRESH-INTERVAL;VALUE=DURATION:P1W\r\nBEGIN:VEVENT\r\nUID:b\r\nDTSTART:20260101T090000\r\nRRULE:FREQ=DAILY;UNTIL=20251231\r\nRDATE:20261018T090000\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n",
	} {
		f.Add([]byte(s))
	}
	win := StoreWindow(time.Date(2026, 10, 17, 12, 0, 0, 0, time.UTC))
	f.Fuzz(func(t *testing.T, data []byte) {
		cal, err := ParseCalendar(data)
		if err != nil {
			return
		}
		x := &expansion{ctx: context.Background(), left: maxExpandWork}
		for _, ev := range cal.Events {
			starts(ev, win, warnings{}, x)
		}
		occ, _ := ExpandContext(context.Background(), cal.Events, win, MaxOccurrences)
		if len(occ) > MaxOccurrences {
			t.Fatalf("%d occurrences, more than the limit", len(occ))
		}
		for _, o := range occ {
			if !overlaps(o, win) {
				t.Fatalf("occurrence %+v outside the window", o)
			}
			if o.End.T.Before(o.Start.T) {
				t.Fatalf("occurrence ends before it starts: %+v", o)
			}
		}
		if cal.Refresh < 0 {
			t.Fatalf("negative refresh interval %v", cal.Refresh)
		}
	})
}
