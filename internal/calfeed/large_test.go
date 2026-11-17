package calfeed

import (
	"context"
	"fmt"
	"net/http"
	"runtime"
	"strings"
	"testing"
	"time"
)

// googleHistory is a calendar like Google's secret address gives (#1481): its
// whole history of single events, a weekly series started years ago with an
// override in the window, a series that ended years ago, and a few events in
// the window, padded to about size bytes.
func googleHistory(size int) string {
	var b strings.Builder
	b.WriteString("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nX-WR-CALNAME:Family\r\nX-WR-TIMEZONE:Europe/Berlin\r\n")
	b.WriteString("BEGIN:VTIMEZONE\r\nTZID:Europe/Berlin\r\nEND:VTIMEZONE\r\n")
	b.WriteString("BEGIN:VEVENT\r\nUID:weekly\r\nDTSTART;TZID=Europe/Berlin:20150105T090000\r\nDTEND;TZID=Europe/Berlin:20150105T093000\r\nRRULE:FREQ=WEEKLY;BYDAY=MO\r\nSUMMARY:Stand-up\r\nEND:VEVENT\r\n")
	b.WriteString("BEGIN:VEVENT\r\nUID:ended\r\nDTSTART:20150101T100000Z\r\nRRULE:FREQ=DAILY;UNTIL=20191231T100000Z\r\nSUMMARY:Old course\r\nEND:VEVENT\r\n")
	pad := strings.Repeat("Notes about the meeting. ", 8)
	day := time.Date(2008, 1, 1, 0, 0, 0, 0, time.UTC)
	for i := 0; b.Len() < size-4096; i++ {
		d := day.AddDate(0, 0, i%5800).Format("20060102") // 2008 to mid 2023
		fmt.Fprintf(&b, "BEGIN:VEVENT\r\nUID:past-%d\r\nDTSTART:%sT080000Z\r\nDTEND:%sT090000Z\r\nSUMMARY:Past %d\r\nDESCRIPTION:%s\r\nBEGIN:VALARM\r\nTRIGGER:-PT10M\r\nACTION:DISPLAY\r\nEND:VALARM\r\nEND:VEVENT\r\n", i, d, d, i, pad)
	}
	b.WriteString("BEGIN:VEVENT\r\nUID:weekly\r\nRECURRENCE-ID;TZID=Europe/Berlin:20261019T090000\r\nDTSTART;TZID=Europe/Berlin:20261019T110000\r\nDTEND;TZID=Europe/Berlin:20261019T113000\r\nSUMMARY:Stand-up moved\r\nEND:VEVENT\r\n")
	b.WriteString("BEGIN:VEVENT\r\nUID:weekly\r\nRECURRENCE-ID;TZID=Europe/Berlin:20261026T090000\r\nDTSTART;TZID=Europe/Berlin:20190101T110000\r\nSUMMARY:Moved out\r\nEND:VEVENT\r\n")
	b.WriteString("BEGIN:VEVENT\r\nUID:soon\r\nDTSTART;VALUE=DATE:20261020\r\nSUMMARY:Birthday\r\nEND:VEVENT\r\n")
	b.WriteString("BEGIN:VEVENT\r\nUID:recent\r\nDTSTART:20260901T080000Z\r\nDTEND:20260901T090000Z\r\nSUMMARY:Recent\r\nEND:VEVENT\r\n")
	b.WriteString("END:VCALENDAR\r\n")
	return b.String()
}

func TestFetchLargeCalendarKeepsTheWindow(t *testing.T) {
	body := googleHistory(10 << 20)
	f := localFetcher() // 2026-10-15
	srv := serve(t, func(w http.ResponseWriter, r *http.Request) { w.Write([]byte(body)) })
	res, err := f.Fetch(context.Background(), &Subscription{URL: srv.URL})
	if err != nil {
		t.Fatalf("a %d MB calendar: %v", len(body)>>20, err)
	}
	if res.Name != "Family" {
		t.Errorf("name = %q", res.Name)
	}
	count := map[string]int{}
	for _, o := range res.Occurrences {
		count[o.UID]++
		if strings.HasPrefix(o.UID, "past-") || o.UID == "ended" {
			t.Fatalf("an event outside the window was kept: %+v", o)
		}
		if o.UID == "weekly" && o.Instance == "20261026T080000Z" {
			t.Errorf("the occurrence moved out of the window is still there: %+v", o)
		}
		if o.UID == "weekly" && o.Instance == "20261019T070000Z" && o.Summary != "Stand-up moved" {
			t.Errorf("override not applied: %+v", o)
		}
	}
	// 62 days back and 400 ahead: about 66 Mondays, one moved away.
	if n := count["weekly"]; n < 60 || n > 70 {
		t.Errorf("weekly occurrences = %d, want about 65", n)
	}
	if count["soon"] != 1 || count["recent"] != 1 {
		t.Errorf("windowed events = %v", count)
	}
}

