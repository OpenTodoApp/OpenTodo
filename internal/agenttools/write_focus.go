package agenttools

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/OpenTodoApp/opentodo/internal/closedlist"
	"github.com/OpenTodoApp/opentodo/internal/ruleval"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// set_today_focus (OpenSpec change mcp-set-today-focus, issue #1896): today's
// focus on the user's own review row, by the Daily check's rule for a whole
// list (ruleval.PlanSetFocus, the routine step's rule and focusSet.ts's).
// Personal only: it is not a reach tool, so a workspace-limited token gets
// token_restricted.

func init() {
	register(tool{def: func(Caller) Definition {
		return writeDef("set_today_focus", "Set today's focus",
			"Set the user's focus for today (the Daily check's Three tasks, or Bento's Large, Medium and Small slots) to up to 3 open tasks, in order; [] clears it. "+
				"It replaces today's focus as a whole. Bento places tasks by estimate, then in the first free slot. Completed tasks are left out; returns the ids placed.",
			object([]string{"ids"}, map[string]any{
				"ids": map[string]any{"type": "array", "minItems": 0, "maxItems": ruleval.FocusMax, "items": map[string]any{"type": "string"},
					"description": "Task ids (see today_summary or list_tasks), at most 3, most important first; [] clears today's focus."},
				"timezone": map[string]any{"type": "string", "description": "IANA time zone that decides which day is today. Default: the account's time zone."},
			}), false, true, nil, false)
	}, plan: (*Registry).planSetTodayFocus})
}

func (r *Registry) planSetTodayFocus(ctx context.Context, c Caller, a args, overlay ChangeSet) (Plan, error) {
	if err := a.only("", "ids", "timezone"); err != nil {
		return Plan{}, err
	}
	if !a.present("ids") {
		return Plan{}, argErr("ids: is required ([] clears today's focus)")
	}
	var list []string
	if json.Unmarshal(a["ids"], &list) != nil || list == nil {
		return Plan{}, argErr("ids: must be an array of strings")
	}
	var ids []string
	seen := map[string]bool{}
	for _, id := range list {
		id = strings.TrimSpace(id)
		if id == "" || len(id) > opsync.MaxIDLen {
			return Plan{}, argErr("ids: ids must be non-empty strings")
		}
		if !seen[id] {
			seen[id] = true
			ids = append(ids, id)
		}
	}
	// Repeats count once, as in the Daily check.
	if len(ids) > ruleval.FocusMax {
		return Plan{}, argErr("ids: today's focus holds at most 3 tasks; nothing was changed")
	}
	today, _, err := r.habitToday(ctx, c.UserID, a)
	if err != nil {
		return Plan{}, err
	}
	snap, err := r.loadFor(ctx, c, overlay)
	if err != nil {
		return Plan{}, err
	}
	// Tasks the user can see only: unknown, deleted, foreign or hidden ones are
	// not found. Any visible task may be in the focus, one assigned to someone
	// else too, as in the Daily check's picker and the routine step.
	tasks := map[string]ruleval.FocusTask{}
	var missing []string
	for _, id := range ids {
		t := snap.task(id)
		if t == nil || deleted(t) || !snap.visible(t, false) {
			missing = append(missing, id)
			continue
		}
		ft := ruleval.FocusTask{Open: isOpen(t)}
		var est int
		if v := t["estimate_minutes"]; !opsync.IsNull(v) && json.Unmarshal(v, &est) == nil {
			ft.Estimate = &est
		}
		tasks[id] = ft
	}
	if len(missing) > 0 {
		return Plan{}, notFound("task", missing)
	}
	prefs, err := r.get(ctx, c.UserID, "user_prefs", "me")
	if err != nil {
		return Plan{}, err
	}
	fp := ruleval.PlanSetFocus(ids, tasks, rawStr(prefs, "focus_style"), rawStr(prefs, "bento_order"), today)
	patch := map[string]json.RawMessage{"focus_date": raw(fp.FocusDate), "focus": raw(fp.Focus)}
	if fp.Slots != nil {
		patch["focus_slots"] = raw(*fp.Slots)
	}
	if err := checkPatch("", "review", "me", patch); err != nil {
		return Plan{}, err
	}
	row, err := r.get(ctx, c.UserID, "review", "me")
	if err != nil {
		return Plan{}, err
	}
	if row == nil {
		row = opsync.Entity{}
	}
	placed := []string{}
	if fp.Focus != "" {
		placed = strings.Split(fp.Focus, ",")
	}
	in := map[string]bool{}
	for _, id := range placed {
		in[id] = true
	}
	items := []map[string]any{}
	for _, id := range ids {
		status := "placed"
		if !in[id] {
			status = "left_out"
		}
		items = append(items, map[string]any{"id": id, "status": status})
	}
	unchanged := true
	for f, v := range patch {
		if rawStr(row, f) != rawStr(opsync.Entity{f: v}, f) {
			unchanged = false
		}
	}
	out := result("set_today_focus", items, 1)
	out["focus"], out["focus_date"] = placed, today
	if unchanged {
		out["changed"] = 0
		return Plan{Result: out}, nil
	}
	cs := ChangeSet{{Entity: "review", EntityID: "me", Patch: patch, Base: base(row, patch)}}
	return Plan{Result: out, Changes: cs, Count: 1}, nil
}

// todayFocus is today's focus as the app shows it and the tool writes it: the
// ids on the review row for the logical today (the account's time zone, or
// timezone, with its day start), visible tasks only, and that day.
func (r *Registry) todayFocus(ctx context.Context, userID string, a args, snap *snapshot) ([]string, string) {
	out := []string{}
	day, _, err := r.habitToday(ctx, userID, a)
	if err != nil {
		return out, ""
	}
	row, err := r.get(ctx, userID, "review", "me")
	if err != nil || row == nil {
		return out, day
	}
	for _, id := range closedlist.IDs(rawStr(row, "focus"), rawStr(row, "focus_date"), day) {
		if t := snap.task(id); t != nil && !deleted(t) && snap.visible(t, false) {
			out = append(out, id)
		}
	}
	return out, day
}
