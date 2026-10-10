package cli

import (
	"fmt"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/zoned"
)

// localDate formats t's calendar date in its own location as YYYY-MM-DD.
func localDate(t time.Time) string {
	return t.Format("2006-01-02")
}

var weekdays = map[string]time.Weekday{
	"sunday": time.Sunday, "sun": time.Sunday,
	"monday": time.Monday, "mon": time.Monday,
	"tuesday": time.Tuesday, "tue": time.Tuesday, "tues": time.Tuesday,
	"wednesday": time.Wednesday, "wed": time.Wednesday,
	"thursday": time.Thursday, "thu": time.Thursday, "thur": time.Thursday, "thurs": time.Thursday,
	"friday": time.Friday, "fri": time.Friday,
	"saturday": time.Saturday, "sat": time.Saturday,
}

// resolveDate turns a --due word into a calendar date. Accepted: YYYY-MM-DD, today,
// tomorrow and English weekday names (the next occurrence after today).
func resolveDate(word string, now time.Time) (string, error) {
	w := strings.ToLower(strings.TrimSpace(word))
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	switch w {
	case "":
		return "", usageErr("--due needs a value: YYYY-MM-DD, today, tomorrow or a weekday name")
	case "today", "tod":
		return localDate(today), nil
	case "tomorrow", "tom", "tmr":
		return localDate(today.AddDate(0, 0, 1)), nil
	}
	if wd, ok := weekdays[w]; ok {
		days := (int(wd) - int(today.Weekday()) + 7) % 7
		if days == 0 {
			days = 7
		}
		return localDate(today.AddDate(0, 0, days)), nil
	}
	if t, err := time.ParseInLocation("2006-01-02", w, now.Location()); err == nil && localDate(t) == w {
		return w, nil
	}
	return "", usageErr("invalid --due %q: use YYYY-MM-DD, today, tomorrow or a weekday name", word)
}

// validClock checks HH:MM, 00:00 to 23:59.
func validClock(s string) error {
	if len(s) != 5 || s[2] != ':' {
		return usageErr("invalid --time %q: use HH:MM (24-hour)", s)
	}
	var h, m int
	if _, err := fmt.Sscanf(s, "%02d:%02d", &h, &m); err != nil || h < 0 || h > 23 || m < 0 || m > 59 {
		return usageErr("invalid --time %q: use HH:MM (24-hour)", s)
	}
	for i, c := range s {
		if i != 2 && (c < '0' || c > '9') {
			return usageErr("invalid --time %q: use HH:MM (24-hour)", s)
		}
	}
	return nil
}

// describeDue renders a due object for the table and reports whether it is overdue.
func describeDue(d *due, today string) (string, bool) {
	if d == nil {
		return "", false
	}
	s := d.Date
	if d.Time != nil && *d.Time != "" {
		s += " " + *d.Time
	}
	if d.hint != "" {
		s += " (" + d.hint + ")"
	}
	if d.Date < today {
		return s + " overdue", true
	}
	return s, false
}

// inZone is d as seen from loc: a zoned due converted to loc's wall date and
// time (with the original as a hint when the zones differ), a floating one as is.
func (d *due) inZone(loc *time.Location) *due {
	if d == nil || d.TZ == nil || d.Time == nil {
		return d
	}
	zl, err := zoned.Load(*d.TZ)
	if err != nil {
		return d
	}
	at, err := zoned.Instant(d.Date, *d.Time, zl)
	if err != nil {
		return d
	}
	date, clock := zoned.Local(at, loc)
	out := &due{Date: date, Time: &clock, TZ: d.TZ}
	if ld, lc := zoned.Local(at, zl); ld != date || lc != clock {
		out.hint = *d.Time + " " + zoneCity(*d.TZ)
		if d.Date != date {
			out.hint = d.Date + " " + out.hint
		}
	}
	return out
}

// rezone turns an edited view of a zoned due (wall time in loc) back into the
// same instant in the task's zone. Without a time the zone is dropped.
func (d due) rezone(loc *time.Location) due {
	d.hint = ""
	if d.TZ == nil {
		return d
	}
	if d.Time == nil {
		return due{Date: d.Date}
	}
	zl, err := zoned.Load(*d.TZ)
	if err != nil {
		return due{Date: d.Date, Time: d.Time}
	}
	at, err := zoned.Instant(d.Date, *d.Time, loc)
	if err != nil {
		return d
	}
	date, clock := zoned.Local(at, zl)
	return due{Date: date, Time: &clock, TZ: d.TZ}
}

// zoneCity is the last segment of a zone name with underscores as spaces.
func zoneCity(tz string) string {
	if i := strings.LastIndexByte(tz, '/'); i >= 0 {
		tz = tz[i+1:]
	}
	return strings.ReplaceAll(tz, "_", " ")
}

func formatMillis(ms float64) string {
	if ms <= 0 {
		return ""
	}
	return time.UnixMilli(int64(ms)).Local().Format("2006-01-02 15:04")
}
