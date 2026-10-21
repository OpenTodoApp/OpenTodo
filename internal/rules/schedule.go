package rules

import (
	"context"
	"slices"
	"time"

	"github.com/pixari/opentodo/internal/ruleval"
)

// TickInterval is the scheduler's pace (design D5).
const TickInterval = time.Minute

// Tick finds the time-trigger occurrences in each enabled time rule's window
// (watermark, now] and queues one event per occurrence, then moves the
// watermark to now (spec "Time triggers"). A rule seen for the first time
// starts at now, so it never fires for the past.
func (e *Engine) Tick(ctx context.Context) {
	if !e.on(ctx) {
		return
	}
	users, err := e.users(ctx)
	if err != nil {
		e.Log.Error("rules: list users", "err", err)
		return
	}
	var queued bool
	for _, uid := range users {
		k := e.ruleKinds(ctx, uid)
		if !k[ruleval.Schedule] && !k[ruleval.DueReached] && !k[ruleval.Overdue] {
			continue
		}
		if paused, err := e.Store.UserPaused(ctx, uid); err != nil || paused {
			continue
		}
		n, err := e.tickUser(ctx, uid)
		if err != nil {
			e.Log.Error("rules: schedule", "err", err)
		}
		queued = queued || n > 0
	}
	if queued {
		select {
		case e.wake <- struct{}{}:
		default:
		}
	}
}

func (e *Engine) users(ctx context.Context) ([]string, error) {
	rows, err := e.db.QueryContext(ctx, `SELECT id FROM users`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// tickUser queues one user's time-trigger occurrences.
func (e *Engine) tickUser(ctx context.Context, uid string) (int, error) {
	list, err := e.loadRules(ctx, uid)
	if err != nil {
		return 0, err
	}
	now := e.now().UnixMilli()
	var w *world
	var events []Event
	for i := range list {
		r := &list[i]
		if !r.Enabled || !ruleval.IsTimeTrigger(r.Trigger.Kind) {
			continue
		}
		st, found, err := e.Store.State(ctx, r.ID)
		if err != nil {
			return 0, err
		}
		if st.PausedReason != "" {
			continue
		}
		if found && st.Watermark > 0 && st.Watermark < now {
			if w == nil {
				if w, err = e.load(ctx, uid); err != nil {
					return 0, err
				}
			}
			events = append(events, Occurrences(r.ID, r.Trigger, w, st.Watermark, now)...)
		}
		st.Watermark = now
		if err := e.Store.SaveState(ctx, r.ID, uid, st); err != nil {
			return 0, err
		}
	}
	for i := range events {
		events[i].UserID, events[i].Depth = uid, 1
	}
	return len(events), e.Store.Enqueue(ctx, events)
}

// Occurrences lists a time rule's occurrences in (from, to] (Unix ms). A
// schedule fires once for the latest time in the window, however many were
// missed; a due or overdue trigger once per task and instant.
func Occurrences(ruleID string, tr ruleval.Trigger, w *world, from, to int64) []Event {
	zone := time.FixedZone("", w.offset*60)
	switch tr.Kind {
	case ruleval.Schedule:
		at, ok := lastScheduled(tr, zone, from, to)
		if !ok {
			return nil
		}
		return []Event{{RuleID: ruleID, Kind: ruleval.Schedule, Occurrence: "sched:" + at.Format("2006-01-02T15:04")}}
	case ruleval.DueReached, ruleval.Overdue:
		var out []Event
		ids := make([]string, 0, len(w.tasks))
		for id := range w.tasks {
			ids = append(ids, id)
		}
		slices.Sort(ids)
		for _, id := range ids {
			t := w.tasks[id]
			if !w.open(id) {
				continue
			}
			d := dueOf(t["due"])
			if d == nil {
				continue
			}
			at, key := dueInstant(d, zone), "due:"+id+":"
			if tr.Kind == ruleval.Overdue {
				date := d.Date
				if d.TZ != nil && d.Time != nil {
					date = zonedDate(d, w.offset)
				}
				day, _ := time.ParseInLocation("2006-01-02", ruleval.AddDays(date, 1), zone)
				at, key = day.Add(time.Duration(ruleval.DayStartMinutes(w.dayStart))*time.Minute), "overdue:"+id+":"+date
			} else {
				key += at.UTC().Format("2006-01-02T15:04Z")
			}
			if ms := at.UnixMilli(); ms > from && ms <= to {
				out = append(out, Event{RuleID: ruleID, TaskID: id, Kind: tr.Kind, Occurrence: key})
			}
		}
		return out
	}
	return nil
}

// dueInstant is when a due is reached: a zoned due at its instant, a floating
// one at its time in the user's zone, 09:00 for a date only (the reminders' rule).
func dueInstant(d *dueValue, zone *time.Location) time.Time {
	clock := "09:00"
	if d.Time != nil {
		clock = *d.Time
	}
	loc := zone
	if d.TZ != nil && d.Time != nil {
		if l, err := time.LoadLocation(*d.TZ); err == nil {
			loc = l
		}
	}
	at, err := time.ParseInLocation("2006-01-02 15:04", d.Date+" "+clock, loc)
	if err != nil {
		return time.Time{}
	}
	return at
}

// lastScheduled is the latest scheduled minute in (from, to], looking back at
// most eight days.
func lastScheduled(tr ruleval.Trigger, zone *time.Location, from, to int64) (time.Time, bool) {
	end := time.UnixMilli(to).In(zone)
	for i := 0; i <= 8; i++ {
		day := end.AddDate(0, 0, -i)
		wd := int(day.Weekday())
		if wd == 0 {
			wd = 7
		}
		if !slices.Contains(tr.Weekdays, wd) {
			continue
		}
		at, err := time.ParseInLocation("2006-01-02 15:04", day.Format("2006-01-02")+" "+tr.At, zone)
		if err != nil {
			return time.Time{}, false
		}
		ms := at.UnixMilli()
		if ms > to {
			continue
		}
		return at, ms > from
	}
	return time.Time{}, false
}

// NextDue tells a host's shared scheduler when the engine next has work: now
// while events wait, the next minute while any rule keeps a watermark or a rule
// changed since the last tick (design D5).
func (e *Engine) NextDue(ctx context.Context) (time.Time, bool, error) {
	if !e.on(ctx) {
		return time.Time{}, false, nil
	}
	n, err := e.Store.Pending(ctx)
	if err != nil {
		return time.Time{}, false, err
	}
	now := e.now()
	if n > 0 {
		return now, true, nil
	}
	var timed int
	if err := e.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM rule_state WHERE paused_reason = '' AND watermark_ms > 0`).Scan(&timed); err != nil {
		return time.Time{}, false, err
	}
	e.mu.Lock()
	changed := e.changed
	e.mu.Unlock()
	if timed == 0 && !changed {
		return time.Time{}, false, nil
	}
	return now.Truncate(TickInterval).Add(TickInterval), true, nil
}

// RunOnce is one pass for a host's shared scheduler: the time triggers, then
// the queue.
func (e *Engine) RunOnce(ctx context.Context) {
	e.mu.Lock()
	e.changed = false
	e.mu.Unlock()
	e.Tick(ctx)
	e.Drain(ctx)
}
