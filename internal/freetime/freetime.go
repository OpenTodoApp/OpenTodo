// Package freetime computes a person's free time (OpenSpec change
// assistant-time-blocks, design D1): the parts of each day's working hours that
// no calendar event, frame, slot or timed task takes, as the calendar draws
// them. The registry's find_free_time, the on-device assistant's twin and the
// assistant's free time block all use it; web/src/lib/freeTime.ts computes the
// same, pinned by the shared vectors web/src/lib/freeTime.vectors.json.
//
// Only times are read, never titles, so it works the same for an end-to-end
// encrypted account.
package freetime

import (
	"fmt"
	"sort"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/frames"
	"github.com/OpenTodoApp/opentodo/internal/zoned"
)

// Limits of a computation.
const (
	// MaxDays is the most days one call computes (find_free_time's limit).
	MaxDays = 14
	// DayMinutes is one day.
	DayMinutes = 24 * 60
	// TaskMinutes is the length of a timed task without an estimate, as the
	// calendar draws it (web/src/lib/calendar.ts DEFAULT_BLOCK_MINUTES).
	TaskMinutes = 30
	// Step rounds the start of today's free time up from the current minute
	// (the calendar's slot, SLOT_MINUTES).
	Step = 15
)

// When is one end of a calendar event, or a task's due: a date, an optional
// wall time and an optional zone (a floating time without one).
type When struct {
	Date string `json:"date"`
	Time string `json:"time,omitempty"`
	TZ   string `json:"tz,omitempty"`
}

// Event is a subscribed calendar's event (calfeed.EventRow without its text).
type Event struct {
	Start  When `json:"start"`
	End    When `json:"end"`
	AllDay bool `json:"allDay"`
	Free   bool `json:"free"`
}

// Slot is a calendar slot: a block on one day from start for minutes.
type Slot struct {
	Date    string `json:"date"`
	Start   string `json:"start"`
	Minutes int    `json:"minutes"`
}

// Task is the part of a task its calendar block depends on.
type Task struct {
	Due      *When `json:"due"`
	Estimate *int  `json:"estimate_minutes"`
	Done     bool  `json:"done"`
}

// Input is one computation: the days from..to in zone, the working day
// [DayStart, DayEnd) in minutes, the shortest free stretch worth naming and
// what takes time. Today, when set, is the zone's current date and Now its
// minute: earlier days have no free time left, and today's starts at Now
// rounded up to Step.
type Input struct {
	From       string         `json:"from"`
	To         string         `json:"to"`
	Zone       string         `json:"zone"`
	DayStart   int            `json:"day_start"`
	DayEnd     int            `json:"day_end"`
	MinMinutes int            `json:"min_minutes"`
	Today      string         `json:"today,omitempty"`
	Now        int            `json:"now,omitempty"`
	Events     []Event        `json:"events"`
	Frames     []frames.Frame `json:"frames"`
	Slots      []Slot         `json:"slots"`
	Tasks      []Task         `json:"tasks"`
}

// Free is one free stretch, in wall times of the zone ("24:00" ends a day).
type Free struct {
	Start   string `json:"start"`
	End     string `json:"end"`
	Minutes int    `json:"minutes"`
}

// Day is one day's free stretches in order.
type Day struct {
	Date string `json:"date"`
	Free []Free `json:"free"`
}

type span struct{ start, end int }

// point is a wall date and minute in the viewer's zone.
type point struct {
	date string
	min  int
}

// Clock is "HH:MM" of minutes after midnight, "24:00" for the end of a day.
func Clock(m int) string { return fmt.Sprintf("%02d:%02d", m/60, m%60) }

// wall reads a timed point in the viewer's zone: a zoned one is converted, a
// floating one is wall time already. ok is false without a time.
func wall(w When, viewer *time.Location) (point, bool) {
	date, clock := w.Date, w.Time
	if clock == "" {
		return point{}, false
	}
	if w.TZ != "" {
		if loc, err := zoned.Load(w.TZ); err == nil {
			if t, err := zoned.Instant(w.Date, w.Time, loc); err == nil {
				date, clock = zoned.Local(t, viewer)
			}
		}
	}
	m := frames.Clock(clock)
	if m < 0 {
		return point{}, false
	}
	return point{date, m}, true
}

