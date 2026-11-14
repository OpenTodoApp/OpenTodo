package agenttools

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/OpenTodoApp/opentodo/internal/habits"
	"github.com/OpenTodoApp/opentodo/internal/recurrence"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// log_habit and the habit fields of create_tasks and update_tasks (OpenSpec
// change habits-assistant, design D2): the records the app writes.

func init() {
	register(tool{def: func(Caller) Definition {
		return writeDef("log_habit", "Log a habit",
			"Log a habit for a day as the app does: done, tiny (the tiny version, which counts as done), skipped (keeps the streak) or clear (the day reads as missed). "+
				"Today, or the habit's current occurrence, completes or skips it and moves it to its next date; an earlier scheduled day only gets its record. "+
				"A day after today is refused. note is that day's check-in note. "+
				"For an amount habit (amount in list_habits, such as 8 glasses), give amount to add to the day or set_amount for the day's exact amount instead of state: the day is done once it reaches the habit's amount.",
			object([]string{"id"}, map[string]any{
				"id":         map[string]any{"type": "string", "description": "Habit id (see list_habits)."},
				"date":       map[string]any{"type": "string", "format": "date", "description": "Local day, YYYY-MM-DD. Default: today in timezone."},
				"state":      map[string]any{"type": "string", "enum": []string{habits.LogDone, habits.LogTiny, habits.LogSkipped, habits.LogClear}, "description": "Required unless amount or set_amount is given."},
				"amount":     map[string]any{"type": "number", "exclusiveMinimum": 0, "description": "An amount habit only: how much to add to the day (1 glass)."},
				"set_amount": map[string]any{"type": "number", "minimum": 0, "description": "An amount habit only: the day's exact amount."},
				"note":       map[string]any{"type": "string", "maxLength": 2000, "description": "The day's check-in note (Markdown)."},
				"timezone":   timezoneProp,
			}), false, true, []string{"note"}, false)
	}, plan: (*Registry).planLogHabit})
}

// ---- habit fields in create_tasks and update_tasks ----

// habitProps are the schema properties of a habit's fields.
func habitProps(props map[string]any) map[string]any {
	props["habit"] = map[string]any{"type": "boolean", "description": "true tracks the task as a habit: needs a calendar recurrence (not after completion); a task without a due date gets its first date."}
	props["habit_tiny"] = map[string]any{"type": "string", "maxLength": 200, "description": "The habit's tiny version, the smallest form that still counts (\"One page\")."}
	props["habit_anchor"] = map[string]any{"type": "string", "maxLength": 200, "description": "The moment the habit follows (\"After dinner\")."}
	props["habit_target"] = map[string]any{"type": "integer", "minimum": 0, "maximum": 31, "description": "A target habit: check-ins per habit_period (\"3 times a week\"), any day; the recurrence becomes every day. 0 removes the target."}
	props["habit_period"] = map[string]any{"type": "string", "enum": []string{"week", "month"}, "description": "The period of habit_target."}
	props["habit_amount"] = map[string]any{"type": "number", "minimum": 0, "description": "An amount habit: the day's amount (8 for 8 glasses); 0 removes it."}
	props["habit_unit"] = map[string]any{"type": "string", "maxLength": 40, "description": "The unit of habit_amount (\"glasses\")."}
	props["habit_step"] = map[string]any{"type": "number", "exclusiveMinimum": 0, "description": "What one check-in adds to an amount habit's day. Default 1."}
	return props
}

// targetPatch reads a habit's target and amount fields (habit-targets D1, D2)
// into patch; a target sets the recurrence to every day.
func targetPatch(p string, it args, c Caller, patch map[string]json.RawMessage) error {
	if v, has, err := it.contentText(c, "habit_unit", false, 40); err != nil {
		return argErr(p + err.Error())
	} else if has {
		patch["habit_unit"] = raw(v)
	}
	num := func(name string) (float64, bool, error) {
		v, ok := it[name]
		if !ok {
			return 0, false, nil
		}
		var n float64
		if json.Unmarshal(v, &n) != nil || n < 0 {
			return 0, false, argErr(p + name + ": must be a number of at least 0")
		}
		return n, true, nil
	}
	if n, has, err := num("habit_amount"); err != nil {
		return err
	} else if has {
		patch["habit_amount"] = raw(n)
	}
	if n, has, err := num("habit_step"); err != nil {
		return err
	} else if has {
		if n == 0 {
			return argErr(p + "habit_step: must be more than 0")
		}
		patch["habit_step"] = raw(n)
	}
	n, has, err := num("habit_target")
	if err != nil {
		return err
	}
	period, err := it.str("habit_period")
	if err != nil || (period != "" && period != "week" && period != "month") {
		return argErr(p + "habit_period: must be week or month")
	}
	if !has {
		if period != "" {
			patch["habit_period"] = raw(period)
		}
		return nil
	}
	if n != float64(int(n)) || n > 31 {
		return argErr(p + "habit_target: must be a whole number from 0 to 31")
	}
	patch["habit_target"] = raw(int(n))
	if n == 0 {
		patch["habit_period"] = raw("")
		return nil
	}
	if period == "" {
		return argErr(p + "habit_period: is required with habit_target (week or month)")
	}
	patch["habit_period"], patch["recurrence"] = raw(period), raw("every day")
	return nil
}

