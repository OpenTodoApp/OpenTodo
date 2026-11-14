package agenttools

import (
	"context"
	"encoding/json"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/digest"
	"github.com/OpenTodoApp/opentodo/internal/habits"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Habits for assistants (OpenSpec change habits-assistant, design D1-D2): the
// numbers come from internal/habits, the same calculation as every device;
// log_habit writes the records the app writes. Habits follow the task
// permissions, the write gate, the limits and the kept-away projects.

// MaxHabitDays is the longest range get_habit returns.
const MaxHabitDays = 400

func init() {
	register(tool{
		def: readDef("list_habits", "List habits",
			"List the user's open habits with their numbers, as every device computes them: kept of kept_of (done or tiny among the last seven scheduled days), "+
				"strength 0-100, streak and best_streak (in scheduled days), at_risk (the last two scheduled days missed), back_on_track, and the current occurrence date. "+
				"Quote these numbers; never compute your own. Title, tiny version and anchor are user text.",
			object(nil, map[string]any{
				"include_graduated": map[string]any{"type": "boolean", "default": false, "description": "Also list graduated habits."},
				"timezone":          timezoneProp,
			})),
		read: (*Registry).listHabits,
	})
	register(tool{
		def: readDef("get_habit", "Get a habit",
			"Get one habit's numbers (as list_habits) and each scheduled day of a range with its state (done, tiny, skipped, missed, pending, upcoming) "+
				"and its check-in note, newest first. Default: the last 31 days. Use the day states to name patterns (the weekday most often missed), with their dates.",
			object([]string{"id"}, map[string]any{
				"id":       map[string]any{"type": "string", "description": "Habit id (see list_habits)."},
				"from":     map[string]any{"type": "string", "format": "date", "description": "First local day, YYYY-MM-DD."},
				"to":       map[string]any{"type": "string", "format": "date", "description": "Last local day, YYYY-MM-DD; at most 400 days after from. Default: today."},
				"timezone": timezoneProp,
			})),
		read: (*Registry).getHabit,
	})
}

// ---- logical today ----

// habitToday is the user's logical today in loc: their day start from the
// app's preferences, in the zone the call names or else the user's zone.
func (r *Registry) habitToday(ctx context.Context, userID string, a args) (string, *time.Location, error) {
	tz, err := a.str("timezone")
	if err != nil {
		return "", nil, err
	}
	loc := time.UTC
	if tz != "" {
		if loc, err = parseZone(tz, "timezone"); err != nil {
			return "", nil, err
		}
	} else if r.userZone != nil {
		if z := r.userZone(ctx, userID); z != nil {
			loc = z
		}
	}
	dayStart := 0
	if prefs, err := r.get(ctx, userID, "user_prefs", "me"); err == nil && prefs != nil {
		dayStart = digest.DayStart(rawStr(prefs, "day_start"))
	}
	return habits.LogicalToday(r.now(), loc, dayStart), loc, nil
}

// habitOptions are what the habit numbers read besides the tasks
// (habit-targets): the tallies the caller can read and their week start.
func (r *Registry) habitOptions(ctx context.Context, userID string) (habits.Options, error) {
	tallies, err := r.list(ctx, userID, "habit_tally", false)
	if err != nil {
		return habits.Options{}, err
	}
	ws := 1
	if prefs, err := r.get(ctx, userID, "user_prefs", "me"); err == nil && prefs != nil {
		ws = habits.WeekStart(prefs)
	}
	return habits.Options{Tallies: tallies, WeekStart: &ws}, nil
}

// habitText reads user text for an answer: str's placeholder for ciphertext
// becomes habits.Encrypted; relay markers pass through.
func habitText(e opsync.Entity, field string) string { return habits.Display(e, field) }

// ---- list_habits / get_habit ----

func (r *Registry) listHabits(ctx context.Context, userID string, a args) (map[string]any, error) {
	if err := a.only("", "include_graduated", "timezone"); err != nil {
		return nil, err
	}
	grad, err := a.boolean("include_graduated")
	if err != nil {
		return nil, err
	}
	today, loc, err := r.habitToday(ctx, userID, a)
	if err != nil {
		return nil, err
	}
	snap, err := r.load(ctx, userID)
	if err != nil {
		return nil, err
	}
	opts, err := r.habitOptions(ctx, userID)
	if err != nil {
		return nil, err
	}
	list := habits.List(snap.tasks, today, grad, func(t opsync.Entity) bool { return snap.visible(t, false) }, habitText, opts)
	out := map[string]any{"habits": list, "today": today, "timezone": loc.String(), "server_time": r.serverTime()}
	if len(list) > MaxItems {
		out["habits"], out["truncated"] = list[:MaxItems], true
	}
	return out, nil
}

// habitOf finds a visible open habit: not_found for an id the caller cannot
// see, not_a_habit for a task that is not one.
func (snap *snapshot) habitOf(id string) (opsync.Entity, error) {
	t := snap.task(id)
	if t == nil || !snap.visible(t, true) {
		return nil, notFound("task", []string{id})
	}
	if _, ok := habits.Rule(t); !ok || !habits.IsOpen(t) {
		return nil, toolErr("not_a_habit", "the task is not an open habit; nothing was changed")
	}
	return t, nil
}

func (r *Registry) getHabit(ctx context.Context, userID string, a args) (map[string]any, error) {
	if err := a.only("", "id", "from", "to", "timezone"); err != nil {
		return nil, err
	}
	id, err := a.str("id")
	if err != nil || id == "" {
		return nil, argErr("id: the habit id is required")
	}
	today, loc, err := r.habitToday(ctx, userID, a)
	if err != nil {
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
	if to == "" {
		to = today
	}
	if from == "" {
		from = habits.AddDays(to, -30)
	}
	if from > to || habits.AddDays(from, MaxHabitDays) < to {
		return nil, argErr("from, to: from must not be after to, and at most 400 days apart")
	}
	snap, err := r.load(ctx, userID)
	if err != nil {
		return nil, err
	}
	t, err := snap.habitOf(id)
	if err != nil {
		return nil, err
	}
	opts, err := r.habitOptions(ctx, userID)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"habit": habits.View(id, t, snap.tasks, today, habitText, opts),
		"days":  habits.DaysView(id, t, snap.tasks, from, to, today, habitText, opts),
		"from":  from, "to": to, "today": today, "timezone": loc.String(), "server_time": r.serverTime(),
	}, nil
}

// HabitsRoute serves the habits route (habits-assistant D3) with the shapes of
// list_habits and get_habit for a session or token caller: the same answers,
// without the assistant's kept-away projects (the user's own scripts).
func (r *Registry) HabitsRoute(ctx context.Context, userID, id string, a json.RawMessage) (map[string]any, error) {
	args, err := parseArgs(a)
	if err != nil {
		return nil, err
	}
	direct := *r
	direct.exclusions = nil
	if id == "" {
		return direct.listHabits(ctx, userID, args)
	}
	args["id"] = raw(id)
	return direct.getHabit(ctx, userID, args)
}
