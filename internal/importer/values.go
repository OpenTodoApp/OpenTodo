package importer

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

// Layouts for date-times without a zone: they are already floating wall-clock values.
var floatingLayouts = []string{
	"2006-01-02T15:04:05.999999999",
	"2006-01-02T15:04:05",
	"2006-01-02T15:04",
	"2006-01-02 15:04:05",
	"2006-01-02 15:04",
}

// Layouts for date-times with an offset or Z: converted to the chosen time zone.
var zonedLayouts = []string{
	time.RFC3339Nano,
	"2006-01-02T15:04Z07:00",
	"2006-01-02 15:04:05Z07:00",
	"2006-01-02 15:04Z07:00",
	"2006-01-02 15:04:05 -0700",
}

// parseDue turns a date or date-time into a floating due value. A plain date stays
// a date; a date-time without zone keeps its wall clock; a zoned date-time becomes
// the wall clock of that instant in loc. Empty input yields nil.
func parseDue(s string, loc *time.Location) (*Due, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil, nil
	}
	if len(s) == 10 {
		if _, err := time.Parse("2006-01-02", s); err == nil {
			return &Due{Date: s}, nil
		}
	}
	for _, l := range floatingLayouts {
		if t, err := time.Parse(l, s); err == nil {
			return &Due{Date: t.Format("2006-01-02"), Time: t.Format("15:04")}, nil
		}
	}
	for _, l := range zonedLayouts {
		if t, err := time.Parse(l, s); err == nil {
			t = t.In(loc)
			return &Due{Date: t.Format("2006-01-02"), Time: t.Format("15:04")}, nil
		}
	}
	return nil, fmt.Errorf("invalid due date %q (expected YYYY-MM-DD or YYYY-MM-DDTHH:MM)", s)
}

// setDeadline reads a deadline value into the row (OpenSpec change deadlines,
// design D9): a date, or a date-time whose time is dropped with a warning. A
// value that is neither fails the row, naming it.
func setDeadline(row *Row, s string, loc *time.Location) {
	d, err := parseDue(s, loc)
	if err != nil {
		row.fail("invalid deadline %q (expected YYYY-MM-DD)", strings.TrimSpace(s))
		return
	}
	if d == nil {
		return
	}
	row.Deadline = d.Date
	if d.Time != "" {
		// Keep the day as written, not as read in the import's zone.
		if t := strings.TrimSpace(s); len(t) >= 10 {
			if _, err := time.Parse("2006-01-02", t[:10]); err == nil {
				row.Deadline = t[:10]
			}
		}
		row.warn("deadline time dropped (a deadline is a date)")
	}
}

// parseClock accepts H:MM, HH:MM or HH:MM:SS and returns HH:MM.
func parseClock(s string) (string, error) {
	s = strings.TrimSpace(s)
	for _, l := range []string{"15:04", "15:04:05", "3:04PM", "3:04 PM", "3:04pm", "3:04 pm"} {
		if t, err := time.Parse(l, s); err == nil {
			return t.Format("15:04"), nil
		}
	}
	return "", fmt.Errorf("invalid due time %q (expected HH:MM)", s)
}

// parseTimestamp reads a point in time as Unix milliseconds: an integer (milliseconds,
// or seconds when it is too small to be a plausible millisecond value), an RFC 3339
// date-time, a date-time without zone or a date (both read in loc).
func parseTimestamp(s string, loc *time.Location) (int64, error) {
	s = strings.TrimSpace(s)
	if n, err := strconv.ParseInt(s, 10, 64); err == nil {
		if n <= 0 {
			return 0, fmt.Errorf("invalid timestamp %q", s)
		}
		if n < 100_000_000_000 { // before 1973 in ms: treat as seconds
			n *= 1000
		}
		return n, nil
	}
	for _, l := range zonedLayouts {
		if t, err := time.Parse(l, s); err == nil {
			return t.UnixMilli(), nil
		}
	}
	for _, l := range append([]string{"2006-01-02"}, floatingLayouts...) {
		if t, err := time.ParseInLocation(l, s, loc); err == nil {
			return t.UnixMilli(), nil
		}
	}
	return 0, fmt.Errorf("invalid timestamp %q", s)
}

// parsePriority reads 1–4 (1 highest), p1–p4, or a word. Blank means "not given".
func parsePriority(s string) (int, error) {
	v := strings.ToLower(strings.TrimSpace(s))
	switch v {
	case "":
		return 0, nil
	case "1", "p1", "urgent", "highest", "high":
		return 1, nil
	case "2", "p2", "medium":
		return 2, nil
	case "3", "p3", "low":
		return 3, nil
	case "4", "p4", "none", "0":
		return 4, nil
	}
	return 0, fmt.Errorf("invalid priority %q (expected 1-4 or p1-p4)", s)
}

// truthy reports whether a completion marker means "completed".
func truthy(s string) bool {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "1", "true", "yes", "y", "x", "done", "completed", "complete", "checked":
		return true
	}
	return false
}

// splitList splits a comma-separated list, trimming and dropping empties and
// case-insensitive duplicates.
func splitList(s string) []string {
	return dedupeNames(strings.Split(s, ","))
}

func dedupeNames(in []string) []string {
	var out []string
	seen := map[string]bool{}
	for _, part := range in {
		part = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(part), "@"))
		if part == "" || seen[strings.ToLower(part)] {
			continue
		}
		seen[strings.ToLower(part)] = true
		out = append(out, part)
	}
	return out
}
