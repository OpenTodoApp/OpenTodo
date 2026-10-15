package calfeed

import (
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"
)

func load(t *testing.T, name string) *Calendar {
	t.Helper()
	data, err := os.ReadFile("testdata/" + name)
	if err != nil {
		t.Fatal(err)
	}
	cal, err := ParseCalendar(data)
	if err != nil {
		t.Fatalf("%s: %v", name, err)
	}
	return cal
}

func day(s string) time.Time {
	t, _ := time.Parse("2006-01-02", s)
	return t
}

func win(from, to string) Window { return Window{From: day(from), To: day(to)} }

func starts_(occ []Occurrence) []string {
	var out []string
	for _, o := range occ {
		switch {
		case o.AllDay:
			out = append(out, o.Start.T.Format("2006-01-02")+".."+o.End.T.Format("2006-01-02"))
		case o.Start.Zone == "":
			out = append(out, o.Start.T.Format("2006-01-02 15:04")+" floating")
		default:
			out = append(out, o.Start.T.UTC().Format("2006-01-02 15:04Z"))
		}
	}
	return out
}

func TestParseVendorFixtures(t *testing.T) {
	g := load(t, "google.ics")
	if g.Name != "Work" || g.Zone != "Europe/Berlin" || len(g.Events) != 3 {
		t.Fatalf("google = %+v", g)
	}
	o := load(t, "outlook.ics")
	if o.Events[0].Start.Zone != "Europe/Berlin" {
		t.Fatalf("outlook zone = %q", o.Events[0].Start.Zone)
	}
	n := load(t, "nextcloud.ics")
	if n.Refresh != 4*time.Hour || n.Events[0].Start.Zone != "Europe/Rome" || n.Events[1].Start.Zone != "" {
		t.Fatalf("nextcloud = %+v %+v", n.Refresh, n.Events[0].Start)
	}
	i := load(t, "icloud.ics")
	if i.Events[0].Duration == nil || *i.Events[0].Duration != time.Hour {
		t.Fatalf("icloud duration = %v", i.Events[0].Duration)
	}
	html, _ := os.ReadFile("testdata/html.txt")
	if _, err := ParseCalendar(html); !errors.Is(err, ErrInvalid) {
		t.Fatalf("html: %v", err)
	}
	if c, _ := ParseCalendar([]byte("BEGIN:VCALENDAR\r\nX-PUBLISHED-TTL:PT1H\r\nEND:VCALENDAR\r\n")); c.Refresh != time.Hour {
		t.Fatalf("ttl = %v", c.Refresh)
	}
}

func TestResolveZones(t *testing.T) {
	for in, want := range map[string]string{
		"W. Europe Standard Time": "Europe/Berlin", "Pacific Standard Time": "America/Los_Angeles",
		"/mozilla.org/20050126_1/Europe/Berlin": "Europe/Berlin", "Europe/Rome": "Europe/Rome", "UTC": "UTC",
	} {
		loc, ok := Resolve(in)
		if !ok || loc.String() != want {
			t.Errorf("%s = %v %v", in, loc, ok)
		}
	}
	if _, ok := Resolve("Middle Earth Standard Time"); ok {
		t.Error("unknown zone resolved")
	}
}

func TestExpandGoogleWeeklyWithExdateAndMovedInstance(t *testing.T) {
	g := load(t, "google.ics")
	occ, warns := Expand(g.Events, win("2026-10-01", "2026-11-01"), MaxOccurrences)
	got := starts_(occ)
	want := []string{"2026-10-05 08:00Z", "2026-10-15..2026-10-17", "2026-10-19 10:00Z", "2026-10-26 09:00Z"}
	if strings.Join(got, ",") != strings.Join(want, ",") || len(warns) != 0 {
		t.Fatalf("got %v want %v (warnings %v)", got, want, warns)
	}
	if occ[2].Summary != "Team sync (moved)" || occ[1].Free != true {
		t.Fatalf("occurrences = %+v", occ)
	}
}

