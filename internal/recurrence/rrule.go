package recurrence

import (
	"sort"
	"strconv"
	"strings"
)

// iCalendar RRULE conversion (OpenSpec change caldav). This is server-only: the
// web client never sees RRULE text, so there is no TypeScript mirror. Rules map
// to the RRULE that produces the same calendar dates from the task's due date;
// RRULEs map back only when the grammar can express them exactly.

var rruleDays = [...]string{"", "MO", "TU", "WE", "TH", "FR", "SA", "SU"}

var freqOf = [...]string{"DAILY", "WEEKLY", "MONTHLY", "YEARLY"}

// RRULE returns the RRULE value equivalent to r. Completion-relative rules
// return the RRULE of their interval: a calendar client shows a plain repetition
// and the server keeps the rule (see FromRRULE and the caldav mapping).
func (r Rule) RRULE() string {
	parts := []string{}
	switch r.kind {
	case kInterval:
		parts = append(parts, "FREQ="+freqOf[r.unit])
		if r.interval > 1 {
			parts = append(parts, "INTERVAL="+strconv.Itoa(r.interval))
		}
	case kWeekday, kWeekdays:
		parts = append(parts, "FREQ=WEEKLY", "BYDAY="+dayList(r.days))
	case kMonthDay:
		parts = append(parts, "FREQ=MONTHLY", "BYMONTHDAY="+strconv.Itoa(r.monthDay))
	case kLastDay:
		parts = append(parts, "FREQ=MONTHLY", "BYMONTHDAY=-1")
	case kLastWeekday:
		parts = append(parts, "FREQ=MONTHLY", "BYDAY=MO,TU,WE,TH,FR", "BYSETPOS=-1")
	case kNthWeekday:
		parts = append(parts, "FREQ=MONTHLY", "BYDAY="+strconv.Itoa(r.ordinal)+rruleDays[r.weekday])
	}
	if r.until != "" {
		parts = append(parts, "UNTIL="+strings.ReplaceAll(r.until, "-", ""))
	}
	if r.count > 0 {
		parts = append(parts, "COUNT="+strconv.Itoa(r.count))
	}
	return strings.Join(parts, ";")
}

func dayList(mask uint8) string {
	var out []string
	for wd := 1; wd <= 7; wd++ {
		if mask&(1<<wd) != 0 {
			out = append(out, rruleDays[wd])
		}
	}
	return strings.Join(out, ",")
}

// SameRRULE reports whether two RRULE values describe the same rule, ignoring
// part order, letter case, WKST and a default INTERVAL=1.
func SameRRULE(a, b string) bool {
	pa, ea := rruleParts(a)
	pb, eb := rruleParts(b)
	if ea != nil || eb != nil || len(pa) != len(pb) {
		return false
	}
	for k, v := range pa {
		if pb[k] != v {
			return false
		}
	}
	return true
}

func rruleParts(s string) (map[string]string, error) {
	out := map[string]string{}
	for _, part := range strings.Split(strings.TrimSpace(s), ";") {
		if part == "" {
			continue
		}
		k, v, ok := strings.Cut(part, "=")
		if !ok {
			return nil, fail("RRULE part %q has no value", part)
		}
		k, v = strings.ToUpper(strings.TrimSpace(k)), strings.ToUpper(strings.TrimSpace(v))
		if _, dup := out[k]; dup {
			return nil, fail("RRULE repeats %s", k)
		}
		out[k] = v
	}
	delete(out, "WKST")
	if out["INTERVAL"] == "1" {
		delete(out, "INTERVAL")
	}
	if u, ok := out["UNTIL"]; ok && len(u) > 8 {
		out["UNTIL"] = u[:8] // a date-time UNTIL bounds the same calendar date
	}
	if d, ok := out["BYDAY"]; ok {
		days := strings.Split(d, ",")
		sort.Strings(days)
		out["BYDAY"] = strings.Join(days, ",")
	}
	return out, nil
}

