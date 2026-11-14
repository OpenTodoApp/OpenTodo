package habits

import (
	"encoding/json"
	"errors"
	"math"

	"github.com/OpenTodoApp/opentodo/internal/ids"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Targets and amounts (OpenSpec change habit-targets; web habits.ts, the same
// vectors): a target habit is measured over periods, an amount habit's days
// over the sum of their tallies.

// Target is a target habit's target and period ("week" or "month"); ok false
// for a habit without one.
func Target(t opsync.Entity) (target int, period string, ok bool) {
	n := int(math.Floor(num(t, "habit_target")))
	p := str(t, "habit_period")
	if n <= 0 || (p != "week" && p != "month") {
		return 0, "", false
	}
	return min(n, 31), p, true
}

// Goal is an amount habit's daily goal, 0 for none.
func Goal(t opsync.Entity) float64 { return max(num(t, "habit_amount"), 0) }

// Step is the check button's step: the habit's, else 1.
func Step(t opsync.Entity) float64 {
	if s := num(t, "habit_step"); s > 0 {
		return s
	}
	return 1
}

// AmountsOf sums the live tallies of the series ids (a lineage) per day.
func AmountsOf(ids map[string]bool, tallies []opsync.Entity) map[string]float64 {
	out := map[string]float64{}
	for _, x := range tallies {
		date := str(x, "date")
		n := num(x, "count")
		if x.Deleted() || date == "" || !ids[str(x, "series_id")] || n <= 0 {
			continue
		}
		out[date] += n
	}
	return out
}

// OwnForExact is the own tally a device writes for an exact amount: the
// amount minus the other devices' counts, never below zero.
func OwnForExact(others, exact float64) float64 { return max(0, exact-others) }

// PeriodStart is the first day of the period holding date: the week from
// weekStart (0 = Sunday), or the month.
func PeriodStart(date, period string, weekStart int) string {
	if period == "month" {
		return date[:8] + "01"
	}
	z := dayOf(date)
	wd := ((z%7)+7+3)%7 + 1 // ISO weekday, 1 = Monday
	return isoOf(z - ((wd%7)-weekStart+7)%7)
}

// PeriodEnd is the last day of the period holding date.
func PeriodEnd(date, period string, weekStart int) string {
	start := PeriodStart(date, period, weekStart)
	if period == "week" {
		return AddDays(start, 6)
	}
	return AddDays(AddDays(start, 31)[:8]+"01", -1)
}

// targetStats is a target habit's numbers (web targetStats).
func targetStats(m *measure, due, today string, target int, period string, ws int) *Stats {
	count := map[string]int{}
	for d, r := range m.records {
		if kept(r) {
			count[PeriodStart(d, period, ws)]++
		}
	}
	now := PeriodStart(today, period, ws)
	from := due
	if today < from {
		from = today
	}
	var past []string
	for p := PeriodStart(firstDay(from, m.records), period, ws); p < now; p = AddDays(PeriodEnd(p, period, ws), 1) {
		past = append(past, p)
	}
	met := func(p string) bool { return count[p] >= target }
	nowMet := count[now] >= target
	best, run := 0, 0
	for _, p := range past {
		if met(p) {
			run++
		} else {
			run = 0
		}
		best = max(best, run)
	}
	current := 0
	for i := len(past) - 1; i >= 0 && met(past[i]); i-- {
		current++
	}
	if nowMet {
		current++
	}
	best = max(best, current)
	f := 1.0 / 7
	if period == "month" {
		f = 12.0 / 365
	}
	a := StrengthAlpha(f)
	s := 0.0
	periods := past
	if nowMet {
		periods = append(append([]string{}, past...), now)
	}
	for _, p := range periods {
		s = s*(1-a) + a*math.Min(float64(count[p])/float64(target), 1)
	}
	n := len(past)
	missed := func(i int) bool { return i >= 0 && !met(past[i]) }
	gap := 0
	for i := n - 2; i >= 0 && missed(i); i-- {
		gap++
	}
	checked := kept(m.records[today])
	left := dayOf(PeriodEnd(today, period, ws)) - dayOf(today)
	if !checked {
		left++
	}
	return &Stats{
		Current: current, Best: best, Pending: !nowMet && !checked, Kept: count[now], KeptOf: target, Strength: round(s),
		AtRisk:      !nowMet && (target-count[now] > left || (n >= 2 && missed(n-1) && missed(n-2))),
		BackOnTrack: n > 0 && met(past[n-1]) && gap >= 2, Period: period, Target: target, Met: nowMet,
	}
}

// targetDayState is a target habit's day: its record; today pending until the
// period is met; any other day of its history up to today a rest day, never
// missed; later days and days before its history blank.
func targetDayState(records map[string]string, first, date, today string, target int, period string, ws int) string {
	if r, has := records[date]; has && r != markOpen {
		return r
	}
	from := min(first, today)
	if date > today || first == "" || date < from {
		return Blank
	}
	if date != today {
		return Rest
	}
	start, n := PeriodStart(today, period, ws), 0
	for d, r := range records {
		if kept(r) && PeriodStart(d, period, ws) == start {
			n++
		}
	}
	if n >= target {
		return Rest
	}
	return Pending
}

func num(t opsync.Entity, f string) float64 {
	var n float64
	if raw, ok := t[f]; ok && !opsync.IsNull(raw) {
		_ = json.Unmarshal(raw, &n)
	}
	return n
}

// ---- logging an amount (habit-targets D2, web habitAmounts.ts) ----

// ErrNoAmount refuses an amount for a habit without one.
var ErrNoAmount = errors.New("the habit has no amount")

// TallyID is the id of a device's tally of a day (web tallyId).
func TallyID(series, date, device string) string {
	return ids.NameID("habit-tally", series+":"+date+":"+device)
}

// WeekStart reads user_prefs.week_start: 0 for "sun", 6 for "sat", else
// Monday (the server cannot know a device's locale for "system").
func WeekStart(prefs opsync.Entity) int {
	switch str(prefs, "week_start") {
	case "sun":
		return 0
	case "sat":
		return 6
	}
	return 1
}

// PlanAmount plans adding add to (or, with exact set, setting) the amount of
// date from device, as the app does: the device's own tally (never below
// zero), and the check-in once the sum reaches the goal, or clearing it when
// the sum falls below. It answers the writes and the day's new sum.
func PlanAmount(id string, row opsync.Entity, tasks, tallies []opsync.Entity, date string, add float64, exact *float64, device string, now int64, today string) ([]Write, float64, error) {
	if !IsOpen(row) {
		return nil, 0, ErrNotAHabit
	}
	goal := Goal(row)
	if goal <= 0 {
		return nil, 0, ErrNoAmount
	}
	if date > today {
		return nil, 0, ErrFuture
	}
	lineage := map[string]bool{}
	for _, p := range opsync.Lineage(id, row, tasks) {
		lineage[p.ID] = true
	}
	piece := PieceFor(id, row, tasks, date)
	tid := TallyID(piece, date, device)
	own, mine := 0.0, false
	for _, x := range tallies {
		if str(x, "id") == tid && !x.Deleted() {
			own, mine = num(x, "count"), true
		}
	}
	others := AmountsOf(lineage, tallies)[date] - max(own, 0)
	next := max(0, own+add)
	if exact != nil {
		next = OwnForExact(others, *exact)
	}
	sum := others + next
	w := Write{Entity: "habit_tally", ID: tid, Patch: map[string]json.RawMessage{"count": opsync.JSONOf(next)}}
	if !mine {
		w.Create = true
		for k, v := range map[string]any{"series_id": piece, "date": date, "device": device, "created_at": now, "deleted_at": nil} {
			w.Patch[k] = opsync.JSONOf(v)
		}
	}
	out := []Write{w}
	done := false
	rid := opsync.OccurrenceID(piece, date)
	for _, t := range tasks {
		if str(t, "id") == rid && !t.Deleted() && !opsync.IsNull(t["completed_at"]) && string(t["skipped"]) != "true" {
			done = true
		}
	}
	state := ""
	switch {
	case sum >= goal && !done:
		state = LogDone
	case sum < goal && done:
		state = LogClear
	}
	if state != "" {
		more, err := PlanLog(id, row, tasks, date, state, "", now, today)
		if err != nil && !errors.Is(err, ErrNotADay) {
			return nil, 0, err
		}
		out = append(out, more...)
	}
	return out, sum, nil
}
