package calfeed

import (
	"context"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Occurrence is one stored instance of an event.
type Occurrence struct {
	UID      string
	Instance string
	Summary  string
	Location string
	Start    Point
	End      Point
	AllDay   bool
	Free     bool
}

// Window is the span occurrences are kept for: they must overlap [From, To).
type Window struct{ From, To time.Time }

// maxPeriods bounds the expansion loop of one rule, whatever the rule says.
const maxPeriods = 20000

// Bounds of one whole expansion (OpenSpec change bound-hostile-input):
// maxExpandWork counts rule periods visited and starts produced across all
// events of a calendar, MaxExpandTime is the deadline Fetch gives it. Either
// one stops the expansion with the occurrences found so far and a warning.
const (
	maxExpandWork = 500_000
	MaxExpandTime = 5 * time.Second
)

// expansion is the shared budget of one Expand call.
type expansion struct {
	ctx     context.Context
	left    int
	stopped bool
}

// spend uses one unit of work and reports whether the expansion may go on.
func (x *expansion) spend() bool {
	if x.stopped {
		return false
	}
	x.left--
	if x.left < 0 || x.left%1024 == 0 && x.ctx.Err() != nil {
		x.stopped = true
	}
	return !x.stopped
}

// Expand turns events into occurrences inside the window: recurrence rules
// expanded (FREQ DAILY, WEEKLY, MONTHLY, YEARLY with INTERVAL, COUNT, UNTIL,
// BYDAY with ordinals, BYMONTHDAY, BYMONTH, BYSETPOS and WKST), RDATE added,
// EXDATE removed, RECURRENCE-ID overrides applied, cancelled ones dropped, and
// at most limit kept (design D3). Rules with other parts keep their first
// occurrence only, with a warning.
func Expand(events []Event, win Window, limit int) ([]Occurrence, []string) {
	return ExpandContext(context.Background(), events, win, limit)
}

// ExpandContext is Expand that also stops when ctx is done. A stopped
// expansion (the context, or the work budget shared by all events) keeps the
// occurrences found so far and says so in a warning.
func ExpandContext(ctx context.Context, events []Event, win Window, limit int) ([]Occurrence, []string) {
	x := &expansion{ctx: ctx, left: maxExpandWork}
	w := warnings{}
	masters := map[string]*Event{}
	overrides := map[string][]Event{}
	var order []string
	for i := range events {
		ev := events[i]
		if ev.RecurrenceID != "" {
			overrides[ev.UID] = append(overrides[ev.UID], ev)
			continue
		}
		if prev, ok := masters[ev.UID]; ok && prev.Sequence > ev.Sequence {
			continue
		}
		if _, ok := masters[ev.UID]; !ok {
			order = append(order, ev.UID)
		}
		masters[ev.UID] = &ev
	}
	var out []Occurrence
	for _, uid := range order {
		if x.stopped {
			break
		}
		m := masters[uid]
		if m.Cancelled {
			continue // a cancelled series is gone, its overrides with it
		}
		byKey := map[string]Occurrence{}
		var keys []string
		for _, start := range starts(*m, win, w, x) {
			o := occurrence(*m, start)
			k := instanceKey(start)
			if _, dup := byKey[k]; !dup {
				keys = append(keys, k)
			}
			byKey[k] = o
		}
		for _, ex := range m.ExDates {
			delete(byKey, instanceKey(alignPoint(ex, m.Start)))
		}
		for _, ov := range overrides[uid] {
			if ov.Range == "THISANDFUTURE" {
				w.add(fmt.Sprintf("“%s” changes this and following occurrences; only the first changed one is shown changed", title(ov)))
			}
			delete(byKey, ov.RecurrenceID)
			if ov.Cancelled {
				continue
			}
			o := occurrence(ov, ov.Start)
			o.Instance = ov.RecurrenceID
			if overlaps(o, win) {
				if !contains(keys, ov.RecurrenceID) {
					keys = append(keys, ov.RecurrenceID)
				}
				byKey[ov.RecurrenceID] = o
			}
		}
		for _, k := range keys {
			o, ok := byKey[k]
			if !ok || !overlaps(o, win) {
				continue
			}
			o.Instance = k
			out = append(out, o)
		}
	}
	if x.stopped {
		w.add("this calendar repeats too much to show completely; some events are left out")
	}
	// Overrides whose master is not in the feed stand on their own.
	for uid, list := range overrides {
		if m, ok := masters[uid]; ok || m != nil {
			continue
		}
		for _, ov := range list {
			if ov.Cancelled {
				continue
			}
			o := occurrence(ov, ov.Start)
			o.Instance = ov.RecurrenceID
			if overlaps(o, win) {
				out = append(out, o)
			}
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return sortKey(out[i]).Before(sortKey(out[j])) })
	if limit > 0 && len(out) > limit {
		out = out[:limit]
		w.add(fmt.Sprintf("this calendar has more than %d events in the shown period; the later ones are left out", limit))
	}
	return out, w.list()
}

func contains(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

func title(e Event) string {
	if e.Summary == "" {
		return "An event"
	}
	return e.Summary
}

// occurrence places an event's length at a start.
func occurrence(ev Event, start Point) Occurrence {
	end := start
	switch {
	case ev.End != nil:
		if start.AllDay {
			days := int(ev.End.T.Sub(ev.Start.T).Hours()/24 + 0.5)
			end.T = start.T.AddDate(0, 0, max(days, 1))
		} else {
			end.T = start.T.Add(ev.End.T.Sub(ev.Start.T))
		}
	case ev.Duration != nil:
		if start.AllDay && ev.DurationDays > 0 {
			end.T = start.T.AddDate(0, 0, ev.DurationDays)
		} else {
			end.T = start.T.Add(*ev.Duration)
		}
	case start.AllDay:
		end.T = start.T.AddDate(0, 0, 1)
	}
	if end.T.Before(start.T) {
		end.T = start.T
	}
	return Occurrence{UID: ev.UID, Summary: ev.Summary, Location: ev.Location, Start: start, End: end, AllDay: start.AllDay, Free: ev.Free}
}

// sortKey orders occurrences; floating and all-day times sort by their wall time.
func sortKey(o Occurrence) time.Time {
	return o.Start.T
}

// overlaps decides window membership: floating and all-day times are compared
// as wall times read in UTC, a day's slack either way (the device places them).
func overlaps(o Occurrence, win Window) bool {
	from, to := win.From, win.To
	if o.Start.Zone == "" {
		from, to = from.Add(-24*time.Hour), to.Add(24*time.Hour)
	}
	end := o.End.T
	if !end.After(o.Start.T) {
		end = o.Start.T.Add(time.Second)
	}
	return end.After(from) && o.Start.T.Before(to)
}

// alignPoint reads an EXDATE in the master's terms (an all-day EXDATE against
// a timed rule matches the occurrence of that date).
func alignPoint(p, start Point) Point {
	if p.AllDay && !start.AllDay {
		t := time.Date(p.T.Year(), p.T.Month(), p.T.Day(), start.T.Hour(), start.T.Minute(), start.T.Second(), 0, start.T.Location())
		return Point{T: t, Zone: start.Zone}
	}
	return p
}

// rule is a parsed RRULE.
type rule struct {
	freq       string
	interval   int
	count      int
	until      *Point
	byDay      []weekdayN
	byMonthDay []int
	byMonth    []int
	bySetPos   []int
	wkst       time.Weekday
}

type weekdayN struct {
	n   int // 0: every; ±k: the k-th (from the end when negative)
	day time.Weekday
}

var weekdays = map[string]time.Weekday{"SU": time.Sunday, "MO": time.Monday, "TU": time.Tuesday, "WE": time.Wednesday, "TH": time.Thursday, "FR": time.Friday, "SA": time.Saturday}

var unsupportedParts = []string{"BYHOUR", "BYMINUTE", "BYSECOND", "BYYEARDAY", "BYWEEKNO"}

// parseRule reads an RRULE; ok is false (with the reason) for parts outside the supported set.
func parseRule(v string, start Point) (rule, string, bool) {
	r := rule{interval: 1, wkst: time.Monday}
	for _, part := range strings.Split(v, ";") {
		k, val, _ := strings.Cut(strings.TrimSpace(part), "=")
		k = strings.ToUpper(k)
		val = strings.ToUpper(strings.TrimSpace(val))
		switch k {
		case "FREQ":
			r.freq = val
		case "INTERVAL":
			if n, err := strconv.Atoi(val); err == nil && n > 0 {
				r.interval = n
			}
		case "COUNT":
			r.count, _ = strconv.Atoi(val)
		case "UNTIL":
			if p, err := parseValue(val, "", "", nil, warnings{}); err == nil {
				// A floating UNTIL is in the start's zone.
				if p.Zone == "" && !p.AllDay && start.Zone != "" {
					p.T = time.Date(p.T.Year(), p.T.Month(), p.T.Day(), p.T.Hour(), p.T.Minute(), p.T.Second(), 0, start.T.Location())
				}
				r.until = &p
			}
		case "BYDAY":
			for _, d := range strings.Split(val, ",") {
				d = strings.TrimSpace(d)
				if len(d) < 2 {
					continue
				}
				wd, ok := weekdays[d[len(d)-2:]]
				if !ok {
					continue
				}
				n := 0
				if len(d) > 2 {
					n, _ = strconv.Atoi(d[:len(d)-2])
				}
				r.byDay = append(r.byDay, weekdayN{n, wd})
			}
		case "BYMONTHDAY":
			r.byMonthDay = ints(val)
		case "BYMONTH":
			r.byMonth = ints(val)
		case "BYSETPOS":
			r.bySetPos = ints(val)
		case "WKST":
			if wd, ok := weekdays[val]; ok {
				r.wkst = wd
			}
		default:
			for _, u := range unsupportedParts {
				if k == u {
					return r, k, false
				}
			}
		}
	}
	switch r.freq {
	case "DAILY", "WEEKLY", "MONTHLY", "YEARLY":
		return r, "", true
	case "":
		return r, "FREQ", false
	default:
		return r, "FREQ=" + r.freq, false
	}
}

func ints(v string) []int {
	var out []int
	for _, s := range strings.Split(v, ",") {
		if n, err := strconv.Atoi(strings.TrimSpace(s)); err == nil && n != 0 {
			out = append(out, n)
		}
	}
	return out
}

// starts lists the occurrence starts of a master event up to the window's end.
func starts(ev Event, win Window, w warnings, x *expansion) []Point {
	out := []Point{ev.Start}
	x.spend()
	if ev.RRule != "" && !x.stopped {
		r, why, ok := parseRule(ev.RRule, ev.Start)
		if !ok {
			w.add(fmt.Sprintf("“%s” repeats in a way that is not supported (%s); only its first occurrence is shown", title(ev), why))
		} else {
			// An occurrence that starts before the window can still reach
			// into it: start looking one event length (and slack) earlier.
			o := occurrence(ev, ev.Start)
			from := win.From.Add(-o.End.T.Sub(o.Start.T) - 72*time.Hour)
			out = append(out, expandRule(r, ev.Start, win, from, x)...)
		}
	}
	for _, rd := range ev.RDates {
		out = append(out, alignPoint(rd, ev.Start))
	}
	return out
}

// expandRule produces the starts after DTSTART (DTSTART is always the first).
// A rule without COUNT does not need the periods before from: it starts at the
// last period that begins before from instead of at DTSTART.
func expandRule(r rule, start Point, win Window, from time.Time, x *expansion) []Point {
	loc := start.T.Location()
	h, mi, s := start.T.Clock()
	at := func(y int, m time.Month, d int) time.Time { return time.Date(y, m, d, h, mi, s, 0, loc) }
	end := win.To.Add(24 * time.Hour)
	produced := 1 // DTSTART counts as the first occurrence
	var out []Point
	emit := func(t time.Time) bool {
		if !t.After(start.T) {
			return true
		}
		if r.until != nil && after(t, *r.until, start) {
			return false
		}
		if r.count > 0 && produced >= r.count {
			return false
		}
		if t.After(end) && start.Zone != "" || start.Zone == "" && t.After(end.Add(24*time.Hour)) {
			return false
		}
		produced++
		out = append(out, Point{T: t, Zone: start.Zone, AllDay: start.AllDay})
		return x.spend()
	}
	y, mo, d := start.T.Date()
	first := 0
	if r.count == 0 && from.After(start.T) {
		first = skipPeriods(r, y, mo, d, from)
	}
	for i := first; i < first+maxPeriods; i++ {
		if !x.spend() {
			return out
		}
		var days []time.Time
		switch r.freq {
		case "DAILY":
			day := at(y, mo, d+i*r.interval)
			if r.matchMonth(day) && r.matchMonthDay(day) && r.matchWeekday(day) {
				days = []time.Time{day}
			}
		case "WEEKLY":
			ws := weekStart(at(y, mo, d), r.wkst).AddDate(0, 0, 7*i*r.interval)
			wanted := r.byDay
			if len(wanted) == 0 {
				wanted = []weekdayN{{0, start.T.Weekday()}}
			}
			for k := 0; k < 7; k++ {
				day := at(ws.Year(), ws.Month(), ws.Day()+k)
				for _, wd := range wanted {
					if day.Weekday() == wd.day && r.matchMonth(day) {
						days = append(days, day)
					}
				}
			}
		case "MONTHLY":
			first := at(y, mo+time.Month(i*r.interval), 1)
			if !r.matchMonth(first) {
				break
			}
			days = r.monthDays(first, start, at)
		case "YEARLY":
			year := y + i*r.interval
			months := r.byMonth
			if len(months) == 0 {
				months = []int{int(mo)}
			}
			if len(r.byMonth) == 0 && len(r.byDay) > 0 && len(r.byMonthDay) == 0 {
				days = yearWeekdays(year, r.byDay, at)
				break
			}
			for _, m := range months {
				days = append(days, r.monthDays(at(year, time.Month(m), 1), start, at)...)
			}
		}
		sort.Slice(days, func(a, b int) bool { return days[a].Before(days[b]) })
		days = setPos(days, r.bySetPos)
		for _, t := range days {
			if !emit(t) {
				return out
			}
		}
		// Stop once a whole period lies past the window.
		if periodStart(r, y, mo, d, i, at).After(end.Add(48 * time.Hour)) {
			return out
		}
	}
	return out
}

// skipPeriods is the index of a period that starts no later than from, at most
// one period before the one containing it (never negative).
func skipPeriods(r rule, y int, mo time.Month, d int, from time.Time) int {
	fy, fm, fd := from.Date()
	days := int(time.Date(fy, fm, fd, 0, 0, 0, 0, time.UTC).Sub(time.Date(y, mo, d, 0, 0, 0, 0, time.UTC)).Hours() / 24)
	var n int
	switch r.freq {
	case "DAILY":
		n = days / r.interval
	case "WEEKLY":
		n = days / 7 / r.interval
	case "MONTHLY":
		n = ((fy-y)*12 + int(fm) - int(mo)) / r.interval
	default:
		n = (fy - y) / r.interval
	}
	return max(n-1, 0)
}

func periodStart(r rule, y int, mo time.Month, d, i int, at func(int, time.Month, int) time.Time) time.Time {
	switch r.freq {
	case "DAILY":
		return at(y, mo, d+i*r.interval)
	case "WEEKLY":
		return at(y, mo, d+7*i*r.interval).AddDate(0, 0, -7)
	case "MONTHLY":
		return at(y, mo+time.Month(i*r.interval), 1)
	default:
		return at(y+i*r.interval, 1, 1)
	}
}

// after reports whether t is past an UNTIL (inclusive).
func after(t time.Time, until Point, start Point) bool {
	if until.AllDay {
		ty, tm, td := t.Date()
		uy, um, ud := until.T.Date()
		return time.Date(ty, tm, td, 0, 0, 0, 0, time.UTC).After(time.Date(uy, um, ud, 0, 0, 0, 0, time.UTC))
	}
	if start.Zone == "" && until.Zone == "UTC" {
		// A floating rule with a UTC UNTIL: compare wall times.
		return t.After(until.T)
	}
	return t.After(until.T)
}

func (r rule) matchMonth(t time.Time) bool {
	if len(r.byMonth) == 0 {
		return true
	}
	for _, m := range r.byMonth {
		if int(t.Month()) == m {
			return true
		}
	}
	return false
}

func (r rule) matchMonthDay(t time.Time) bool {
	if len(r.byMonthDay) == 0 {
		return true
	}
	last := daysIn(t.Year(), t.Month())
	for _, md := range r.byMonthDay {
		if md == t.Day() || md < 0 && last+md+1 == t.Day() {
			return true
		}
	}
	return false
}

func (r rule) matchWeekday(t time.Time) bool {
	if len(r.byDay) == 0 {
		return true
	}
	for _, wd := range r.byDay {
		if wd.day == t.Weekday() {
			return true
		}
	}
	return false
}

// monthDays lists a month's candidate days for MONTHLY and YEARLY rules.
func (r rule) monthDays(first time.Time, start Point, at func(int, time.Month, int) time.Time) []time.Time {
	y, m := first.Year(), first.Month()
	last := daysIn(y, m)
	var days []time.Time
	switch {
	case len(r.byMonthDay) > 0:
		for _, md := range r.byMonthDay {
			d := md
			if md < 0 {
				d = last + md + 1
			}
			if d >= 1 && d <= last {
				day := at(y, m, d)
				if r.matchWeekday(day) {
					days = append(days, day)
				}
			}
		}
	case len(r.byDay) > 0:
		for _, wd := range r.byDay {
			var all []time.Time
			for d := 1; d <= last; d++ {
				if day := at(y, m, d); day.Weekday() == wd.day {
					all = append(all, day)
				}
			}
			switch {
			case wd.n == 0:
				days = append(days, all...)
			case wd.n > 0 && wd.n <= len(all):
				days = append(days, all[wd.n-1])
			case wd.n < 0 && -wd.n <= len(all):
				days = append(days, all[len(all)+wd.n])
			}
		}
	default:
		if d := start.T.Day(); d <= last {
			days = append(days, at(y, m, d))
		}
	}
	return days
}

// yearWeekdays handles YEARLY with BYDAY and no BYMONTH: ordinals count within the year.
func yearWeekdays(year int, byDay []weekdayN, at func(int, time.Month, int) time.Time) []time.Time {
	var days []time.Time
	for _, wd := range byDay {
		var all []time.Time
		for d := at(year, 1, 1); d.Year() == year; d = d.AddDate(0, 0, 1) {
			if d.Weekday() == wd.day {
				all = append(all, d)
			}
		}
		switch {
		case wd.n == 0:
			days = append(days, all...)
		case wd.n > 0 && wd.n <= len(all):
			days = append(days, all[wd.n-1])
		case wd.n < 0 && -wd.n <= len(all):
			days = append(days, all[len(all)+wd.n])
		}
	}
	return days
}

func setPos(days []time.Time, pos []int) []time.Time {
	if len(pos) == 0 || len(days) == 0 {
		return days
	}
	var out []time.Time
	for _, p := range pos {
		switch {
		case p > 0 && p <= len(days):
			out = append(out, days[p-1])
		case p < 0 && -p <= len(days):
			out = append(out, days[len(days)+p])
		}
	}
	sort.Slice(out, func(a, b int) bool { return out[a].Before(out[b]) })
	return out
}

func weekStart(t time.Time, wkst time.Weekday) time.Time {
	diff := (int(t.Weekday()) - int(wkst) + 7) % 7
	return t.AddDate(0, 0, -diff)
}

func daysIn(y int, m time.Month) int {
	return time.Date(y, m+1, 0, 0, 0, 0, 0, time.UTC).Day()
}
