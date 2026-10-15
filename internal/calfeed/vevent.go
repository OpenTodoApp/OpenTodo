package calfeed

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/caldav"
)

// Limits of one subscription (design D3, D4).
const (
	MaxFeedBytes    = 2 << 20 // a fetched calendar
	MaxFeedProps    = 200_000 // content lines in it
	MaxOccurrences  = 5000    // stored occurrences per subscription
	DefaultDuration = 0       // a timed event without DTEND or DURATION is a point in time
)

// ErrInvalid is a body that is not an iCalendar object (an HTML login page, a 404 page).
var ErrInvalid = caldav.ErrInvalid

// Point is one end of an event: a time in a zone, a floating wall time, or a date.
type Point struct {
	T time.Time // in Loc; floating times are wall times in UTC
	// Zone is the IANA name ("UTC" for Z times), "" for floating or all-day.
	Zone   string
	AllDay bool
}

// Event is one VEVENT as published.
type Event struct {
	UID          string
	RecurrenceID string // the instance key it overrides, "" for a master
	Range        string // RANGE of the RECURRENCE-ID (THISANDFUTURE is approximated)
	Summary      string
	Location     string
	Start        Point
	End          *Point         // nil: Duration from Start
	Duration     *time.Duration // nil: End, or the default
	DurationDays int            // a DURATION in whole days for all-day events
	RRule        string
	RDates       []Point
	ExDates      []Point
	Cancelled    bool
	Free         bool // TRANSP:TRANSPARENT
	Sequence     int
}

// Calendar is a parsed calendar: its events and the hints it carries.
type Calendar struct {
	Name     string        // X-WR-CALNAME
	Zone     string        // X-WR-TIMEZONE, resolved
	Refresh  time.Duration // REFRESH-INTERVAL or X-PUBLISHED-TTL, 0 when absent
	Events   []Event
	Warnings []string
}

// ParseCalendar reads a published calendar. Events with a start that does not
// parse are left out with a warning; a body that is not iCalendar is ErrInvalid.
func ParseCalendar(data []byte) (*Calendar, error) {
	root, err := caldav.ParseWithLimits(data, caldav.Limits{Bytes: MaxFeedBytes, Props: MaxFeedProps})
	if err != nil {
		return nil, err
	}
	if root.Name != "VCALENDAR" {
		return nil, fmt.Errorf("%w: not a VCALENDAR", ErrInvalid)
	}
	cal := &Calendar{}
	w := warnings{}
	var defaultLoc *time.Location
	for _, p := range root.Props {
		switch p.Name {
		case "X-WR-CALNAME":
			cal.Name = strings.TrimSpace(caldav.UnescapeText(p.Value))
		case "X-WR-TIMEZONE":
			if loc, ok := Resolve(p.Value); ok {
				cal.Zone, defaultLoc = loc.String(), loc
			}
		case "REFRESH-INTERVAL", "X-PUBLISHED-TTL":
			if d, _, err := parseDuration(p.Value); err == nil && d > 0 && (cal.Refresh == 0 || p.Name == "REFRESH-INTERVAL") {
				cal.Refresh = d
			}
		}
	}
	for _, c := range root.Children {
		if c.Name != "VEVENT" {
			continue
		}
		ev, err := parseEvent(c, defaultLoc, w)
		if err != nil {
			w.add("an event without a readable start was left out")
			continue
		}
		cal.Events = append(cal.Events, ev)
	}
	cal.Warnings = w.list()
	return cal, nil
}

func parseEvent(c *caldav.Component, defaultLoc *time.Location, w warnings) (Event, error) {
	ev := Event{}
	var start *Point
	for _, p := range c.Props {
		switch p.Name {
		case "UID":
			ev.UID = strings.TrimSpace(p.Value)
		case "SUMMARY":
			ev.Summary = caldav.UnescapeText(p.Value)
		case "LOCATION":
			ev.Location = caldav.UnescapeText(p.Value)
		case "DTSTART":
			pt, err := parsePoint(p, defaultLoc, w)
			if err != nil {
				return ev, err
			}
			start = &pt
		case "DTEND":
			if pt, err := parsePoint(p, defaultLoc, w); err == nil {
				ev.End = &pt
			}
		case "DURATION":
			if d, days, err := parseDuration(p.Value); err == nil {
				ev.Duration, ev.DurationDays = &d, days
			}
		case "RRULE":
			ev.RRule = strings.TrimSpace(p.Value)
		case "RDATE":
			ev.RDates = append(ev.RDates, parseList(p, defaultLoc, w)...)
		case "EXDATE":
			ev.ExDates = append(ev.ExDates, parseList(p, defaultLoc, w)...)
		case "RECURRENCE-ID":
			pt, err := parsePoint(p, defaultLoc, w)
			if err == nil {
				ev.RecurrenceID = instanceKey(pt)
				ev.Range = strings.ToUpper(p.Param("RANGE"))
			}
		case "STATUS":
			ev.Cancelled = strings.EqualFold(strings.TrimSpace(p.Value), "CANCELLED")
		case "TRANSP":
			ev.Free = strings.EqualFold(strings.TrimSpace(p.Value), "TRANSPARENT")
		case "SEQUENCE":
			ev.Sequence, _ = strconv.Atoi(strings.TrimSpace(p.Value))
		}
	}
	if start == nil {
		return ev, errors.New("no DTSTART")
	}
	ev.Start = *start
	return ev, nil
}

