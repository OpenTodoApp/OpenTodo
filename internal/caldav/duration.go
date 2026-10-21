package caldav

import (
	"fmt"
	"strconv"
	"strings"
)

// Bounds that mirror the op schema (internal/sync: MaxPositiveInt for
// estimate_minutes, MaxReminderOffset for reminder.offset_minutes); a test in
// internal/httpapi keeps them equal.
const (
	MaxEstimateMinutes = 10080
	MaxAlarmOffset     = 525600
	// MaxMappedAlarms is how many VALARMs of one VTODO become reminders
	// (caldav-interop D4); further ones stay client data.
	MaxMappedAlarms = 20
)

// ParseDuration reads an iCalendar DURATION value (RFC 5545 3.3.6) as signed
// seconds: weeks (P2W) or days and a time part (P1DT2H30M15S), with an
// optional sign. Anything else is ErrInvalid.
func ParseDuration(v string) (int64, error) {
	s := strings.ToUpper(strings.TrimSpace(v))
	sign := int64(1)
	switch {
	case strings.HasPrefix(s, "-"):
		sign, s = -1, s[1:]
	case strings.HasPrefix(s, "+"):
		s = s[1:]
	}
	if !strings.HasPrefix(s, "P") || len(s) < 3 {
		return 0, fmt.Errorf("%w: bad duration %q", ErrInvalid, v)
	}
	s = s[1:]
	var total int64
	inTime, units := false, 0
	num := ""
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c >= '0' && c <= '9':
			num += string(c)
			continue
		case c == 'T':
			if inTime || num != "" {
				return 0, fmt.Errorf("%w: bad duration %q", ErrInvalid, v)
			}
			inTime = true
			continue
		}
		if num == "" || len(num) > 9 {
			return 0, fmt.Errorf("%w: bad duration %q", ErrInvalid, v)
		}
		n, _ := strconv.ParseInt(num, 10, 64)
		num = ""
		var mult int64
		switch {
		case c == 'W' && !inTime:
			mult = 7 * 86400
		case c == 'D' && !inTime:
			mult = 86400
		case c == 'H' && inTime:
			mult = 3600
		case c == 'M' && inTime:
			mult = 60
		case c == 'S' && inTime:
			mult = 1
		default:
			return 0, fmt.Errorf("%w: bad duration %q", ErrInvalid, v)
		}
		total += n * mult
		units++
	}
	if num != "" || units == 0 || strings.HasSuffix(s, "T") {
		return 0, fmt.Errorf("%w: bad duration %q", ErrInvalid, v)
	}
	return sign * total, nil
}

// DurationText renders whole minutes as an iCalendar duration in hours and
// minutes only (PT45M, PT1H30M, -PT2H), so every client reads the same value.
func DurationText(minutes int) string {
	sign := ""
	if minutes < 0 {
		sign, minutes = "-", -minutes
	}
	h, m := minutes/60, minutes%60
	switch {
	case h > 0 && m > 0:
		return fmt.Sprintf("%sPT%dH%dM", sign, h, m)
	case h > 0:
		return fmt.Sprintf("%sPT%dH", sign, h)
	}
	return fmt.Sprintf("%sPT%dM", sign, m)
}

// TriggerText renders a reminder offset as an alarm trigger duration: whole
// days as P1D (what calendar apps write for "1 day before"), anything else in
// hours and minutes.
func TriggerText(minutes int) string {
	if minutes != 0 && minutes%1440 == 0 {
		if minutes < 0 {
			return fmt.Sprintf("-P%dD", -minutes/1440)
		}
		return fmt.Sprintf("P%dD", minutes/1440)
	}
	return DurationText(minutes)
}
