package caldav

import (
	"fmt"
	"strconv"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/zoned"
)

// VTIMEZONE (RFC 5545 §3.6.5). A zone's definition is written the way Apple,
// Mozilla and Google write it: one STANDARD and one DAYLIGHT observance, each
// with a yearly RRULE for the zone's current rules and a DTSTART in 1970, or a
// single STANDARD observance for a zone without daylight saving time. A client
// that reads the definition instead of looking up the TZID in its own database
// then gets the right offset for every year, and the definition matches its
// own copy of the zone. Only a zone whose transitions follow no yearly
// weekday rule (they move with a lunar calendar, fall on "the Friday before
// the last Sunday", or the zone is changing its rules) is described by one-off
// observances of the year around the time and the following ones.

// ruleYears is how many years after the given one a yearly rule must predict
// the zone's transitions to be written as a rule, and how many years of
// one-off observances describe a zone without one.
const ruleYears = 4

// transition is one change of offset in a zone.
type transition struct {
	at          time.Time // the instant
	from, to    int       // offsets in seconds east of UTC
	name        string    // the abbreviation in force after it
	dst         bool      // daylight saving time after it
	wall        time.Time // the onset as a wall time in the offset before it (UTC location)
	weekdayRule int       // the BYDAY ordinal: 1..4, or -1 for the last
}

// transitions are the zone's changes of offset within year.
func transitions(loc *time.Location, year int) []transition {
	start := time.Date(year, 1, 1, 0, 0, 0, 0, loc)
	end := time.Date(year+1, 1, 1, 0, 0, 0, 0, loc)
	var out []transition
	for t := start; len(out) < 8; {
		_, next := t.ZoneBounds()
		if next.IsZero() || !next.Before(end) {
			break
		}
		_, from := next.Add(-time.Second).Zone()
		name, to := next.Zone()
		wall := next.In(time.FixedZone("", from))
		out = append(out, transition{at: next, from: from, to: to, name: name, dst: next.IsDST(),
			wall: time.Date(wall.Year(), wall.Month(), wall.Day(), wall.Hour(), wall.Minute(), wall.Second(), 0, time.UTC)})
		t = next
	}
	return out
}

// nthWeekday is the date of the n-th (1..5) or last (-1) weekday wd of a month,
// at the given clock; ok is false when the month has no such day.
func nthWeekday(year int, month time.Month, wd time.Weekday, n int, clock time.Duration) (time.Time, bool) {
	if n < 0 {
		last := time.Date(year, month+1, 0, 0, 0, 0, 0, time.UTC)
		day := last.AddDate(0, 0, -((int(last.Weekday()) - int(wd) + 7) % 7))
		return day.Add(clock), true
	}
	first := time.Date(year, month, 1, 0, 0, 0, 0, time.UTC)
	day := first.AddDate(0, 0, (int(wd)-int(first.Weekday())+7)%7+7*(n-1))
	return day.Add(clock), day.Month() == month
}

// predicts reports whether the rule (the onset's month, weekday and clock, on
// the n-th or last such weekday) gives the zone's transition in year.
func (tr transition) predicts(loc *time.Location, year, n int) bool {
	clock := time.Duration(tr.wall.Hour())*time.Hour + time.Duration(tr.wall.Minute())*time.Minute
	wall, ok := nthWeekday(year, tr.wall.Month(), tr.wall.Weekday(), n, clock)
	if !ok {
		return false
	}
	at := wall.Add(-time.Duration(tr.from) * time.Second)
	_, before := at.Add(-time.Second).In(loc).Zone()
	_, after := at.In(loc).Zone()
	return before == tr.from && after == tr.to
}

