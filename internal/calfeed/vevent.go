package calfeed

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/caldav"
)

// Limits of one subscription (design D3, D4; OpenSpec change
// calendar-feed-large-calendars). A calendar is read as it arrives and only
// the events that can reach the stored window are kept, so the download limit
// bounds time, not memory: memory holds the event being read and the kept ones.
const (
	MaxFeedBytes    = 32 << 20 // a fetched calendar, as downloaded
	MaxKeptBytes    = 4 << 20  // the events kept from it (eventBytes)
	MaxPartBytes    = 1 << 20  // one event (or other component) of it
	MaxPartLines    = 5000     // content lines in one event
	MaxOccurrences  = 5000     // stored occurrences per subscription
	DefaultDuration = 0        // a timed event without DTEND or DURATION is a point in time
)

// ErrInvalid is a body that is not an iCalendar object (an HTML login page, a 404 page).
var ErrInvalid = caldav.ErrInvalid

// ErrTooLarge is a calendar over MaxFeedBytes.
var ErrTooLarge = caldav.ErrTooLarge

// Point is one end of an event: a time in a zone, a floating wall time, or a date.
type Point struct {
	T time.Time // in Loc; floating times are wall times in UTC
	// Zone is the IANA name ("UTC" for Z times), "" for floating or all-day.
	Zone   string
	AllDay bool
	// Wall is the wall clock as written (in UTC) of every time read in a
	// zone, a TZID or the calendar's default; zero for Z, floating and
	// all-day times. Its clock differs from T's only in a daylight saving gap.
	Wall time.Time `json:"-"`
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
	// LastModified is LAST-MODIFIED in Unix ms, 0 when absent (calendar sync
	// compares it with the task's last change, calendar-two-way D8).
	LastModified int64
	// Guests: the event has an ATTENDEE (calendar-event-edits D2).
	Guests bool
	// Organizer is the ORGANIZER's address, lower case without "mailto:", ""
	// when the event names none.
	Organizer string
}

// Address normalises a calendar user address: lower case, without "mailto:".
func Address(v string) string {
	v = strings.ToLower(strings.TrimSpace(v))
	return strings.TrimPrefix(v, "mailto:")
}

// Calendar is a parsed calendar: its events and the hints it carries.
type Calendar struct {
	Name     string        // X-WR-CALNAME
	Zone     string        // X-WR-TIMEZONE, resolved
	Refresh  time.Duration // REFRESH-INTERVAL or X-PUBLISHED-TTL, 0 when absent
	Events   []Event
	Warnings []string
	loc      *time.Location // the default zone of floating times, from Zone
}

// ParseCalendar reads a published calendar held in memory, keeping every
// event. Events with a start that does not parse are left out with a warning;
// a body that is not iCalendar is ErrInvalid.
func ParseCalendar(data []byte) (*Calendar, error) {
	return ReadCalendar(bytes.NewReader(data), nil)
}