// habitPatch reads an item's habit fields into patch. current is the task's
// row (nil for a new task); today decides a new habit's first date.
func habitPatch(p string, it args, c Caller, patch map[string]json.RawMessage, current opsync.Entity, today string) error {
	if err := targetPatch(p, it, c, patch); err != nil {
		return err
	}
	for _, f := range []string{"habit_tiny", "habit_anchor"} {
		if v, has, err := it.contentText(c, f, false, 200); err != nil {
			return argErr(p + err.Error())
		} else if has {
			patch[f] = raw(v)
		}
	}
	v, ok := it["habit"]
	if !ok {
		return nil
	}
	var on bool
	if json.Unmarshal(v, &on) != nil {
		return argErr(p + "habit: must be true or false")
	}
	patch["habit"] = raw(on)
	if !on {
		return nil
	}
	rule := ""
	if current != nil {
		rule = rawStr(current, "recurrence")
	}
	if r, planned := patch["recurrence"]; planned {
		rule = ""
		_ = json.Unmarshal(r, &rule)
	}
	parsed, err := recurrence.Parse(rule)
	if rule == "" || err != nil || parsed.AfterCompletion() {
		return argErr(p + "habit: needs a calendar recurrence such as \"every day\" or \"every mon, wed, fri\" (not after completion)")
	}
	if taskDue(current) == nil && opsync.IsNull(patch["due"]) {
		first, err := parsed.First(today)
		if err != nil {
			return argErr(p + "recurrence: " + err.Error())
		}
		patch["due"] = raw(map[string]string{"date": first})
	}
	return nil
}

// ---- log_habit ----

func (r *Registry) planLogHabit(ctx context.Context, c Caller, a args, overlay ChangeSet) (Plan, error) {
	if err := a.only("", "id", "date", "state", "note", "timezone", "amount", "set_amount"); err != nil {
		return Plan{}, err
	}
	id, err := a.str("id")
	if err != nil || id == "" {
		return Plan{}, argErr("id: the habit id is required")
	}
	amount, err := a.amountArgs()
	if err != nil {
		return Plan{}, err
	}
	state, err := a.str("state")
	if err != nil {
		return Plan{}, err
	}
	switch {
	case amount != nil && state != "":
		return Plan{}, argErr("state: give state, amount or set_amount, not more than one")
	case amount != nil:
	case state == habits.LogDone, state == habits.LogTiny, state == habits.LogSkipped, state == habits.LogClear:
	default:
		return Plan{}, argErr("state: must be done, tiny, skipped or clear (or give amount or set_amount)")
	}
	note, _, err := a.contentText(c, "note", false, 2000)
	if err != nil {
		return Plan{}, err
	}
	today, _, err := r.habitToday(ctx, c.UserID, a)
	if err != nil {
		return Plan{}, err
	}
	date, err := a.date("date")
	if err != nil {
		return Plan{}, err
	}
	if date == "" {
		date = today
	}
	snap, err := r.loadFor(ctx, c, overlay)
	if err != nil {
		return Plan{}, err
	}
	t, err := snap.habitOf(id)
	if err != nil {
		return Plan{}, err
	}
	if err := snap.checkTaskRoles([]opsync.Entity{t}, "completed_at"); err != nil {
		return Plan{}, err
	}
	if amount != nil {
		return r.planLogAmount(ctx, c, snap, id, t, date, today, *amount)
	}
	writes, err := habits.PlanLog(id, t, snap.tasks, date, state, note, stamp(), today)
	switch {
	case errors.Is(err, habits.ErrFuture):
		return Plan{}, toolErr("invalid_input", "date: a day after today cannot be logged; nothing was changed")
	case errors.Is(err, habits.ErrNotADay):
		return Plan{}, toolErr("invalid_input", "date: not a scheduled day of the habit from its first one to today; nothing was changed")
	case errors.Is(err, habits.ErrNotAHabit):
		return Plan{}, toolErr("not_a_habit", "the task is not an open habit; nothing was changed")
	case err != nil:
		return Plan{}, err
	}
	var cs ChangeSet
	for _, w := range writes {
		ch := Change{Entity: "task", EntityID: w.ID, Create: w.Create, Patch: w.Patch}
		if cur := snap.task(w.ID); cur != nil && !w.Create {
			ch.Base = base(cur, w.Patch)
		}
		cs = append(cs, ch)
	}
	status := "logged"
	if len(cs) == 0 {
		status = "unchanged"
	}
	item := map[string]any{"id": id, "date": date, "state": state, "status": status}
	n := min(len(cs), 1)
	return Plan{Result: result("log_habit", []map[string]any{item}, n), Changes: cs, Count: n}, nil
}