// busyOn lists what takes time on date, unsorted (eventBlocks, blockFor and
// the slots and frames as the grid draws them).
func busyOn(in Input, date string, viewer *time.Location, occ map[string][]span) []span {
	var out []span
	add := func(s, e int) {
		if e > DayMinutes {
			e = DayMinutes
		}
		if e > s {
			out = append(out, span{s, e})
		}
	}
	for _, ev := range in.Events {
		if ev.AllDay || ev.Free {
			continue
		}
		start, ok := wall(ev.Start, viewer)
		if !ok {
			continue
		}
		end, ok := wall(ev.End, viewer)
		if !ok {
			end = start
		}
		if start.date > date || end.date < date {
			continue
		}
		s, e := start.min, end.min
		if start.date < date {
			s = 0
		}
		if end.date > date {
			e = DayMinutes
		}
		add(s, e)
	}
	for _, t := range in.Tasks {
		if t.Done || t.Due == nil {
			continue
		}
		at, ok := wall(*t.Due, viewer)
		if !ok || at.date != date {
			continue
		}
		length := TaskMinutes
		if t.Estimate != nil && *t.Estimate > 0 {
			length = *t.Estimate
		}
		add(at.min, at.min+length)
	}
	for _, sl := range in.Slots {
		if sl.Date != date || sl.Minutes <= 0 {
			continue
		}
		if s := frames.Clock(sl.Start); s >= 0 {
			add(s, s+sl.Minutes)
		}
	}
	out = append(out, occ[date]...)
	return out
}

// Compute returns each day of from..to with its free stretches of at least
// MinMinutes (at least 1) within the working day. A range that is not two
// dates in order, or longer than MaxDays, is an error.
func Compute(in Input) ([]Day, error) {
	first, err1 := time.Parse(time.DateOnly, in.From)
	last, err2 := time.Parse(time.DateOnly, in.To)
	if err1 != nil || err2 != nil || last.Before(first) {
		return nil, fmt.Errorf("freetime: from and to must be dates in order")
	}
	if last.After(first.AddDate(0, 0, MaxDays-1)) {
		return nil, fmt.Errorf("freetime: at most %d days", MaxDays)
	}
	viewer := time.UTC
	if in.Zone != "" {
		if loc, err := zoned.Load(in.Zone); err == nil {
			viewer = loc
		}
	}
	occ := map[string][]span{}
	for _, o := range frames.Occurrences(in.Frames, in.From, in.To) {
		occ[o.Date] = append(occ[o.Date], span{frames.Clock(o.Start), frames.Clock(o.End)})
	}
	least := max(1, in.MinMinutes)
	out := []Day{}
	for d := first; !d.After(last); d = d.AddDate(0, 0, 1) {
		date := d.Format(time.DateOnly)
		day := Day{Date: date, Free: []Free{}}
		from, to := max(0, in.DayStart), min(DayMinutes, in.DayEnd)
		if in.Today != "" {
			if date < in.Today {
				from = to
			} else if date == in.Today {
				from = max(from, (in.Now+Step-1)/Step*Step)
			}
		}
		busy := busyOn(in, date, viewer, occ)
		sort.Slice(busy, func(i, j int) bool { return busy[i].start < busy[j].start })
		cur := from
		emit := func(end int) {
			if end-cur >= least {
				day.Free = append(day.Free, Free{Start: Clock(cur), End: Clock(end), Minutes: end - cur})
			}
		}
		for _, b := range busy {
			if cur >= to {
				break
			}
			if b.start > cur {
				emit(min(b.start, to))
			}
			cur = max(cur, b.end)
		}
		if cur < to {
			emit(to)
		}
		out = append(out, day)
	}
	return out, nil
}