// FromRRULE converts an RRULE value into a rule when the grammar expresses it
// exactly. due is the task's due date ("YYYY-MM-DD" or ""), the series anchor: an
// RRULE that only restates the anchor (FREQ=WEEKLY;INTERVAL=2;BYDAY=<due's
// weekday>) is accepted as the plain interval. ok is false for anything else
// (hourly rules, BYHOUR, several ordinals, BYSETPOS other than the last weekday…).
func FromRRULE(value, due string) (rule Rule, ok bool) {
	p, err := rruleParts(value)
	if err != nil {
		return Rule{}, false
	}
	var r Rule
	interval := 1
	if v, has := p["INTERVAL"]; has {
		n, ok := positiveInt(v, MaxInterval)
		if !ok {
			return Rule{}, false
		}
		interval = n
	}
	if v, has := p["UNTIL"]; has {
		if len(v) != 8 || !isNumber(v) {
			return Rule{}, false
		}
		d := v[:4] + "-" + v[4:6] + "-" + v[6:8]
		if _, ok := parseDate(d); !ok {
			return Rule{}, false
		}
		r.until = d
	}
	if v, has := p["COUNT"]; has {
		n, ok := positiveInt(v, MaxCount)
		if !ok || r.until != "" {
			return Rule{}, false
		}
		r.count = n
	}
	anchor, hasAnchor := parseDate(due)
	var am, ad int
	if hasAnchor {
		_, am, ad = civilFromDays(anchor)
	}
	byday, hasDay := p["BYDAY"]
	monthday, hasMonthDay := p["BYMONTHDAY"]
	setpos, hasSetpos := p["BYSETPOS"]
	bymonth, hasMonth := p["BYMONTH"]
	for k := range p {
		switch k {
		case "FREQ", "INTERVAL", "UNTIL", "COUNT", "BYDAY", "BYMONTHDAY", "BYSETPOS", "BYMONTH":
		default:
			return Rule{}, false
		}
	}
	plain := func(u unit) (Rule, bool) {
		r.kind, r.interval, r.unit = kInterval, interval, u
		return r, true
	}
	switch p["FREQ"] {
	case "DAILY":
		if hasDay || hasMonthDay || hasSetpos || hasMonth {
			return Rule{}, false
		}
		return plain(uDay)
	case "WEEKLY":
		if hasMonthDay || hasSetpos || hasMonth {
			return Rule{}, false
		}
		if !hasDay {
			return plain(uWeek)
		}
		mask, ok := parseDayMask(byday)
		if !ok {
			return Rule{}, false
		}
		if interval > 1 || mask == 0 {
			// Only a restatement of the anchor's weekday is expressible.
			if hasAnchor && mask == 1<<isoWeekday(anchor) {
				return plain(uWeek)
			}
			return Rule{}, false
		}
		if mask == 0b00111110 {
			r.kind, r.days = kWeekday, mask
		} else {
			r.kind, r.days = kWeekdays, mask
		}
		return r, true
	case "MONTHLY":
		if hasMonth {
			return Rule{}, false
		}
		switch {
		case !hasDay && !hasMonthDay && !hasSetpos:
			return plain(uMonth)
		case hasMonthDay && !hasDay && !hasSetpos:
			n, err := strconv.Atoi(monthday)
			if err != nil {
				return Rule{}, false
			}
			if interval > 1 {
				if hasAnchor && n == ad {
					return plain(uMonth)
				}
				return Rule{}, false
			}
			switch {
			case n == -1:
				r.kind = kLastDay
			case n >= 1 && n <= 31:
				r.kind, r.monthDay = kMonthDay, n
			default:
				return Rule{}, false
			}
			return r, true
		case hasDay && !hasMonthDay && interval == 1:
			if hasSetpos {
				if setpos != "-1" || byday != "FR,MO,TH,TU,WE" {
					return Rule{}, false
				}
				r.kind = kLastWeekday
				return r, true
			}
			if strings.Contains(byday, ",") {
				return Rule{}, false
			}
			ordText, day := byday[:max(0, len(byday)-2)], byday[max(0, len(byday)-2):]
			wd := dayIndex(day)
			ord, err := strconv.Atoi(strings.TrimPrefix(ordText, "+"))
			if wd == 0 || err != nil || !(ord == -1 || ord >= 1 && ord <= 4) {
				return Rule{}, false
			}
			r.kind, r.ordinal, r.weekday = kNthWeekday, ord, wd
			return r, true
		}
		return Rule{}, false
	case "YEARLY":
		if hasDay || hasSetpos {
			return Rule{}, false
		}
		// BYMONTH / BYMONTHDAY may only restate the anchor date.
		if hasMonth && (!hasAnchor || bymonth != strconv.Itoa(am)) {
			return Rule{}, false
		}
		if hasMonthDay && (!hasAnchor || monthday != strconv.Itoa(ad)) {
			return Rule{}, false
		}
		return plain(uYear)
	}
	return Rule{}, false
}

func dayIndex(s string) int {
	for i, d := range rruleDays {
		if i > 0 && d == s {
			return i
		}
	}
	return 0
}

func parseDayMask(s string) (uint8, bool) {
	var mask uint8
	for _, d := range strings.Split(s, ",") {
		wd := dayIndex(d)
		if wd == 0 {
			return 0, false
		}
		mask |= 1 << wd
	}
	return mask, true
}
