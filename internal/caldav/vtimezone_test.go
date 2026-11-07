package caldav

import (
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/zoned"
)

func crlf(lines ...string) string { return strings.Join(lines, "\r\n") + "\r\n" }

// Golden objects for zoned tasks (issue #1028).
func TestZonedVTODOGolden(t *testing.T) {
	enc := func(tk Task) string {
		tk.UID, tk.Title, tk.Priority = "u", "Call", 4
		tk.Reminders = []Reminder{{ID: "r1", Kind: "relative", Offset: -15}}
		return string(Encode(tk))
	}
	alarm := []string{"X-OPENTODO-ALARMS:1", "STATUS:NEEDS-ACTION", "BEGIN:VALARM", "UID:r1", "X-WR-ALARMUID:r1", "ACTION:DISPLAY",
		"DESCRIPTION:Call", "TRIGGER;RELATED=END:-PT15M", "END:VALARM", "END:VTODO", "END:VCALENDAR"}
	head := []string{"BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//OpenTodo//CalDAV//EN", "CALSCALE:GREGORIAN"}
	todo := []string{"BEGIN:VTODO", "UID:u", "DTSTAMP:19700101T000000Z", "LAST-MODIFIED:19700101T000000Z", "SUMMARY:Call"}
	oneOff := func(utc string) string {
		lines := append(append(append([]string{}, head...), todo...), "DUE:"+utc, "DTSTART:"+utc)
		return crlf(append(lines, alarm...)...)
	}
	for _, c := range []struct{ tz, date, clock, utc string }{
		{"Europe/Berlin", "2026-07-10", "09:00", "20260710T070000Z"},
		{"Europe/Berlin", "2026-01-15", "09:00", "20260115T080000Z"},
		{"America/New_York", "2026-07-10", "09:00", "20260710T130000Z"},
		{"Asia/Kolkata", "2026-07-10", "09:00", "20260710T033000Z"},
		{"Asia/Kolkata", "2026-07-10", "03:00", "20260709T213000Z"},
	} {
		got := enc(Task{Due: &Due{Date: c.date, Time: strp(c.clock), TZ: strp(c.tz)}})
		if want := oneOff(c.utc); got != want {
			t.Errorf("%s %s %s:\n%s\nwant:\n%s", c.tz, c.date, c.clock, got, want)
		}
	}
	// A repeating task keeps its zone, defined by its yearly rules before the VTODO.
	got := enc(Task{Due: &Due{Date: "2026-07-10", Time: strp("09:00"), TZ: strp("Europe/Berlin")}, Recurrence: "every week"})
	lines := append(append([]string{}, head...),
		"BEGIN:VTIMEZONE", "TZID:Europe/Berlin",
		"BEGIN:DAYLIGHT", "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "END:DAYLIGHT",
		"BEGIN:STANDARD", "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "END:STANDARD",
		"END:VTIMEZONE")
	lines = append(append(lines, todo...), "DUE;TZID=Europe/Berlin:20260710T090000", "DTSTART;TZID=Europe/Berlin:20260710T090000", "RRULE:FREQ=WEEKLY")
	if want := crlf(append(lines, alarm...)...); got != want {
		t.Errorf("series:\n%s\nwant:\n%s", got, want)
	}
}

