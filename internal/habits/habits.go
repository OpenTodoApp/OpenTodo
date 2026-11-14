// Package habits is the server's port of web/src/lib/habits.ts (OpenSpec change
// habits-assistant, design D1): a habit's scheduled dates, day states, kept,
// strength, streaks, at risk and back on track, derived from the series row,
// its lineage and its occurrence records and the user's logical today. Pinned
// with the web module by web/src/lib/habits.vectors.json (docs/contracts.md).
// Nothing is stored: every answer is computed from the rows on each read. It
// reads no content, so it works on end-to-end encrypted accounts.
package habits

import (
	"encoding/json"
	"math"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/recurrence"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Day states (web DayState).
const (
	Blank    = "blank"
	Done     = "done"
	Tiny     = "tiny"
	Skipped  = "skipped"
	Missed   = "missed"
	Partial  = "partial"
	Rest     = "rest"
	Pending  = "pending"
	Upcoming = "upcoming"
)

// Stats is a habit's streak and its forgiving measure (web HabitStats).
type Stats struct {
	Current     int  `json:"current"`
	Best        int  `json:"best"`
	Pending     bool `json:"pending"`
	Overdue     bool `json:"overdue"`
	Kept        int  `json:"kept"`
	KeptOf      int  `json:"keptOf"`
	Strength    int  `json:"strength"`
	AtRisk      bool `json:"atRisk"`
	BackOnTrack bool `json:"backOnTrack"`
	// A target habit (habit-targets D1): its period and target, and whether
	// the current period holds it; Kept is the current period's count.
	Period string `json:"period,omitempty"`
	Target int    `json:"target,omitempty"`
	Met    bool   `json:"met,omitempty"`
	// An amount habit (habit-targets D2): today's summed amount and the goal.
	Amount float64 `json:"amount,omitempty"`
	Goal   float64 `json:"goal,omitempty"`
}

// Options is what the numbers read besides the rows (habit-targets): the
// habit_tally rows (any list; only the lineage's count) and the first day of
// the week, 0 = Sunday … 6 = Saturday (web HabitOptions; Monday by default).
type Options struct {
	Tallies   []opsync.Entity
	WeekStart *int
}

func (o Options) weekStart() int {
	if o.WeekStart == nil {
		return 1
	}
	return *o.WeekStart
}

// Day is one local day with its state.
type Day struct {
	Date  string
	State string
}

// record marks (web RecordMark).
const markOpen = "open"

// IsHabit reports a live habit series: the habit flag on a task that is not an
// occurrence record.
func IsHabit(t opsync.Entity) bool {
	return string(t["habit"]) == "true" && !t.Deleted() && str(t, "series_id") == ""
}

// IsOpen reports an open, live habit series (graduated ones included).
func IsOpen(t opsync.Entity) bool {
	return IsHabit(t) && opsync.IsNull(t["completed_at"])
}

// IsGraduated reports a graduated habit (habits-home D7).
func IsGraduated(t opsync.Entity) bool { return !opsync.IsNull(t["habit_graduated_at"]) }

// Rule is the calendar rule of a task, ok false for none, an invalid one or a
// completion-relative one.
func Rule(t opsync.Entity) (recurrence.Rule, bool) {
	text := str(t, "recurrence")
	if text == "" {
		return recurrence.Rule{}, false
	}
	r, err := recurrence.Parse(text)
	if err != nil || r.AfterCompletion() {
		return recurrence.Rule{}, false
	}
	return r, true
}

// LogicalToday is the user's calendar date at now in loc, the day starting
// dayStart minutes after midnight (the app's logicalToday).
func LogicalToday(now time.Time, loc *time.Location, dayStart int) string {
	if loc == nil {
		loc = time.UTC
	}
	l := now.In(loc)
	if dayStart > 0 && l.Hour()*60+l.Minute() < dayStart {
		y, m, d := l.Date()
		return time.Date(y, m, d-1, 12, 0, 0, 0, loc).Format(time.DateOnly)
	}
	return l.Format(time.DateOnly)
}

// ---- day numbers ----

func dayOf(iso string) int {
	t, err := time.Parse(time.DateOnly, iso)
	if err != nil {
		return 0
	}
	return int(t.Unix() / 86400)
}

func isoOf(z int) string { return time.Unix(int64(z)*86400, 0).UTC().Format(time.DateOnly) }

// AddDays is date moved by n days.
func AddDays(date string, n int) string { return isoOf(dayOf(date) + n) }

// ---- records and the measure ----

// recordsByDate maps the dates of seriesID's live records to their mark.
func recordsByDate(seriesID string, tasks []opsync.Entity, into map[string]string) {
	for _, t := range tasks {
		if t.Deleted() || !opsync.IsRecordOf(seriesID, t) {
			continue
		}
		into[opsync.RecordDate(t)] = markOf(t)
	}
}

func markOf(t opsync.Entity) string {
	switch {
	case opsync.IsNull(t["completed_at"]):
		return markOpen
	case string(t["skipped"]) == "true":
		return Skipped
	case string(t["tiny"]) == "true":
		return Tiny
	}
	return Done
}

func marks(r string) bool { return r == Done || r == Tiny || r == Partial || r == Skipped }
func kept(r string) bool  { return r == Done || r == Tiny || r == Partial }

type part struct {
	id         string
	rule       recurrence.Rule
	ok         bool
	due        string
	start, end string
}

// measure is what a habit is measured against (series-split D5).
type measure struct {
	sched   func(string) bool
	records map[string]string
	parts   []part
	amounts map[string]float64
}

func (m *measure) partOf(date string) part {
	p := m.parts[0]
	for _, q := range m.parts {
		if q.start == "" || q.start <= date {
			p = q
		}
	}
	return p
}

// measureOf is the habit's schedule and its records by date over its lineage,
// an amount habit's days done at their goal and partial below it
// (habit-targets D3); nil when the series has no calendar rule.
func measureOf(id string, series opsync.Entity, tasks []opsync.Entity, opts Options) *measure {
	m := scheduleOf(id, series, tasks)
	if m == nil {
		return nil
	}
	if goal := Goal(series); goal > 0 {
		ids := map[string]bool{}
		for _, p := range m.parts {
			ids[p.id] = true
		}
		m.amounts = AmountsOf(ids, opts.Tallies)
		for d, n := range m.amounts {
			if r := m.records[d]; r == Done || r == Tiny || r == Skipped {
				continue
			}
			if n >= goal {
				m.records[d] = Done
			} else {
				m.records[d] = Partial
			}
		}
	}
	return m
}

func scheduleOf(id string, series opsync.Entity, tasks []opsync.Entity) *measure {
	if _, ok := Rule(series); !ok {
		return nil
	}
	pieces := opsync.Lineage(id, series, tasks)
	m := &measure{records: map[string]string{}}
	for _, p := range pieces {
		row := p.Row
		if p.ID == id {
			row = series
		}
		last := ""
		if row != nil {
			last = dueDate(row)
		}
		recordsByDate(p.ID, tasks, m.records)
		if len(pieces) > 1 && p.ID != id && row != nil && !opsync.IsNull(row["completed_at"]) && last != "" && (p.End == "" || last <= p.End) {
			if _, has := m.records[last]; !has {
				m.records[last] = Done
			}
		}
		q := part{id: p.ID, due: last, start: p.Start, end: p.End}
		if row != nil {
			q.rule, q.ok = Rule(row)
		}
		m.parts = append(m.parts, q)
	}
	m.sched = func(d string) bool {
		p := m.partOf(d)
		return p.ok && (p.end == "" || d <= p.end) && p.rule.Scheduled(p.due, d)
	}
	return m
}

// PieceFor is the id of the piece of the lineage a record of date belongs to.
func PieceFor(id string, series opsync.Entity, tasks []opsync.Entity, date string) string {
	if m := scheduleOf(id, series, tasks); m != nil {
		return m.partOf(date).id
	}
	return id
}

func dueDate(t opsync.Entity) string {
	var d struct {
		Date string `json:"date"`
	}
	if opsync.IsNull(t["due"]) || json.Unmarshal(t["due"], &d) != nil {
		return ""
	}
	return d.Date
}

func firstDay(due string, records map[string]string) string {
	first := due
	for d := range records {
		if d < first {
			first = d
		}
	}
	return first
}

func (m *measure) isScheduled(date string) bool {
	_, has := m.records[date]
	return has || m.sched(date)
}

func (m *measure) past(due string) []string {
	var out []string
	for z, end := dayOf(firstDay(due, m.records)), dayOf(due); z < end; z++ {
		if d := isoOf(z); m.isScheduled(d) {
			out = append(out, d)
		}
	}
	return out
}

// Frequency is the rule's scheduled dates per day over the 364 days up to due.
func Frequency(r recurrence.Rule, due string) float64 {
	end, n := dayOf(due), 0
	for z := end - 363; z <= end; z++ {
		if r.Scheduled(due, isoOf(z)) {
			n++
		}
	}
	return float64(max(n, 1)) / 364
}

// StrengthAlpha is strength's smoothing for f scheduled dates per day.
func StrengthAlpha(f float64) float64 { return 1 - math.Pow(0.5, math.Sqrt(f)/13) }

// Compute is the habit's stats (web habitStats); nil when it cannot be
// measured (no calendar rule or no current occurrence). tasks holds the
// lineage's pieces and records (every task will do).
func Compute(id string, series opsync.Entity, tasks []opsync.Entity, today string) *Stats {
	return ComputeWith(id, series, tasks, today, Options{})
}

// ComputeWith is Compute with the habit's tallies and the week start.
func ComputeWith(id string, series opsync.Entity, tasks []opsync.Entity, today string, opts Options) *Stats {
	m := measureOf(id, series, tasks, opts)
	due := dueDate(series)
	if m == nil || due == "" {
		return nil
	}
	if target, period, ok := Target(series); ok {
		return targetStats(m, due, today, target, period, opts.weekStart())
	}
	past := m.past(due)
	best, run := 0, 0
	for _, d := range past {
		r := m.records[d]
		if !marks(r) {
			run = 0
		} else if kept(r) {
			run++
			best = max(best, run)
		}
	}
	current := 0
	for i := len(past) - 1; i >= 0; i-- {
		r := m.records[past[i]]
		if !marks(r) {
			break
		}
		if kept(r) {
			current++
		}
	}
	own := m.records[due]
	if kept(own) {
		current++
	}
	best = max(best, current)
	last := past[max(0, len(past)-7):]
	keptN := 0
	for _, d := range last {
		if kept(m.records[d]) {
			keptN++
		}
	}
	rule, _ := Rule(series)
	a := StrengthAlpha(Frequency(rule, due))
	s := 0.0
	dates := past
	if kept(own) {
		dates = append(append([]string{}, past...), due)
	}
	for _, d := range dates {
		r := m.records[d]
		if r == Skipped {
			continue
		}
		v := 0.0
		if kept(r) {
			v = 1
		}
		s = s*(1-a) + a*v
	}
	n := len(past)
	missed := func(i int) bool { return i >= 0 && i < n && !marks(m.records[past[i]]) }
	gap := 0
	for i := n - 2; i >= 0 && missed(i); i-- {
		gap++
	}
	pending := !marks(own) || own == Partial
	st := &Stats{
		Current: current, Best: best, Pending: pending, Overdue: pending && due < today,
		Kept: keptN, KeptOf: len(last), Strength: round(s),
		AtRisk: missed(n-1) && missed(n-2), BackOnTrack: n > 0 && kept(m.records[past[n-1]]) && gap >= 2,
	}
	if goal := Goal(series); goal > 0 {
		st.Amount, st.Goal = m.amounts[today], goal
	}
	return st
}

func round(s float64) int { return int(math.Floor(s*100 + 0.5)) }

// KeptDays is the number of done and tiny days over the lineage.
func KeptDays(id string, series opsync.Entity, tasks []opsync.Entity) int {
	m := measureOf(id, series, tasks, Options{})
	if m == nil {
		return 0
	}
	n := 0
	for _, r := range m.records {
		if kept(r) {
			n++
		}
	}
	return n
}

// Days lists the days from from to to (inclusive) with their state (web habitDays).
func Days(id string, series opsync.Entity, tasks []opsync.Entity, from, to, today string) []Day {
	return DaysWith(id, series, tasks, from, to, today, Options{})
}

// DaysWith is Days with the habit's tallies and the week start.
func DaysWith(id string, series opsync.Entity, tasks []opsync.Entity, from, to, today string, opts Options) []Day {
	m := measureOf(id, series, tasks, opts)
	due := dueDate(series)
	records := map[string]string{}
	if m != nil {
		records = m.records
	} else {
		recordsByDate(id, tasks, records)
	}
	first := ""
	if due != "" {
		first = firstDay(due, records)
	}
	target, period, isTarget := Target(series)
	var out []Day
	for z, end := dayOf(from), dayOf(to); z <= end; z++ {
		d := isoOf(z)
		state := ""
		if m != nil && isTarget {
			state = targetDayState(records, first, d, today, target, period, opts.weekStart())
		} else {
			state = dayState(m, due, first, records, d)
		}
		out = append(out, Day{Date: d, State: state})
	}
	return out
}

func dayState(m *measure, due, first string, records map[string]string, date string) string {
	r, has := records[date]
	if r == markOpen {
		if due != "" && date < due {
			return Missed
		}
		return Pending
	}
	if has {
		return r
	}
	if m == nil || due == "" || first == "" {
		return Blank
	}
	if date == due {
		return Pending
	}
	if date < first || !m.sched(date) {
		return Blank
	}
	if date < due {
		return Missed
	}
	return Upcoming
}

// Editable reports a day that can be set to done, tiny, skipped or cleared
// (web editableDay): a scheduled day of the habit's history up to today.
func Editable(d Day, today string) bool {
	return d.Date <= today && (d.State == Done || d.State == Tiny || d.State == Partial || d.State == Skipped || d.State == Missed || d.State == Rest)
}

// PreviousScheduled is the latest scheduled date strictly before before, ""
// when the history (from its first record) has none (web previousScheduled).
func PreviousScheduled(r recurrence.Rule, due, before string, records map[string]bool) string {
	first := due
	for d := range records {
		if d < first {
			first = d
		}
	}
	for z, f := dayOf(before)-1, dayOf(first); z >= f; z-- {
		d := isoOf(z)
		if records[d] || r.Scheduled(due, d) {
			return d
		}
	}
	return ""
}

func str(t opsync.Entity, f string) string { return opsync.StringOf(t[f]) }