// amountArg is log_habit's amount (added) or set_amount (exact).
type amountArg struct {
	add   float64
	exact *float64
}

// amountArgs reads amount and set_amount; nil when neither is given.
func (a args) amountArgs() (*amountArg, error) {
	read := func(name string) (float64, bool, error) {
		v, ok := a[name]
		if !ok {
			return 0, false, nil
		}
		var n float64
		if json.Unmarshal(v, &n) != nil || n < 0 || (name == "amount" && n == 0) {
			return 0, false, argErr(name + ": must be a positive number")
		}
		return n, true, nil
	}
	add, hasAdd, err := read("amount")
	if err != nil {
		return nil, err
	}
	exact, hasExact, err := read("set_amount")
	if err != nil {
		return nil, err
	}
	switch {
	case hasAdd && hasExact:
		return nil, argErr("amount: give amount or set_amount, not both")
	case hasAdd:
		return &amountArg{add: add}, nil
	case hasExact:
		return &amountArg{exact: &exact}, nil
	}
	return nil, nil
}

// planLogAmount plans an amount for the day (habit-targets D2, D4): the
// caller's own tally (its token, else "server") and the check-in it brings.
func (r *Registry) planLogAmount(ctx context.Context, c Caller, snap *snapshot, id string, t opsync.Entity, date, today string, a amountArg) (Plan, error) {
	tallies, err := r.list(ctx, c.UserID, "habit_tally", false)
	if err != nil {
		return Plan{}, err
	}
	device := "server"
	if c.TokenID != "" {
		device = "token:" + c.TokenID
	}
	writes, sum, err := habits.PlanAmount(id, t, snap.tasks, tallies, date, a.add, a.exact, device, stamp(), today)
	switch {
	case errors.Is(err, habits.ErrNoAmount):
		return Plan{}, toolErr("invalid_input", "amount: the habit has no amount (only a habit with an amount, such as 8 glasses, takes one); nothing was changed")
	case errors.Is(err, habits.ErrFuture):
		return Plan{}, toolErr("invalid_input", "date: a day after today cannot be logged; nothing was changed")
	case errors.Is(err, habits.ErrNotAHabit):
		return Plan{}, toolErr("not_a_habit", "the task is not an open habit; nothing was changed")
	case err != nil:
		return Plan{}, err
	}
	byID := map[string]opsync.Entity{}
	for _, x := range tallies {
		byID[rawStr(x, "id")] = x
	}
	var cs ChangeSet
	for _, w := range writes {
		ch := Change{Entity: "task", EntityID: w.ID, Create: w.Create, Patch: w.Patch}
		cur := snap.task(w.ID)
		if w.Entity != "" {
			ch.Entity, cur = w.Entity, byID[w.ID]
		}
		if cur != nil && !w.Create {
			ch.Base = base(cur, w.Patch)
		}
		cs = append(cs, ch)
	}
	item := map[string]any{"id": id, "date": date, "amount": sum, "status": "logged"}
	return Plan{Result: result("log_habit", []map[string]any{item}, 1), Changes: cs, Count: 1}, nil
}

// PlanHabitLog plans the habits route's log (habits-assistant D3) for a
// session or token caller, as log_habit plans it, without the assistant's
// kept-away projects: the caller applies the changes through the op log.
func (r *Registry) PlanHabitLog(ctx context.Context, userID, tokenID string, encrypted bool, id string, body json.RawMessage) (ChangeSet, error) {
	a, err := parseArgs(body)
	if err != nil {
		return nil, err
	}
	a["id"] = raw(id)
	// The registry's content gate (Plan): a note is ciphertext only here.
	if encrypted && a.plainContent("note") {
		return nil, encryptionErr()
	}
	direct := *r
	direct.exclusions = nil
	p, err := direct.planLogHabit(ctx, Caller{UserID: userID, TokenID: tokenID, Scope: "full", Encrypted: encrypted}, a, nil)
	return p.Changes, err
}

// firstErr is the first non-nil error.
func firstErr(errs ...error) error {
	for _, err := range errs {
		if err != nil {
			return err
		}
	}
	return nil
}
