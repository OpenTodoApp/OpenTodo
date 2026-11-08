// Package sector is the Go twin of web/src/lib/sectors.ts (OpenSpec change
// time-sectors): a task planned for a period rather than a day. The stored value
// is absolute, an ISO week "2026-W44", a month "2026-11" or a quarter "2026-Q4";
// what is relative (This week, Next month, carried over) is derived from a local
// date and a first day of the week, and never written.
//
// Both sides run web/src/lib/sectors.vectors.json and must agree. Change them
// together.
package sector

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Kind is the kind of a period.
type Kind string

const (
	Week    Kind = "week"
	Month   Kind = "month"
	Quarter Kind = "quarter"
)

// Period is a parsed sector.
type Period struct {
	Kind Kind
	Year int
	// N is the week (1–53), month (1–12) or quarter (1–4).
	N int
}

// Words are the relative words a sector can be named with, in the planning
// list's order.
var Words = []string{"this-week", "next-week", "this-month", "next-month", "this-quarter", "next-quarter"}

// Groups are the planning list's groups, in order (design D5).
var Groups = append(append([]string{"carried"}, Words...), "later")

var re = regexp.MustCompile(`^(\d{4})-(?:W(\d{2})|(\d{2})|Q(\d))$`)

func date(iso string) (time.Time, bool) {
	t, err := time.Parse(time.DateOnly, iso)
	return t, err == nil
}

func isoDow(t time.Time) int { return (int(t.Weekday())+6)%7 + 1 }

// ISOWeeksIn is 52 or 53: the number of ISO weeks of a year.
func ISOWeeksIn(year int) int {
	_, w := time.Date(year, 12, 28, 0, 0, 0, 0, time.UTC).ISOWeek()
	return w
}

// MondayOfWeek is the Monday of an ISO week.
func MondayOfWeek(year, week int) time.Time {
	jan4 := time.Date(year, 1, 4, 0, 0, 0, 0, time.UTC)
	return jan4.AddDate(0, 0, 1-isoDow(jan4)+(week-1)*7)
}

// Parse reads a stored sector; ok is false when it is empty or invalid (years
// 2000–2999, W53 only in a year that has one).
func Parse(value string) (Period, bool) {
	m := re.FindStringSubmatch(value)
	if m == nil {
		return Period{}, false
	}
	year, _ := strconv.Atoi(m[1])
	if year < 2000 || year > 2999 {
		return Period{}, false
	}
	switch {
	case m[2] != "":
		n, _ := strconv.Atoi(m[2])
		return Period{Week, year, n}, n >= 1 && n <= ISOWeeksIn(year)
	case m[3] != "":
		n, _ := strconv.Atoi(m[3])
		return Period{Month, year, n}, n >= 1 && n <= 12
	default:
		n, _ := strconv.Atoi(m[4])
		return Period{Quarter, year, n}, n >= 1 && n <= 4
	}
}

// Valid reports whether value is a valid stored sector ("" is none, not a sector).
func Valid(value string) bool {
	_, ok := Parse(value)
	return ok
}

// Check is the write-path validation: nil for "" or a valid period.
func Check(value string) error {
	if value == "" || Valid(value) {
		return nil
	}
	return fmt.Errorf("%q is not a time sector (YYYY-Www, YYYY-MM or YYYY-Qn)", value)
}

func (p Period) String() string {
	switch p.Kind {
	case Week:
		return fmt.Sprintf("%d-W%02d", p.Year, p.N)
	case Month:
		return fmt.Sprintf("%d-%02d", p.Year, p.N)
	}
	return fmt.Sprintf("%d-Q%d", p.Year, p.N)
}

// Range is the first and last day of a period.
func (p Period) Range() (start, end time.Time) {
	if p.Kind == Week {
		start = MondayOfWeek(p.Year, p.N)
		return start, start.AddDate(0, 0, 6)
	}
	first, months := p.N, 1
	if p.Kind == Quarter {
		first, months = (p.N-1)*3+1, 3
	}
	start = time.Date(p.Year, time.Month(first), 1, 0, 0, 0, 0, time.UTC)
	return start, start.AddDate(0, months, -1)
}

func (p Period) next() Period {
	max := 4
	switch p.Kind {
	case Week:
		max = ISOWeeksIn(p.Year)
	case Month:
		max = 12
	}
	if p.N < max {
		return Period{p.Kind, p.Year, p.N + 1}
	}
	return Period{p.Kind, p.Year + 1, 1}
}

func (p Period) before(q Period) bool {
	return p.Year < q.Year || (p.Year == q.Year && p.N < q.N)
}

// Current is the viewer's current periods by word (design D3). This week is the
// ISO week holding the Monday that falls inside the viewer's current week;
// weekStart is 0 (Sunday) to 6 (Saturday). A malformed date gives nil.
func Current(localDate string, weekStart int) map[string]string {
	d, ok := date(localDate)
	if !ok {
		return nil
	}
	ws := ((weekStart % 7) + 7) % 7
	start := d.AddDate(0, 0, -((int(d.Weekday()) - ws + 7) % 7))
	monday := start.AddDate(0, 0, (1-ws+7)%7)
	y, w := monday.ISOWeek()
	week := Period{Week, y, w}
	month := Period{Month, d.Year(), int(d.Month())}
	quarter := Period{Quarter, d.Year(), (int(d.Month())-1)/3 + 1}
	return map[string]string{
		"this-week":    week.String(),
		"next-week":    week.next().String(),
		"this-month":   month.String(),
		"next-month":   month.next().String(),
		"this-quarter": quarter.String(),
		"next-quarter": quarter.next().String(),
	}
}

// Resolve is the sector a relative word ("this-week", "next month", …) means
// on the viewer's date, or "" for an unknown word.
func Resolve(word, localDate string, weekStart int) string {
	w := strings.Join(strings.FieldsFunc(strings.ToLower(strings.TrimSpace(word)), func(r rune) bool {
		return r == ' ' || r == '_' || r == '-' || r == '\t'
	}), "-")
	return Current(localDate, weekStart)[w]
}

// Relative is the word a sector is named by on the viewer's date, or "".
func Relative(sector, localDate string, weekStart int) string {
	if !Valid(sector) {
		return ""
	}
	cur := Current(localDate, weekStart)
	for _, w := range Words {
		if cur[w] == sector {
			return w
		}
	}
	return ""
}

// Carried reports whether the sector's period ended before the viewer's current
// period of its kind.
func Carried(sector, localDate string, weekStart int) bool {
	p, ok := Parse(sector)
	if !ok {
		return false
	}
	now, ok := Parse(Current(localDate, weekStart)["this-"+string(p.Kind)])
	return ok && p.before(now)
}

// Group is the planning list group of a sector (design D5): carried, the
// relative word of its own kind, else the first later group whose period holds
// the sector's first day, else later; "" for an invalid value.
func Group(sector, localDate string, weekStart int) string {
	p, ok := Parse(sector)
	if !ok {
		return ""
	}
	if Carried(sector, localDate, weekStart) {
		return "carried"
	}
	if w := Relative(sector, localDate, weekStart); w != "" {
		return w
	}
	first, _ := p.Range()
	cur := Current(localDate, weekStart)
	for _, w := range []string{"this-month", "next-month", "this-quarter", "next-quarter"} {
		q, _ := Parse(cur[w])
		s, e := q.Range()
		if !first.Before(s) && !first.After(e) {
			return w
		}
	}
	return "later"
}