// TestReadCalendarMemory: while a large calendar is read, live memory stays
// far below its size: one event at a time plus the kept ones, never the body.
func TestReadCalendarMemory(t *testing.T) {
	body := googleHistory(10 << 20)
	win := StoreWindow(time.Date(2026, 10, 15, 12, 0, 0, 0, time.UTC))
	live := func() int64 {
		runtime.GC()
		var m runtime.MemStats
		runtime.ReadMemStats(&m)
		return int64(m.HeapAlloc)
	}
	base, peak, n := live(), int64(0), 0
	cal, err := ReadCalendar(strings.NewReader(body), func(ev Event) bool {
		if n++; n%2000 == 0 {
			peak = max(peak, live()-base)
		}
		return Reaches(ev, win)
	})
	if err != nil || n < 20000 {
		t.Fatalf("read %d events: %v", n, err)
	}
	t.Logf("peak live growth %d KB", peak>>10)
	if peak > 2<<20 {
		t.Errorf("live memory grew by %d KB reading a %d MB calendar", peak>>10, len(body)>>20)
	}
	if len(cal.Events) != 5 {
		t.Errorf("kept %d events, want 5: the series, its two overrides, soon and recent", len(cal.Events))
	}
}

func TestFetchOverTheLimit(t *testing.T) {
	body := googleHistory(MaxFeedBytes + 1<<20)
	f := localFetcher()
	srv := serve(t, func(w http.ResponseWriter, r *http.Request) { w.Write([]byte(body)) })
	if _, err := f.Fetch(context.Background(), &Subscription{URL: srv.URL}); err == nil || err.Error() != "too_large" {
		t.Fatalf("over %d MB = %v, want too_large", MaxFeedBytes>>20, err)
	}
}

func TestReachesRecurring(t *testing.T) {
	win := StoreWindow(time.Date(2026, 10, 15, 12, 0, 0, 0, time.UTC))
	at := func(y int, m time.Month, d int) Point {
		return Point{T: time.Date(y, m, d, 9, 0, 0, 0, time.UTC), Zone: "UTC"}
	}
	cases := []struct {
		name string
		ev   Event
		want bool
	}{
		{"old single", Event{UID: "a", Start: at(2012, 3, 1)}, false},
		{"single in window", Event{UID: "a", Start: at(2026, 11, 1)}, true},
		{"single after window", Event{UID: "a", Start: at(2028, 1, 1)}, false},
		{"old long event reaching in", Event{UID: "a", Start: at(2026, 8, 1), End: &Point{T: time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC), Zone: "UTC"}}, true},
		{"series without end", Event{UID: "a", Start: at(2010, 1, 4), RRule: "FREQ=WEEKLY"}, true},
		{"series with COUNT", Event{UID: "a", Start: at(2010, 1, 4), RRule: "FREQ=YEARLY;COUNT=100"}, true},
		{"series ended", Event{UID: "a", Start: at(2010, 1, 4), RRule: "FREQ=WEEKLY;UNTIL=20200101T000000Z"}, false},
		{"series ending in window", Event{UID: "a", Start: at(2010, 1, 4), RRule: "FREQ=WEEKLY;UNTIL=20261001"}, true},
		{"unsupported rule", Event{UID: "a", Start: at(2010, 1, 4), RRule: "FREQ=SECONDLY", Cancelled: true}, true},
		{"old RDATE", Event{UID: "a", Start: at(2010, 1, 4), RDates: []Point{at(2011, 1, 1)}}, false},
		{"RDATE in window", Event{UID: "a", Start: at(2010, 1, 4), RDates: []Point{at(2026, 12, 1)}}, true},
		{"old override", Event{UID: "a", RecurrenceID: "20120101T090000Z", Start: at(2012, 1, 1)}, false},
		{"override moved out", Event{UID: "a", RecurrenceID: "20261101T090000Z", Start: at(2012, 1, 1)}, true},
		{"override moved in", Event{UID: "a", RecurrenceID: "20120101", Start: at(2026, 11, 1)}, true},
		{"this and future", Event{UID: "a", RecurrenceID: "20120101T090000Z", Range: "THISANDFUTURE", Start: at(2012, 1, 1)}, true},
	}
	for _, c := range cases {
		if got := Reaches(c.ev, win); got != c.want {
			t.Errorf("%s: Reaches = %v, want %v", c.name, got, c.want)
		}
	}
}

func TestReadCalendarKeptLimit(t *testing.T) {
	var b strings.Builder
	b.WriteString("BEGIN:VCALENDAR\r\n")
	long := strings.Repeat("x", 60000)
	for i := 0; i < 80; i++ {
		fmt.Fprintf(&b, "BEGIN:VEVENT\r\nUID:e%d\r\nDTSTART:20261020T080000Z\r\nSUMMARY:%s\r\nEND:VEVENT\r\n", i, long)
	}
	b.WriteString("END:VCALENDAR\r\n")
	cal, err := ParseCalendar([]byte(b.String()))
	if err != nil {
		t.Fatal(err)
	}
	if len(cal.Events) == 0 || len(cal.Events) >= 80 || len(cal.Warnings) != 1 {
		t.Fatalf("kept %d events, warnings %v", len(cal.Events), cal.Warnings)
	}
}
