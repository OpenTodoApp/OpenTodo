// Package recurrence10 holds a frozen copy of the rule grammar of OpenTodo
// 1.0.0 (this file: internal/recurrence at v1.0.0, the parser only; the web
// app's grammar was the same) and Check, which tests of every writer use to
// make sure a rule is stored in a form a 1.0 client reads whenever one means
// the same thing (OpenSpec change recurrence-1-0-compatible). This file is
// never changed, and the package is never linked into a binary
// (TestNotLinked). The TypeScript twin is web/src/lib/testdata/recurrence-1.0.ts.
package recurrence10

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
	kInterval   kind = iota // every [N] day(s)/week(s)/month(s)/year(s)
	kWeekday                // every weekday (Monday to Friday)
	kWeekdays               // every monday, wednesday
	kMonthDay               // every 15th
	kLastDay                // every last day
	kWorkday                // every 1st weekday … every last weekday: the n-th Monday to Friday
	kNthWeekday             // every 2nd tuesday, every last friday
)

type unit int

const (
	uDay unit = iota
	uWeek
	uMonth
	uYear
)

// Rule is a parsed recurrence rule. The zero value is not valid; use Parse.
type Rule struct {
	kind            kind
	interval        int
	unit            unit
	days            uint8 // bit (1<<isoWeekday) for kWeekdays / kWeekday
	monthDay        int   // 1..31 for kMonthDay
	ordinal         int   // 1..4, or -1 for last (kNthWeekday, kWorkday)
	weekday         int   // ISO 1 (Monday) .. 7 (Sunday) for kNthWeekday
	afterCompletion bool
	until           string // YYYY-MM-DD or ""
	count           int    // for N times, 0 when absent
}

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
			r.kind, r.ordinal = kWorkday, -1
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
		if peek(1) == "weekday" {
			if isNum {
				ord = num
			}
			if ord > 4 {
				return r, fail("weekday ordinal must be 1st to 4th or last")
			}
			r.kind, r.ordinal = kWorkday, ord
			i += 2
			break
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

// Readable reports whether a 1.0.0 client parses rule.
func Readable(rule string) bool {
	_, err := Parse(rule)
	return err == nil
}