func TestVTimezoneGolden(t *testing.T) {
	cases := map[string][]string{
		// Summer and winter dates give the same definition.
		"Europe/Berlin 2026-07-10": {"DAYLIGHT 19700329T020000 FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU +0100 +0200 CEST",
			"STANDARD 19701025T030000 FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU +0200 +0100 CET"},
		"Europe/Berlin 2026-01-15": {"DAYLIGHT 19700329T020000 FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU +0100 +0200 CEST",
			"STANDARD 19701025T030000 FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU +0200 +0100 CET"},
		"America/New_York 2026-07-10": {"DAYLIGHT 19700308T020000 FREQ=YEARLY;BYMONTH=3;BYDAY=2SU -0500 -0400 EDT",
			"STANDARD 19701101T020000 FREQ=YEARLY;BYMONTH=11;BYDAY=1SU -0400 -0500 EST"},
		"Australia/Sydney 2026-07-10": {"STANDARD 19700405T030000 FREQ=YEARLY;BYMONTH=4;BYDAY=1SU +1100 +1000 AEST",
			"DAYLIGHT 19701004T020000 FREQ=YEARLY;BYMONTH=10;BYDAY=1SU +1000 +1100 AEDT"},
		"Asia/Kolkata 2026-07-10": {"STANDARD 19700101T000000  +0530 +0530 IST"},
		"UTC 2026-07-10":          {"STANDARD 19700101T000000  +0000 +0000 UTC"},
	}
	for key, want := range cases {
		tz, date, _ := strings.Cut(key, " ")
		vt := VTimezone(tz, date, "09:00")
		if vt == nil || vt.Prop("TZID").Value != tz {
			t.Fatalf("%s: %+v", key, vt)
		}
		var got []string
		for _, o := range vt.Children {
			rule := ""
			if p := o.Prop("RRULE"); p != nil {
				rule = p.Value
			}
			got = append(got, strings.Join([]string{o.Name, o.Prop("DTSTART").Value, rule, o.Prop("TZOFFSETFROM").Value,
				o.Prop("TZOFFSETTO").Value, o.Prop("TZNAME").Value}, " "))
		}
		if strings.Join(got, "\n") != strings.Join(want, "\n") {
			t.Errorf("%s:\n%s\nwant:\n%s", key, strings.Join(got, "\n"), strings.Join(want, "\n"))
		}
	}
	if VTimezone("Not/AZone", "2026-07-10", "09:00") != nil {
		t.Fatal("unknown zone")
	}
}

// onset is the instant an observance starts and the offset it sets.
type onset struct {
	at  time.Time
	off int
}

// onsetsOf expands a VTIMEZONE's observances up to the given year, sorted.
func onsetsOf(t *testing.T, vt *Component, until int) []onset {
	t.Helper()
	parseOff := func(s string) int {
		h, _ := strconv.Atoi(s[1:3])
		m, _ := strconv.Atoi(s[3:5])
		o := h*3600 + m*60
		if s[0] == '-' {
			o = -o
		}
		return o
	}
	var out []onset
	for _, o := range vt.Children {
		from, to := parseOff(o.Prop("TZOFFSETFROM").Value), parseOff(o.Prop("TZOFFSETTO").Value)
		start, err := time.Parse("20060102T150405", o.Prop("DTSTART").Value)
		if err != nil {
			t.Fatal(err)
		}
		onsets := []time.Time{start}
		if p := o.Prop("RRULE"); p != nil {
			var month, n int
			var wd string
			for _, part := range strings.Split(p.Value, ";") {
				k, v, _ := strings.Cut(part, "=")
				switch k {
				case "BYMONTH":
					month, _ = strconv.Atoi(v)
				case "BYDAY":
					n, _ = strconv.Atoi(v[:len(v)-2])
					wd = v[len(v)-2:]
				}
			}
			day := time.Weekday(strings.Index("SUMOTUWETHFRSA", wd) / 2)
			clock := time.Duration(start.Hour())*time.Hour + time.Duration(start.Minute())*time.Minute
			for y := 1971; y <= until; y++ {
				if d, ok := nthWeekday(y, time.Month(month), day, n, clock); ok {
					onsets = append(onsets, d)
				}
			}
		}
		for _, wall := range onsets {
			out = append(out, onset{wall.Add(-time.Duration(from) * time.Second), to})
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].at.Before(out[j].at) })
	return out
}

// offsetAt is the offset a client that reads the definition uses: the one of
// the latest onset at or before the instant.
func offsetAt(onsets []onset, at time.Time) int {
	i := sort.Search(len(onsets), func(i int) bool { return onsets[i].at.After(at) })
	if i == 0 {
		return 0
	}
	return onsets[i-1].off
}

// The definition gives the zone database's offset at every hour of the year
// around the time and the following ones, whether written as yearly rules
// (most zones) or as one-off observances (Jerusalem, Cairo, Casablanca, …).
func TestVTimezoneMatchesZoneDatabase(t *testing.T) {
	zones := []string{"Europe/Berlin", "Europe/London", "Europe/Dublin", "America/New_York", "America/Los_Angeles",
		"America/St_Johns", "America/Santiago", "America/Sao_Paulo", "America/Havana", "Australia/Sydney", "Australia/Lord_Howe",
		"Pacific/Auckland", "Pacific/Chatham", "Asia/Kolkata", "Asia/Tokyo", "Asia/Tehran", "Asia/Jerusalem", "Africa/Cairo",
		"Africa/Casablanca", "Asia/Gaza", "UTC"}
	for _, tz := range zones {
		loc, err := zoned.Load(tz)
		if err != nil {
			t.Fatal(err)
		}
		for _, year := range []int{2026, 2027, 2031} {
			vt := VTimezone(tz, strconv.Itoa(year)+"-07-10", "09:00")
			years := ruleYears
			start := time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC)
			onsets := onsetsOf(t, vt, year+years)
			for at := start; at.Before(start.AddDate(years+1, 0, 0)); at = at.Add(time.Hour) {
				_, want := at.In(loc).Zone()
				if got := offsetAt(onsets, at); got != want {
					t.Fatalf("%s %d at %s: offset %d, want %d", tz, year, at, got, want)
				}
			}
		}
	}
}

