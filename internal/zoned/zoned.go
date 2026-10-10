// Package zoned resolves zoned due values (OpenSpec change absolute-datetimes):
// a wall-clock date and time in a named IANA zone denote one instant. The same
// rules are implemented in web/src/lib/dates.ts and both are checked against the
// shared vectors in web/src/lib/zoned.vectors.json.
//
// Rules (design D3): the zone's rules in force on the date apply; a wall time
// that does not exist (spring-forward gap) resolves to the first valid instant
// after the gap; a wall time that occurs twice (autumn overlap) resolves to its
// first occurrence.
package zoned

import (
	"errors"
	"fmt"
	"time"

	// The container image has no zone database on disk; the standard library's
	// embedded copy makes validation and conversion independent of the host.
	_ "time/tzdata"
)

// MaxZoneLen bounds the length of a zone name in a due value.
const MaxZoneLen = 64

// Load returns the location for an IANA zone name accepted in a due value.
// "Local" and the empty name are rejected: they mean different things on every
// machine.
func Load(tz string) (*time.Location, error) {
	if tz == "" || len(tz) > MaxZoneLen || tz == "Local" {
		return nil, fmt.Errorf("unknown time zone %q", tz)
	}
	loc, err := time.LoadLocation(tz)
	if err != nil {
		return nil, fmt.Errorf("unknown time zone %q", tz)
	}
	return loc, nil
}

// Valid reports whether tz is a known IANA zone name of at most MaxZoneLen characters.
func Valid(tz string) bool {
	_, err := Load(tz)
	return err == nil
}

// Instant is the instant at wall time date ("YYYY-MM-DD") and clock ("HH:MM") in
// loc, with the gap and overlap rules above.
func Instant(date, clock string, loc *time.Location) (time.Time, error) {
	var y, mo, d, hh, mm int
	if _, err := fmt.Sscanf(date, "%4d-%2d-%2d", &y, &mo, &d); err != nil {
		return time.Time{}, errors.New("invalid date")
	}
	if _, err := fmt.Sscanf(clock, "%2d:%2d", &hh, &mm); err != nil {
		return time.Time{}, errors.New("invalid time")
	}
	wall := time.Date(y, time.Month(mo), d, hh, mm, 0, 0, time.UTC).Unix()
	offAt := func(u int64) int64 {
		_, o := time.Unix(u, 0).In(loc).Zone()
		return int64(o)
	}
	before, after := offAt(wall-86400), offAt(wall+86400)
	best, found := int64(0), false
	for _, o := range []int64{before, after} {
		c := wall - o
		if offAt(c) == o && (!found || c < best) {
			best, found = c, true
		}
	}
	if !found {
		// Gap: wall-before lies after the transition; the transition itself is
		// the first valid instant after the missing wall times.
		best = wall - before
		if start, _ := time.Unix(best, 0).In(loc).ZoneBounds(); !start.IsZero() {
			best = start.Unix()
		}
	}
	return time.Unix(best, 0).In(loc), nil
}

// Local is the wall date and clock of t in loc.
func Local(t time.Time, loc *time.Location) (date, clock string) {
	l := t.In(loc)
	return l.Format("2006-01-02"), l.Format("15:04")
}
