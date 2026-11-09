package agenttools

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/freetime"
	"github.com/OpenTodoApp/opentodo/internal/zoned"
)

// ---- find_free_time (OpenSpec change assistant-time-blocks, design D1) ----
//
// The free stretches of each day within the working day, after the user's
// calendar events, frames, slots and timed tasks, as internal/freetime
// computes them (the same as the calendar and the assistant's free time
// block). Only times are read, so it answers for an encrypted account too.

// Free time defaults: the calendar's default grid hours and a half hour.
const (
	DefaultDayStartHour = 6
	DefaultDayEndHour   = 22
	DefaultFreeMinutes  = 30
	MaxFreeMinutes      = 12 * 60
)

// EventSource reads the user's calendar events touching the days from..to
// (the calendar's subscribed and connected calendars, while they are on).
type EventSource func(ctx context.Context, userID, from, to string) ([]freetime.Event, error)

func init() {
	register(tool{
		def: readDef("find_free_time", "Find free time",
			"Find the user's free time: for each day from..to, the stretches of at least min_minutes within the working day that no calendar event, "+
				"calendar frame, slot or timed task takes (a timed task takes its estimate, else 30 minutes), as the user's calendar draws them. "+
				"Times are wall times in timezone; today starts now. Default: today only; at most 14 days. Read-only: to place a task in a free stretch, propose a due date and time.",
			object(nil, map[string]any{
				"from":           map[string]any{"type": "string", "format": "date", "description": "First day (YYYY-MM-DD). Default: today in timezone."},
				"to":             map[string]any{"type": "string", "format": "date", "description": "Last day (YYYY-MM-DD), at most 13 days after from. Default: from."},
				"min_minutes":    map[string]any{"type": "integer", "minimum": 1, "maximum": MaxFreeMinutes, "description": "Shortest stretch to list, in minutes. Default: 30."},
				"day_start_hour": map[string]any{"type": "integer", "minimum": 0, "maximum": 23, "description": "Hour the working day starts. Default: 6, or the user's own working day in the app."},
				"day_end_hour":   map[string]any{"type": "integer", "minimum": 1, "maximum": 24, "description": "Hour the working day ends, after day_start_hour. Default: 22, or the user's own working day in the app."},
				"timezone":       timezoneProp,
			})),
		read: (*Registry).findFreeTime,
	})
}

// hour reads an optional whole hour in [lo, hi].
func (a args) hour(name string, def, lo, hi int) (int, error) {
	n, ok, err := a.integer(name)
	if err != nil || !ok {
		return def, err
	}
	if n < lo || n > hi {
		return 0, argErr(fmt.Sprintf("%s: must be from %d to %d", name, lo, hi))
	}
	return n, nil
}

func (r *Registry) findFreeTime(ctx context.Context, userID string, a args) (map[string]any, error) {
	if err := a.only("", "from", "to", "min_minutes", "day_start_hour", "day_end_hour", "timezone"); err != nil {
		return nil, err
	}
	from, err := a.date("from")
	if err != nil {
		return nil, err
	}
	to, err := a.date("to")
	if err != nil {
		return nil, err
	}
	loc, err := a.location()
	if err != nil {
		return nil, err
	}
	least, err := a.hour("min_minutes", DefaultFreeMinutes, 1, MaxFreeMinutes)
	if err != nil {
		return nil, err
	}
	startH, err := a.hour("day_start_hour", DefaultDayStartHour, 0, 23)
	if err != nil {
		return nil, err
	}
	endH, err := a.hour("day_end_hour", DefaultDayEndHour, 1, 24)
	if err != nil {
		return nil, err
	}
	if endH <= startH {
		return nil, argErr("day_end_hour: must be after day_start_hour")
	}
	now := r.now().In(loc)
	today := now.Format(time.DateOnly)
	if from == "" {
		from = today
	}
	first, _ := time.Parse(time.DateOnly, from)
	if to == "" {
		to = from
	}
	last, _ := time.Parse(time.DateOnly, to)
	if last.Before(first) {
		return nil, argErr("to: must not be before from")
	}
	if last.After(first.AddDate(0, 0, freetime.MaxDays-1)) {
		return nil, argErr(fmt.Sprintf("to: at most %d days from from (the %d-day limit)", freetime.MaxDays, freetime.MaxDays))
	}
	in := freetime.Input{From: from, To: to, Zone: loc.String(), DayStart: startH * 60, DayEnd: endH * 60, MinMinutes: least,
		Today: today, Now: now.Hour()*60 + now.Minute()}
	if err := r.freeTimeSources(ctx, userID, &in); err != nil {
		return nil, err
	}
	days, err := freetime.Compute(in)
	if err != nil {
		return nil, err
	}
	type dayOut struct {
		freetime.Day
		FreeMinutes int `json:"free_minutes"`
	}
	out := make([]dayOut, len(days))
	for i, d := range days {
		out[i] = dayOut{Day: d}
		for _, f := range d.Free {
			out[i].FreeMinutes += f.Minutes
		}
	}
	return map[string]any{"days": out, "from": from, "to": to, "min_minutes": least,
		"working_day": map[string]string{"start": freetime.Clock(startH * 60), "end": freetime.Clock(endH * 60)},
		"timezone":    loc.String(), "server_time": r.serverTime()}, nil
}

// freeTimeSources reads what takes time: events, frames, slots and the open
// timed tasks the user can see (not in a project kept away from assistants).
func (r *Registry) freeTimeSources(ctx context.Context, userID string, in *freetime.Input) error {
	if r.events != nil {
		evs, err := r.events(ctx, userID, in.From, in.To)
		if err != nil {
			return err
		}
		in.Events = evs
	}
	frameRows, err := r.list(ctx, userID, "frame", false)
	if err != nil {
		return err
	}
	for _, e := range frameRows {
		in.Frames = append(in.Frames, frameOf(e))
	}
	slotRows, err := r.list(ctx, userID, "slot", false)
	if err != nil {
		return err
	}
	for _, e := range slotRows {
		s := freetime.Slot{Date: rawStr(e, "date"), Start: rawStr(e, "start")}
		_ = json.Unmarshal(e["minutes"], &s.Minutes)
		in.Slots = append(in.Slots, s)
	}
	snap, err := r.load(ctx, userID)
	if err != nil {
		return err
	}
	for _, t := range snap.tasks {
		if !isOpen(t) || !snap.visible(t, true) {
			continue
		}
		d := zoned.DecodeDue(t["due"])
		if d == nil || d.Time == nil {
			continue
		}
		w := freetime.When{Date: d.Date, Time: *d.Time}
		if d.TZ != nil {
			w.TZ = *d.TZ
		}
		ft := freetime.Task{Due: &w}
		_ = json.Unmarshal(t["estimate_minutes"], &ft.Estimate)
		in.Tasks = append(in.Tasks, ft)
	}
	return nil
}