// The same rules in two zones (spec "each run in two zones").
func TestExpandRulesInTwoZones(t *testing.T) {
	type tc struct {
		name, rule, start string
		window            Window
		want              []string // local wall times
	}
	cases := []tc{
		{"last Friday", "FREQ=MONTHLY;BYDAY=-1FR;UNTIL=20270301T000000Z", "20261030T100000", win("2026-10-01", "2027-04-01"),
			[]string{"2026-10-30 10:00", "2026-11-27 10:00", "2026-12-25 10:00", "2027-01-29 10:00", "2027-02-26 10:00"}},
		{"last workday", "FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1", "20261030T183000", win("2026-10-01", "2027-01-02"),
			[]string{"2026-10-30 18:30", "2026-11-30 18:30", "2026-12-31 18:30"}},
		{"WKST=MO", "FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=MO", "19970805T090000", win("1997-08-01", "1997-10-01"),
			[]string{"1997-08-05 09:00", "1997-08-10 09:00", "1997-08-19 09:00", "1997-08-24 09:00"}},
		{"WKST=SU", "FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=SU", "19970805T090000", win("1997-08-01", "1997-10-01"),
			[]string{"1997-08-05 09:00", "1997-08-17 09:00", "1997-08-19 09:00", "1997-08-31 09:00"}},
		{"UNTIL across DST", "FREQ=WEEKLY;UNTIL=20261102T235959Z", "20261019T090000", win("2026-10-01", "2026-12-01"),
			[]string{"2026-10-19 09:00", "2026-10-26 09:00", "2026-11-02 09:00"}},
		{"COUNT", "FREQ=DAILY;COUNT=3;INTERVAL=2", "20261001T070000", win("2026-10-01", "2026-11-01"),
			[]string{"2026-10-01 07:00", "2026-10-03 07:00", "2026-10-05 07:00"}},
		{"BYMONTHDAY yearly", "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1", "20260228T080000", win("2026-01-01", "2029-01-01"),
			[]string{"2026-02-28 08:00", "2027-02-28 08:00", "2028-02-29 08:00"}},
	}
	for _, zone := range []string{"Europe/Berlin", "America/Los_Angeles"} {
		for _, c := range cases {
			ics := fmt.Sprintf("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:x\r\nDTSTART;TZID=%s:%s\r\nDURATION:PT30M\r\nRRULE:%s\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n", zone, c.start, c.rule)
			cal, err := ParseCalendar([]byte(ics))
			if err != nil {
				t.Fatal(err)
			}
			occ, warns := Expand(cal.Events, c.window, MaxOccurrences)
			var got []string
			for _, o := range occ {
				got = append(got, o.Start.T.Format("2006-01-02 15:04"))
				if o.Start.T.Location().String() != zone {
					t.Fatalf("%s/%s: location %s", zone, c.name, o.Start.T.Location())
				}
			}
			if strings.Join(got, ",") != strings.Join(c.want, ",") || len(warns) != 0 {
				t.Errorf("%s/%s: got %v want %v (%v)", zone, c.name, got, c.want, warns)
			}
		}
	}
}

func TestExpandDSTKeepsWallClock(t *testing.T) {
	i := load(t, "icloud.ics")
	occ, _ := Expand(i.Events, win("2026-10-01", "2026-12-01"), MaxOccurrences)
	// 09:00 in New York before and after the clocks go back on 1 November.
	if got := strings.Join(starts_(occ), ","); got != "2026-10-30 13:00Z,2026-10-31 13:00Z,2026-11-01 14:00Z" {
		t.Fatalf("got %s", got)
	}
}

func TestExpandUnsupportedAndCancelledAndTruncated(t *testing.T) {
	ics := "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:h\r\nSUMMARY:Hourly\r\nDTSTART:20261001T080000Z\r\nRRULE:FREQ=DAILY;BYHOUR=8,12\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"
	cal, _ := ParseCalendar([]byte(ics))
	occ, warns := Expand(cal.Events, win("2026-10-01", "2026-11-01"), MaxOccurrences)
	if len(occ) != 1 || len(warns) != 1 || !strings.Contains(warns[0], "BYHOUR") {
		t.Fatalf("byhour: %v %v", starts_(occ), warns)
	}
	n := load(t, "nextcloud.ics")
	occ, _ = Expand(n.Events, win("2026-10-01", "2026-11-01"), MaxOccurrences)
	for _, o := range occ {
		if o.UID == "nc-2" {
			t.Fatal("cancelled event kept")
		}
	}
	daily := "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:d\r\nDTSTART;VALUE=DATE:20260101\r\nRRULE:FREQ=DAILY\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"
	cal, _ = ParseCalendar([]byte(daily))
	occ, warns = Expand(cal.Events, win("2026-01-01", "2050-01-01"), MaxOccurrences)
	if len(occ) != MaxOccurrences || len(warns) != 1 || !strings.Contains(warns[0], "5000") {
		t.Fatalf("truncation: %d %v", len(occ), warns)
	}
}