// yearlyRule finds the BYDAY ordinal that predicts the transition for the
// following years: the last weekday of the month or its n-th one.
func (tr *transition) yearlyRule(loc *time.Location) bool {
	n := (tr.wall.Day()-1)/7 + 1
	candidates := []int{n}
	if tr.wall.Day()+7 > time.Date(tr.wall.Year(), tr.wall.Month()+1, 0, 0, 0, 0, 0, time.UTC).Day() {
		candidates = []int{-1, n}
	}
	for _, c := range candidates {
		if c > 4 {
			continue
		}
		ok := true
		for y := tr.wall.Year(); y <= tr.wall.Year()+ruleYears && ok; y++ {
			ok = tr.predicts(loc, y, c)
		}
		if ok {
			tr.weekdayRule = c
			return true
		}
	}
	return false
}

var bydayNames = [...]string{"SU", "MO", "TU", "WE", "TH", "FR", "SA"}

// observance renders one STANDARD or DAYLIGHT component.
func observance(dst bool, dtstart string, from, to int, name, rrule string) *Component {
	kind := "STANDARD"
	if dst {
		kind = "DAYLIGHT"
	}
	c := &Component{Name: kind, Props: []Prop{{Name: "DTSTART", Value: dtstart}}}
	if rrule != "" {
		c.Props = append(c.Props, Prop{Name: "RRULE", Value: rrule})
	}
	c.Props = append(c.Props,
		Prop{Name: "TZOFFSETFROM", Value: offsetText(from)},
		Prop{Name: "TZOFFSETTO", Value: offsetText(to)},
		Prop{Name: "TZNAME", Value: EscapeText(name)})
	return c
}

// vtimezone is the VTIMEZONE of an IANA zone, with the rules in force around
// the given wall time; nil for an unknown zone or time.
func vtimezone(tz, date, clock string) *Component {
	loc, err := zoned.Load(tz)
	if err != nil {
		return nil
	}
	at, err := zoned.Instant(date, clock, loc)
	if err != nil {
		return nil
	}
	c := &Component{Name: "VTIMEZONE", Props: []Prop{{Name: "TZID", Value: tz}}}
	trs := transitions(loc, at.Year())
	if len(trs) == 0 {
		// No daylight saving time: one offset since 1970.
		name, off := at.Zone()
		c.Children = append(c.Children, observance(false, "19700101T000000", off, off, name, ""))
		return c
	}
	if len(trs) == 2 && trs[0].dst != trs[1].dst && trs[0].yearlyRule(loc) && trs[1].yearlyRule(loc) {
		for _, tr := range trs {
			clock := time.Duration(tr.wall.Hour())*time.Hour + time.Duration(tr.wall.Minute())*time.Minute
			first, _ := nthWeekday(1970, tr.wall.Month(), tr.wall.Weekday(), tr.weekdayRule, clock)
			rule := "FREQ=YEARLY;BYMONTH=" + strconv.Itoa(int(tr.wall.Month())) + ";BYDAY=" +
				strconv.Itoa(tr.weekdayRule) + bydayNames[tr.wall.Weekday()]
			c.Children = append(c.Children, observance(tr.dst, first.Format("20060102T150405"), tr.from, tr.to, tr.name, rule))
		}
		return c
	}
	// No yearly rule: the offset in force when the year starts, then each
	// transition of that year and the following ones once.
	start := time.Date(at.Year(), 1, 1, 0, 0, 0, 0, loc)
	name, off := start.Zone()
	c.Children = append(c.Children, observance(start.IsDST(), "19700101T000000", off, off, name, ""))
	for y := at.Year(); y <= at.Year()+ruleYears; y++ {
		for _, tr := range transitions(loc, y) {
			c.Children = append(c.Children, observance(tr.dst, tr.wall.Format("20060102T150405"), tr.from, tr.to, tr.name, ""))
		}
	}
	return c
}

func offsetText(sec int) string {
	sign := '+'
	if sec < 0 {
		sign, sec = '-', -sec
	}
	return fmt.Sprintf("%c%02d%02d", sign, sec/3600, (sec%3600)/60)
}

// VTimezone is the VTIMEZONE for an IANA zone around a date and time (shared
// with the task feed, OpenSpec change calendar-feeds); nil for an unknown zone.
func VTimezone(tz, date, clock string) *Component { return vtimezone(tz, date, clock) }
