// Package recurrence parses the human-readable recurrence rules stored on tasks
// (OpenSpec change recurring-tasks) and computes next occurrences on floating
// calendar dates. It is mirrored by web/src/lib/recurrence.ts; both are checked
// against the shared vectors in web/src/lib/recurrence.vectors.json, so any
// change here must be made there too.
//
// All arithmetic runs on proleptic Gregorian day numbers, never on time.Time, so
// results do not depend on the server's time zone or on daylight saving changes.
package recurrence

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
)

// MaxLen is the longest rule accepted, in bytes of the raw input.
const MaxLen = 200

// Limits on numbers inside a rule.
const (
	MaxInterval = 999
	MaxCount    = 10000
)

// ErrInvalid wraps every parse failure.
var ErrInvalid = errors.New("invalid recurrence rule")

type kind int

const (
	kInterval    kind = iota // every [N] day(s)/week(s)/month(s)/year(s)
	kWeekday                 // every weekday (Monday to Friday)
	kWeekdays                // every monday, wednesday
	kMonthDay                // every 15th
	kLastDay                 // every last day
	kLastWeekday             // every last weekday
	kNthWeekday              // every 2nd tuesday, every last friday
)

type unit int

const (
	uDay unit = iota
	uWeek
	uMonth
	uYear
)

var unitNames = [...]string{"day", "week", "month", "year"}

// Rule is a parsed recurrence rule. The zero value is not valid; use Parse.
type Rule struct {
	kind            kind
	interval        int
	unit            unit
	days            uint8 // bit (1<<isoWeekday) for kWeekdays / kWeekday
	monthDay        int   // 1..31 for kMonthDay
	ordinal         int   // 1..4, or -1 for last (kNthWeekday)
	weekday         int   // ISO 1 (Monday) .. 7 (Sunday) for kNthWeekday
	afterCompletion bool
	until           string // YYYY-MM-DD or ""
	count           int    // for N times, 0 when absent
}

