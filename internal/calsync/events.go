package calsync

import (
	"context"
	"errors"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/OpenTodoApp/opentodo/internal/calfeed"
	"github.com/OpenTodoApp/opentodo/internal/zoned"
)

// Event edits (OpenSpec change calendar-event-edits, design D5): changing and
// deleting single events of a connection's calendars through the cycle's
// transports, always conditional on the version the user saw.

// MaxSummary is the longest event title written, in characters.
const MaxSummary = 500

// ErrSummary is a title that is empty or longer than MaxSummary once cleaned.
var ErrSummary = errors.New("enter a title of 1 to 500 characters")

// CleanSummary removes every control character (Unicode Cc, which holds CR,
// LF, TAB and NUL, and U+2028 and U+2029), trims white space and checks the
// length, so a title can never end an iCalendar property line (D4).
func CleanSummary(s string) (string, error) {
	s = strings.Map(func(r rune) rune {
		if unicode.Is(unicode.Cc, r) || r == ' ' || r == ' ' || r == utf8.RuneError {
			return -1
		}
		return r
	}, s)
	s = strings.TrimSpace(s)
	if n := utf8.RuneCountInString(s); n == 0 || n > MaxSummary {
		return "", ErrSummary
	}
	return s, nil
}

// EventRef names one event on the remote account at the version the caller read.
type EventRef struct {
	Calendar string // the calendar's URL (DAV) or id (Graph)
	Href     string // CalDAV object address, or the Graph event id
	ETag     string // never empty: every write is conditional
}

// EventEdit is a change; a nil field stays as it is.
type EventEdit struct {
	Summary *string
	When    *EventWhen
}

// EventWhen is a start and end as the event keeps them: a zoned point keeps
// its IANA zone, a point with an empty Zone is floating, an all-day pair
// holds dates (end exclusive).
type EventWhen struct {
	Start, End calfeed.Point
	AllDay     bool
}

// WhenOf reads a start and end shaped like a task's due (D4): dates only for
// an all-day pair, else a date and a time with an optional IANA zone.
func WhenOf(start, end calfeed.When, allDay bool) (EventWhen, error) {
	a, err := pointOf(start, allDay)
	if err != nil {
		return EventWhen{}, err
	}
	b, err := pointOf(end, allDay)
	if err != nil {
		return EventWhen{}, err
	}
	if (a.Zone == "") != (b.Zone == "") && !allDay {
		return EventWhen{}, errors.New("start and end must both be floating or both have a time zone")
	}
	if !b.T.After(a.T) {
		return EventWhen{}, errors.New("the end must be after the start")
	}
	return EventWhen{Start: a, End: b, AllDay: allDay}, nil
}

func pointOf(w calfeed.When, allDay bool) (calfeed.Point, error) {
	d, err := time.Parse(time.DateOnly, w.Date)
	if err != nil {
		return calfeed.Point{}, errors.New("dates are YYYY-MM-DD")
	}
	if allDay {
		if w.Time != nil || w.TZ != nil {
			return calfeed.Point{}, errors.New("an all-day event has dates only")
		}
		return calfeed.Point{T: d, AllDay: true}, nil
	}
	if w.Time == nil {
		return calfeed.Point{}, errors.New("a timed event needs a time HH:MM")
	}
	c, err := time.Parse("15:04", *w.Time)
	if err != nil || len(*w.Time) != 5 {
		return calfeed.Point{}, errors.New("times are HH:MM, 00:00 to 23:59")
	}
	wall := time.Date(d.Year(), d.Month(), d.Day(), c.Hour(), c.Minute(), 0, 0, time.UTC)
	if w.TZ == nil {
		return calfeed.Point{T: wall}, nil
	}
	loc, err := zoned.Load(*w.TZ)
	if err != nil {
		return calfeed.Point{}, errors.New("unknown time zone")
	}
	at, err := zoned.Instant(w.Date, *w.Time, loc)
	if err != nil {
		return calfeed.Point{}, errors.New("unknown time zone")
	}
	name := loc.String()
	if loc == time.UTC {
		name = "UTC"
	}
	return calfeed.Point{T: at, Zone: name}, nil
}

// EventState is an event as the remote holds it after a write.
type EventState struct {
	Ref    EventRef
	Events []calfeed.Event
	Locked string
}

// EventWriter changes events of one connection's calendars. Every write is
// conditional on ref.ETag and sent once, without following a redirect.
type EventWriter interface {
	// Update applies edit while the event still has ref.ETag; ErrEventChanged
	// when it does not (HTTP 412, or an ETag that differs on the pre-read).
	Update(ctx context.Context, ref EventRef, edit EventEdit, now time.Time) (EventState, error)
	// Delete removes the event while it still has ref.ETag.
	Delete(ctx context.Context, ref EventRef) error
}

// Errors of an EventWriter.
var (
	ErrEventChanged = errors.New("calendar event changed")
	ErrEventGone    = errors.New("calendar event gone")
	ErrEventLocked  = errors.New("calendar event locked")
	ErrCalendarRO   = errors.New("calendar is read only")
)

// lockedError carries the lock a writer found on its read.
type lockedError struct{ reason string }

func (e *lockedError) Error() string { return "calendar event locked: " + e.reason }
func (e *lockedError) Unwrap() error { return ErrEventLocked }

// eventWriter builds the writer of a connection with its credentials.
func (w *Worker) eventWriter(ctx context.Context, c *Connection) (EventWriter, error) {
	if c.Provider == ProviderMicrosoft {
		g, err := w.graphFor(ctx, c)
		if err != nil {
			return nil, err
		}
		return &graphEvents{g: g, zone: c.mailboxZone()}, nil
	}
	dav, err := w.Client(ctx, c)
	if err != nil {
		return nil, err
	}
	return &davEvents{d: dav, addrs: c.Addresses}, nil
}