// Reading back (issue #1028): the UTC time this server served for a zoned due
// is the due itself; another UTC time is read in the task's zone.
func TestKeepZone(t *testing.T) {
	berlin := func(date, clock string) *Due { return &Due{Date: date, Time: strp(clock), TZ: strp("Europe/Berlin")} }
	utc := func(date, clock string) *Due { return &Due{Date: date, Time: strp(clock), TZ: strp("UTC")} }
	cases := []struct {
		name          string
		sent, current *Due
		want          *Due
	}{
		{"echo summer", utc("2026-07-10", "07:00"), berlin("2026-07-10", "09:00"), berlin("2026-07-10", "09:00")},
		{"echo winter", utc("2026-01-15", "08:00"), berlin("2026-01-15", "09:00"), berlin("2026-01-15", "09:00")},
		{"moved", utc("2026-07-10", "08:30"), berlin("2026-07-10", "09:00"), berlin("2026-07-10", "10:30")},
		{"moved across midnight", utc("2026-07-10", "22:30"), berlin("2026-07-10", "09:00"), berlin("2026-07-11", "00:30")},
		{"moved into winter", utc("2026-11-02", "08:00"), berlin("2026-07-10", "09:00"), berlin("2026-11-02", "09:00")},
		{"kolkata, day before in UTC", utc("2026-07-09", "21:30"), &Due{Date: "2026-07-10", Time: strp("03:00"), TZ: strp("Asia/Kolkata")},
			&Due{Date: "2026-07-10", Time: strp("03:00"), TZ: strp("Asia/Kolkata")}},
		// 02:30 does not exist on that day; it was served as 03:00 CEST.
		{"echo of a time in the gap", utc("2026-03-29", "01:00"), berlin("2026-03-29", "02:30"), berlin("2026-03-29", "02:30")},
		{"floating task", utc("2026-07-10", "07:00"), &Due{Date: "2026-07-10", Time: strp("09:00")}, utc("2026-07-10", "07:00")},
		{"date-only task", utc("2026-07-10", "07:00"), &Due{Date: "2026-07-10"}, utc("2026-07-10", "07:00")},
		{"no current due", utc("2026-07-10", "07:00"), nil, utc("2026-07-10", "07:00")},
		{"client zone", &Due{Date: "2026-07-10", Time: strp("09:00"), TZ: strp("America/New_York")}, berlin("2026-07-10", "09:00"),
			&Due{Date: "2026-07-10", Time: strp("09:00"), TZ: strp("America/New_York")}},
		{"floating time sent", &Due{Date: "2026-07-10", Time: strp("09:00")}, berlin("2026-07-10", "09:00"), &Due{Date: "2026-07-10", Time: strp("09:00")}},
	}
	for _, c := range cases {
		in := &Inbound{Due: c.sent, SentDue: c.sent, Overrides: []Override{{Due: c.sent}}}
		in.KeepZone(c.current)
		for _, got := range []*Due{in.Due, in.SentDue, in.Overrides[0].Due} {
			if !sameDue(got, c.want) {
				t.Errorf("%s: %+v, want %+v", c.name, *got, *c.want)
			}
		}
	}
	// A decoded echo of a served object comes back as the task's due.
	due := berlin("2026-07-10", "09:00")
	in, err := Decode(Encode(Task{UID: "u", Priority: 4, Due: due, Deadline: "2026-07-17"}))
	if err != nil {
		t.Fatal(err)
	}
	in.KeepZone(due)
	if !sameDue(in.Due, due) || in.Deadline != "2026-07-17" || in.Shape != ShapeStartDue {
		t.Fatalf("deadline task echo: %+v %+v", in, in.Due)
	}
}