var weekdayNames = [...]string{"", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"}

var weekdayAliases = map[string]int{
	"monday": 1, "mon": 1, "tuesday": 2, "tue": 2, "wednesday": 3, "wed": 3,
	"thursday": 4, "thu": 4, "friday": 5, "fri": 5, "saturday": 6, "sat": 6, "sunday": 7, "sun": 7,
}

var wordOrdinals = map[string]int{"first": 1, "second": 2, "third": 3, "fourth": 4, "last": -1}

// ordinalSuffix returns the English suffix for n (1st, 2nd, 3rd, 4th, 11th, 21st…).
func ordinalSuffix(n int) string {
	if n%100 >= 11 && n%100 <= 13 {
		return "th"
	}
	switch n % 10 {
	case 1:
		return "st"
	case 2:
		return "nd"
	case 3:
		return "rd"
	}
	return "th"
}

// numericOrdinal parses "1st".."31st" with the correct suffix.
func numericOrdinal(tok string) (int, bool) {
	if len(tok) < 3 {
		return 0, false
	}
	n, err := strconv.Atoi(tok[:len(tok)-2])
	if err != nil || n < 1 || n > 31 || tok[0] == '0' || tok[0] == '+' || tok[0] == '-' {
		return 0, false
	}
	if tok[len(tok)-2:] != ordinalSuffix(n) {
		return 0, false
	}
	return n, true
}

func positiveInt(tok string, max int) (int, bool) {
	if tok == "" || tok[0] < '1' || tok[0] > '9' {
		return 0, false
	}
	for _, c := range tok {
		if c < '0' || c > '9' {
			return 0, false
		}
	}
	n, err := strconv.Atoi(tok)
	if err != nil || n > max {
		return 0, false
	}
	return n, true
}

func tokenize(s string) []string {
	s = strings.ToLower(s)
	s = strings.ReplaceAll(s, ",", " , ")
	return strings.Fields(s)
}

func fail(format string, a ...any) error {
	return fmt.Errorf("%w: %s", ErrInvalid, fmt.Sprintf(format, a...))
}

// Parse validates a rule and returns it; Canonical gives the stored form.
func Parse(input string) (Rule, error) {
	var r Rule
	if len(input) > MaxLen {
		return r, fail("longer than %d characters", MaxLen)
	}
	toks := tokenize(input)
	if len(toks) == 0 || toks[0] != "every" {
		return r, fail(`must start with "every"`)
	}
	i := 1
	peek := func(k int) string {
		if i+k < len(toks) {
			return toks[i+k]
		}
		return ""
	}
	tok := peek(0)
	switch {
	case tok == "":
		return r, fail(`missing pattern after "every"`)
	case tok == "day" || tok == "week" || tok == "month" || tok == "year":
		r.kind, r.interval, r.unit = kInterval, 1, unitOf(tok)
		i++
	case tok == "weekday" || tok == "weekdays":
		r.kind, r.days = kWeekday, 0b00111110
		i++
	case isNumber(tok):
		n, ok := positiveInt(tok, MaxInterval)
		if !ok {
			return r, fail("interval must be from 1 to %d", MaxInterval)
		}
		u := peek(1)
		singular := strings.TrimSuffix(u, "s")
		if singular != "day" && singular != "week" && singular != "month" && singular != "year" {
			return r, fail("expected day(s), week(s), month(s) or year(s) after %s", tok)
		}
		r.kind, r.interval, r.unit = kInterval, n, unitOf(singular)
		i += 2
	case tok == "last" && (peek(1) == "day" || peek(1) == "weekday"):
		if peek(1) == "day" {
			r.kind = kLastDay
		} else {
			r.kind = kLastWeekday
		}
		i += 2
	default:
		if _, isDay := weekdayAliases[tok]; isDay {
			mask, next, err := parseWeekdayList(toks, i)
			if err != nil {
				return r, err
			}
			r.kind, r.days, i = kWeekdays, mask, next
			break
		}
		ord, isWord := wordOrdinals[tok]
		num, isNum := numericOrdinal(tok)
		if !isWord && !isNum {
			return r, fail("unknown pattern %q", tok)
		}
		if wd, ok := weekdayAliases[peek(1)]; ok {
			if isNum {
				ord = num
			}
			if ord > 4 {
				return r, fail("weekday ordinal must be 1st to 4th or last")
			}
			r.kind, r.ordinal, r.weekday = kNthWeekday, ord, wd
			i += 2
			break
		}
		if !isNum {
			return r, fail("expected a weekday after %q", tok)
		}
		r.kind, r.monthDay = kMonthDay, num
		i++
	}
	if peek(0) == "after" {
		if peek(1) != "completion" {
			return r, fail(`expected "completion" after "after"`)
		}
		if r.kind != kInterval {
			return r, fail(`"after completion" only applies to day, week, month and year intervals`)
		}
		r.afterCompletion = true
		i += 2
	}
	switch peek(0) {
	case "until":
		d := peek(1)
		if _, ok := parseDate(d); !ok {
			return r, fail("until needs a date YYYY-MM-DD")
		}
		r.until = d
		i += 2
	case "for":
		n, ok := positiveInt(peek(1), MaxCount)
		if !ok || (peek(2) != "times" && peek(2) != "time") {
			return r, fail("expected \"for N times\" with N from 1 to %d", MaxCount)
		}
		r.count = n
		i += 3
	}
	if i < len(toks) {
		return r, fail("unexpected %q", toks[i])
	}
	return r, nil
}

func isNumber(tok string) bool {
	for _, c := range tok {
		if c < '0' || c > '9' {
			return false
		}
	}
	return tok != ""
}

func unitOf(s string) unit {
	switch s {
	case "week":
		return uWeek
	case "month":
		return uMonth
	case "year":
		return uYear
	}
	return uDay
}

// parseWeekdayList reads `name ((, | and | , and) name)*` starting at toks[i]
// and returns the weekday mask and the index after the list.
func parseWeekdayList(toks []string, i int) (uint8, int, error) {
	var mask uint8
	for {
		wd, ok := weekdayAliases[toks[i]]
		if !ok {
			return 0, 0, fail("expected a weekday, got %q", toks[i])
		}
		mask |= 1 << wd
		i++
		j := i
		if j < len(toks) && toks[j] == "," {
			j++
		}
		if j < len(toks) && toks[j] == "and" {
			j++
		}
		if j == i {
			return mask, i, nil
		}
		if j >= len(toks) {
			return 0, 0, fail("expected a weekday after the list separator")
		}
		i = j
	}
}

// Canonical is the lowercase, whitespace-normalised form that gets stored.
func (r Rule) Canonical() string {
	var b strings.Builder
	b.WriteString("every ")
	switch r.kind {
	case kInterval:
		if r.interval == 1 {
			b.WriteString(unitNames[r.unit])
		} else {
			fmt.Fprintf(&b, "%d %ss", r.interval, unitNames[r.unit])
		}
	case kWeekday:
		b.WriteString("weekday")
	case kWeekdays:
		first := true
		for wd := 1; wd <= 7; wd++ {
			if r.days&(1<<wd) != 0 {
				if !first {
					b.WriteString(", ")
				}
				b.WriteString(weekdayNames[wd])
				first = false
			}
		}
	case kMonthDay:
		fmt.Fprintf(&b, "%d%s", r.monthDay, ordinalSuffix(r.monthDay))
	case kLastDay:
		b.WriteString("last day")
	case kLastWeekday:
		b.WriteString("last weekday")
	case kNthWeekday:
		if r.ordinal < 0 {
			b.WriteString("last")
		} else {
			fmt.Fprintf(&b, "%d%s", r.ordinal, ordinalSuffix(r.ordinal))
		}
		b.WriteString(" " + weekdayNames[r.weekday])
	}
	if r.afterCompletion {
		b.WriteString(" after completion")
	}
	if r.until != "" {
		b.WriteString(" until " + r.until)
	}
	if r.count == 1 {
		b.WriteString(" for 1 time")
	} else if r.count > 1 {
		fmt.Fprintf(&b, " for %d times", r.count)
	}
	return b.String()
}

// Canonicalize parses input and returns its canonical form.
func Canonicalize(input string) (string, error) {
	r, err := Parse(input)
	if err != nil {
		return "", err
	}
	return r.Canonical(), nil
}

// AfterCompletion reports whether the rule is completion-relative.
func (r Rule) AfterCompletion() bool { return r.afterCompletion }

// Until returns the end date ("" when none).
func (r Rule) Until() string { return r.until }

// Count returns the `for N times` limit (0 when none).
func (r Rule) Count() int { return r.count }

// ---- calendar arithmetic on day numbers (days since 1970-01-01) ----

func floorDiv(a, b int) int {
	q := a / b
	if (a%b != 0) && ((a < 0) != (b < 0)) {
		q--
	}
	return q
}

func daysFromCivil(y, m, d int) int {
	if m <= 2 {
		y--
	}
	era := floorDiv(y, 400)
	yoe := y - era*400
	mp := m - 3
	if m <= 2 {
		mp = m + 9
	}
	doy := (153*mp+2)/5 + d - 1
	doe := yoe*365 + yoe/4 - yoe/100 + doy
	return era*146097 + doe - 719468
}

func civilFromDays(z int) (int, int, int) {
	z += 719468
	era := floorDiv(z, 146097)
	doe := z - era*146097
	yoe := (doe - doe/1460 + doe/36524 - doe/146096) / 365
	y := yoe + era*400
	doy := doe - (365*yoe + yoe/4 - yoe/100)
	mp := (5*doy + 2) / 153
	d := doy - (153*mp+2)/5 + 1
	m := mp + 3
	if mp >= 10 {
		m = mp - 9
	}
	if m <= 2 {
		y++
	}
	return y, m, d
}

func isLeap(y int) bool { return y%4 == 0 && (y%100 != 0 || y%400 == 0) }

func monthLen(y, m int) int {
	switch m {
	case 2:
		if isLeap(y) {
			return 29
		}
		return 28
	case 4, 6, 9, 11:
		return 30
	}
	return 31
}

// isoWeekday: 1 = Monday … 7 = Sunday. Day 0 (1970-01-01) was a Thursday.
func isoWeekday(z int) int { return ((z%7)+7+3)%7 + 1 }

func parseDate(s string) (int, bool) {
	if len(s) != 10 || s[4] != '-' || s[7] != '-' {
		return 0, false
	}
	y, e1 := strconv.Atoi(s[:4])
	m, e2 := strconv.Atoi(s[5:7])
	d, e3 := strconv.Atoi(s[8:])
	if e1 != nil || e2 != nil || e3 != nil || !isNumber(s[:4]) || !isNumber(s[5:7]) || !isNumber(s[8:]) {
		return 0, false
	}
	if m < 1 || m > 12 || d < 1 || d > monthLen(y, m) {
		return 0, false
	}
	return daysFromCivil(y, m, d), true
}

func formatDate(z int) string {
	y, m, d := civilFromDays(z)
	return fmt.Sprintf("%04d-%02d-%02d", y, m, d)
}

// addMonths moves z by n months keeping its day of month, clamped to the month's end.
func addMonths(z, n int) int {
	y, m, d := civilFromDays(z)
	idx := y*12 + (m - 1) + n
	ny, nm := floorDiv(idx, 12), idx-floorDiv(idx, 12)*12+1
	return daysFromCivil(ny, nm, min(d, monthLen(ny, nm)))
}

// step returns the k-th interval occurrence counted from anchor (k ≥ 1).
func (r Rule) step(anchor, k int) int {
	switch r.unit {
	case uWeek:
		return anchor + 7*r.interval*k
	case uMonth:
		return addMonths(anchor, r.interval*k)
	case uYear:
		return addMonths(anchor, 12*r.interval*k)
	}
	return anchor + r.interval*k
}

func lastWeekdayOf(y, m int) int {
	z := daysFromCivil(y, m, monthLen(y, m))
	for isoWeekday(z) > 5 {
		z--
	}
	return z
}

func nthWeekdayOf(y, m, ordinal, wd int) int {
	if ordinal < 0 {
		z := daysFromCivil(y, m, monthLen(y, m))
		return z - (isoWeekday(z)-wd+7)%7
	}
	first := daysFromCivil(y, m, 1)
	return first + (wd-isoWeekday(first)+7)%7 + 7*(ordinal-1)
}

// NthWeekdayDate is the date (YYYY-MM-DD) of the ordinal-th weekday (1 = Monday
// … 7 = Sunday) of month m of year y; ordinal is 1–4, or -1 for the last. Quick
// add resolves one-off ordinal weekdays with it (quick-add-nth-weekday D1), so they
// agree with the first occurrence of the matching rule.
func NthWeekdayDate(y, m, ordinal, weekday int) string {
	return formatDate(nthWeekdayOf(y, m, ordinal, weekday))
}

// inMonth returns the rule's date within month (y, m) for month-based patterns.
func (r Rule) inMonth(y, m int) int {
	switch r.kind {
	case kMonthDay:
		return daysFromCivil(y, m, min(r.monthDay, monthLen(y, m)))
	case kLastDay:
		return daysFromCivil(y, m, monthLen(y, m))
	case kLastWeekday:
		return lastWeekdayOf(y, m)
	default: // kNthWeekday
		return nthWeekdayOf(y, m, r.ordinal, r.weekday)
	}
}

// firstAfter is the first date matching the pattern strictly after z.
func (r Rule) firstAfter(z int) int {
	switch r.kind {
	case kInterval:
		return r.step(z, 1)
	case kWeekday, kWeekdays:
		for i := 1; i <= 7; i++ {
			if r.days&(1<<isoWeekday(z+i)) != 0 {
				return z + i
			}
		}
		return z + 7 // unreachable: the mask is never empty
	default:
		y, m, _ := civilFromDays(z)
		if c := r.inMonth(y, m); c > z {
			return c
		}
		if m == 12 {
			y, m = y+1, 1
		} else {
			m++
		}
		return r.inMonth(y, m)
	}
}

func mustDate(s, what string) (int, error) {
	z, ok := parseDate(s)
	if !ok {
		return 0, fmt.Errorf("recurrence: %s %q is not a valid YYYY-MM-DD date", what, s)
	}
	return z, nil
}

// Next is the next occurrence of a calendar rule after the current due date:
// the first match strictly after due, or, when that is already before today, the
// first match strictly after today (catch-up). Interval rules keep their phase
// relative to due while catching up. An empty due counts as today.
func (r Rule) Next(due, today string) (string, error) {
	t, err := mustDate(today, "today")
	if err != nil {
		return "", err
	}
	d := t
	if due != "" {
		if d, err = mustDate(due, "due"); err != nil {
			return "", err
		}
	}
	c := r.firstAfter(d)
	if c >= t {
		return formatDate(c), nil
	}
	if r.kind != kInterval {
		return formatDate(r.firstAfter(t)), nil
	}
	if r.unit == uDay || r.unit == uWeek {
		size := r.interval
		if r.unit == uWeek {
			size *= 7
		}
		k := (t-d)/size + 1
		return formatDate(d + size*k), nil
	}
	for k := 2; ; k++ {
		if c = r.step(d, k); c > t {
			return formatDate(c), nil
		}
	}
}

// NextAfterCompletion is the next occurrence of an interval rule counted from the
// local date the occurrence was completed on.
func (r Rule) NextAfterCompletion(completedOn string) (string, error) {
	c, err := mustDate(completedOn, "completedOn")
	if err != nil {
		return "", err
	}
	if r.kind != kInterval {
		return "", errors.New("recurrence: only interval rules are completion-relative")
	}
	return formatDate(r.step(c, 1)), nil
}

// Following is what completing the current occurrence does: it returns the next
// due date, or ok=false when the end condition is reached and the series should
// complete like a plain task. done is the number of completed occurrence records
// that already exist for the series (skips do not count).
func (r Rule) Following(due, today, completedOn string, done int) (next string, ok bool, err error) {
	if r.afterCompletion {
		next, err = r.NextAfterCompletion(completedOn)
	} else {
		next, err = r.Next(due, today)
	}
	if err != nil {
		return "", false, err
	}
	if r.count > 0 && done+1 >= r.count {
		return "", false, nil
	}
	if r.until != "" && next > r.until {
		return "", false, nil
	}
	return next, true, nil
}

// First is the first occurrence on or after from; it is the due date given to a
// task that gets a rule while it has no due date.
func (r Rule) First(from string) (string, error) {
	z, err := mustDate(from, "from")
	if err != nil {
		return "", err
	}
	if r.kind == kInterval {
		return from, nil
	}
	return formatDate(r.firstAfter(z - 1)), nil
}

// Preview lists up to n occurrences that would follow the current one if every
// occurrence were completed on time (calendar rules) or completed today and then
// on each due date (completion-relative rules), stopping at the end condition.
func (r Rule) Preview(due, today string, done, n int) ([]string, error) {
	out := []string{}
	cur := due
	for i := 1; i <= n; i++ {
		var next string
		var ok bool
		var err error
		switch {
		case r.afterCompletion && i == 1:
			next, ok, err = r.Following(cur, today, today, done)
		case r.afterCompletion:
			next, ok, err = r.Following(cur, today, cur, done+i-1)
		default:
			next, ok, err = r.Following(cur, today, today, done+i-1)
		}
		if err != nil {
			return nil, err
		}
		if !ok {
			break
		}
		out = append(out, next)
		cur = next
	}
	return out, nil
}

// ShiftDate moves date by as many calendar days as the series moved from `from`
// to `to` (OpenSpec change deadlines, design D8: a deadline follows its series).
// All three are YYYY-MM-DD; an invalid input returns date unchanged.
func ShiftDate(date, from, to string) string {
	d, ok1 := parseDate(date)
	f, ok2 := parseDate(from)
	n, ok3 := parseDate(to)
	if !ok1 || !ok2 || !ok3 {
		return date
	}
	return formatDate(d + n - f)
}