// ReadCalendar reads a published calendar from r as it arrives and keeps the
// events keep accepts (every one when keep is nil); kept events past
// MaxKeptBytes are left out with a warning. Calendar properties apply to the
// events after them (RFC 5545 puts them first). More than MaxFeedBytes is
// ErrTooLarge, a body that is not iCalendar ErrInvalid, and a read error is
// returned as it is.
func ReadCalendar(r io.Reader, keep func(Event) bool) (*Calendar, error) {
	cal := &Calendar{}
	w := warnings{}
	read, kept, full := 0, 0, false
	lim := caldav.StreamLimits{Bytes: MaxFeedBytes, PartLines: MaxPartLines, PartBytes: MaxPartBytes}
	root, err := caldav.Stream(r, lim, func(root, c *caldav.Component) error {
		if c.Name != "VEVENT" {
			return nil
		}
		if read < len(root.Props) {
			readHeader(cal, root.Props[read:])
			read = len(root.Props)
		}
		ev, err := parseEvent(c, cal.loc, w)
		switch {
		case err != nil:
			w.add("an event without a readable start was left out")
		case keep != nil && !keep(ev):
		case kept+eventBytes(ev) > MaxKeptBytes:
			full = true
		default:
			kept += eventBytes(ev)
			cal.Events = append(cal.Events, ev)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	readHeader(cal, root.Props[read:])
	if full {
		w.add(fmt.Sprintf("this calendar has more than %d MB of events near the shown period; some are left out", MaxKeptBytes>>20))
	}
	cal.Warnings = w.list()
	return cal, nil
}

// readHeader applies calendar properties: name, default zone, refresh hint.
func readHeader(cal *Calendar, props []caldav.Prop) {
	for _, p := range props {
		switch p.Name {
		case "X-WR-CALNAME":
			cal.Name = strings.TrimSpace(caldav.UnescapeText(p.Value))
		case "X-WR-TIMEZONE":
			if loc, ok := Resolve(p.Value); ok {
				cal.Zone, cal.loc = loc.String(), loc
			}
		case "REFRESH-INTERVAL", "X-PUBLISHED-TTL":
			if d, _, err := parseDuration(p.Value); err == nil && d > 0 && (cal.Refresh == 0 || p.Name == "REFRESH-INTERVAL") {
				cal.Refresh = d
			}
		}
	}
}

// eventBytes estimates the memory an event holds: its text and its dates.
func eventBytes(ev Event) int {
	return 256 + len(ev.UID) + len(ev.RecurrenceID) + len(ev.Summary) + len(ev.Location) + len(ev.RRule) + 48*(len(ev.RDates)+len(ev.ExDates))
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
		case "ATTENDEE":
			ev.Guests = true
		case "ORGANIZER":
			ev.Organizer = Address(p.Value)
		case "LAST-MODIFIED":
			if t, err := time.Parse("20060102T150405Z", strings.TrimSpace(p.Value)); err == nil {
				ev.LastModified = t.UnixMilli()
			}
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
	return Point{T: WallIn(wall, loc), Zone: zoneName(loc), Wall: wall}, nil
}

// WallIn is the instant of a wall time (given in UTC) in loc as RFC 5545
// §3.3.5 reads it: the first of two that repeat, and one in a gap with the
// offset before the gap (02:30 on the day clocks go from 02:00 to 03:00 is
// 03:30), whatever time.Date would choose.
func WallIn(wall time.Time, loc *time.Location) time.Time {
	w := wall.Unix()
	offAt := func(u int64) int64 {
		_, o := time.Unix(u, 0).In(loc).Zone()
		return int64(o)
	}
	before, after := offAt(w-86400), offAt(w+86400)
	best, found := w-before, false
	for _, o := range []int64{before, after} {
		if c := w - o; offAt(c) == o && (!found || c < best) {
			best, found = c, true
		}
	}
	return time.Unix(best, 0).In(loc)
}

func zoneName(loc *time.Location) string {
	if loc == time.UTC {
		return "UTC"
	}
	return loc.String()
}

// parseDuration reads an RFC 5545 duration (P1D, PT1H30M, -PT15M, P1W). days is
// set for a whole-day duration, which all-day events add as calendar days.
// maxDurationSecs is the longest DURATION or refresh interval read: a century.
const maxDurationSecs = 100 * 366 * 86400

func parseDuration(v string) (time.Duration, int, error) {
	v = strings.ToUpper(strings.TrimSpace(v))
	neg := strings.HasPrefix(v, "-")
	v = strings.TrimLeft(v, "+-")
	if !strings.HasPrefix(v, "P") {
		return 0, 0, errors.New("bad duration")
	}
	v = v[1:]
	var secs int64
	days := 0
	inTime := false
	num := ""
	timeOnly := true
	for _, r := range v {
		switch {
		case r >= '0' && r <= '9':
			if num += string(r); len(num) > 9 {
				// No duration needs more digits; refusing early keeps a long
				// digit run from growing num quadratically.
				return 0, 0, errors.New("bad duration")
			}
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
				secs += int64(n) * 3600
			case r == 'M' && inTime:
				secs += int64(n) * 60
			case r == 'S' && inTime:
				secs += int64(n)
			default:
				return 0, 0, errors.New("bad duration")
			}
		}
	}
	if num != "" {
		return 0, 0, errors.New("bad duration")
	}
	// At most nine digits per unit keeps these sums in range; a duration
	// beyond a century is refused rather than overflowing time.Duration.
	if secs+int64(days)*86400 > maxDurationSecs {
		return 0, 0, errors.New("bad duration")
	}
	d := time.Duration(secs) * time.Second
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