// parsePoint reads a DATE or DATE-TIME property value.
func parsePoint(p caldav.Prop, defaultLoc *time.Location, w warnings) (Point, error) {
	return parseValue(strings.TrimSpace(p.Value), strings.ToUpper(p.Param("VALUE")), p.Param("TZID"), defaultLoc, w)
}

func parseList(p caldav.Prop, defaultLoc *time.Location, w warnings) []Point {
	var out []Point
	kind := strings.ToUpper(p.Param("VALUE"))
	for _, v := range strings.Split(p.Value, ",") {
		v = strings.TrimSpace(v)
		if kind == "PERIOD" || strings.Contains(v, "/") {
			v, _, _ = strings.Cut(v, "/")
		}
		if pt, err := parseValue(v, kind, p.Param("TZID"), defaultLoc, w); err == nil {
			out = append(out, pt)
		}
	}
	return out
}

func parseValue(v, kind, tzid string, defaultLoc *time.Location, w warnings) (Point, error) {
	if kind == "DATE" || (len(v) == 8 && !strings.Contains(v, "T")) {
		t, err := time.Parse("20060102", v)
		if err != nil {
			return Point{}, err
		}
		return Point{T: t, AllDay: true}, nil
	}
	if strings.HasSuffix(v, "Z") {
		t, err := time.Parse("20060102T150405Z", v)
		if err != nil {
			return Point{}, err
		}
		return Point{T: t.UTC(), Zone: "UTC"}, nil
	}
	wall, err := time.Parse("20060102T150405", v)
	if err != nil {
		return Point{}, err
	}
	loc := defaultLoc
	if tzid != "" {
		if l, ok := Resolve(tzid); ok {
			loc = l
		} else {
			w.add(fmt.Sprintf("time zone %q is unknown; its times are shown as written", tzid))
			loc = nil
		}
	}
	if loc == nil {
		return Point{T: wall}, nil
	}
	t := time.Date(wall.Year(), wall.Month(), wall.Day(), wall.Hour(), wall.Minute(), wall.Second(), 0, loc)
	return Point{T: t, Zone: zoneName(loc)}, nil
}

func zoneName(loc *time.Location) string {
	if loc == time.UTC {
		return "UTC"
	}
	return loc.String()
}

// parseDuration reads an RFC 5545 duration (P1D, PT1H30M, -PT15M, P1W). days is
// set for a whole-day duration, which all-day events add as calendar days.
func parseDuration(v string) (time.Duration, int, error) {
	v = strings.ToUpper(strings.TrimSpace(v))
	neg := strings.HasPrefix(v, "-")
	v = strings.TrimLeft(v, "+-")
	if !strings.HasPrefix(v, "P") {
		return 0, 0, errors.New("bad duration")
	}
	v = v[1:]
	var d time.Duration
	days := 0
	inTime := false
	num := ""
	timeOnly := true
	for _, r := range v {
		switch {
		case r >= '0' && r <= '9':
			num += string(r)
		case r == 'T':
			inTime = true
		default:
			n, err := strconv.Atoi(num)
			if err != nil {
				return 0, 0, errors.New("bad duration")
			}
			num = ""
			switch {
			case r == 'W' && !inTime:
				days += 7 * n
				timeOnly = false
			case r == 'D' && !inTime:
				days += n
				timeOnly = false
			case r == 'H' && inTime:
				d += time.Duration(n) * time.Hour
			case r == 'M' && inTime:
				d += time.Duration(n) * time.Minute
			case r == 'S' && inTime:
				d += time.Duration(n) * time.Second
			default:
				return 0, 0, errors.New("bad duration")
			}
		}
	}
	if num != "" {
		return 0, 0, errors.New("bad duration")
	}
	total := d + time.Duration(days)*24*time.Hour
	if d != 0 || timeOnly {
		days = 0 // a mixed or time-only duration is not a calendar-day count
	}
	if neg {
		return -total, -days, nil
	}
	return total, days, nil
}

// instanceKey is the identity of one occurrence: the UTC instant for zoned
// times, the wall time for floating ones, the date for all-day events.
func instanceKey(p Point) string {
	switch {
	case p.AllDay:
		return p.T.Format("20060102")
	case p.Zone == "":
		return p.T.Format("20060102T150405")
	default:
		return p.T.UTC().Format("20060102T150405Z")
	}
}

// warnings collects distinct messages in first-seen order.
type warnings map[string]int

func (w warnings) add(msg string) {
	if _, ok := w[msg]; !ok {
		w[msg] = len(w)
	}
}

func (w warnings) list() []string {
	out := make([]string, len(w))
	for m, i := range w {
		out[i] = m
	}
	return out
}
