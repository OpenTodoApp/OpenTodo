package agenttools

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/ids"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
	"github.com/OpenTodoApp/opentodo/internal/zoned"
)

// Reminder write tools (OpenSpec change agent-tools-complete, design D2):
// add_reminders, update_reminders and remove_reminders. Reminders are personal
// (internal/sync/scope.go): the tools read and write the caller's own only, on
// any task the caller can read. fire_at is computed as POST /api/v1/reminders
// computes it, in the user's time zone.

// MaxRemindersPerTask caps the live reminders a task holds after a call of
// these tools, so a looping agent cannot fill a task with alerts (D2).
const MaxRemindersPerTask = 10

var reminderAtProp = map[string]any{"type": "object", "additionalProperties": false, "required": []string{"date", "time"},
	"description": "For kind absolute: the moment, a calendar date and a wall-clock time read in tz, or in the user's time zone without tz.",
	"properties": map[string]any{
		"date": map[string]any{"type": "string", "format": "date", "description": "YYYY-MM-DD"},
		"time": map[string]any{"type": "string", "description": "HH:MM (24-hour)"},
		"tz":   map[string]any{"type": "string", "description": "IANA time zone, optional"},
	}}

var offsetProp = map[string]any{"type": "integer", "minimum": -opsync.MaxReminderOffset, "maximum": 0,
	"description": "For kind relative: minutes before the due time (0 = at the due time, -30 = half an hour before). For kind deadline: minutes before 09:00 on the deadline day."}

func init() {
	register(tool{def: func(Caller) Definition {
		item := object([]string{"task_id", "kind"}, map[string]any{
			"task_id":        map[string]any{"type": "string", "description": "Task id."},
			"kind":           map[string]any{"type": "string", "enum": []string{"relative", "deadline", "absolute"}, "description": "relative follows the task's due time, deadline its deadline day, absolute fires at a fixed moment."},
			"offset_minutes": offsetProp,
			"at":             reminderAtProp,
			"id":             chosenIDProp,
		})
		return writeDef("add_reminders", "Add reminders",
			fmt.Sprintf("Add reminders for the user to up to %d tasks. Reminders are the user's own: other members of a shared project never see them. A relative reminder follows the task's due time when it moves; a task without a due date (or deadline) gets a reminder that fires once it has one. At most %d reminders per task.", PerCall, MaxRemindersPerTask),
			object([]string{"items"}, map[string]any{
				"items":             map[string]any{"type": "array", "minItems": 1, "maxItems": PerCall, "items": item},
				"client_request_id": requestIDProp,
			}), false, false, nil, false)
	}, plan: (*Registry).planAddReminders})

	register(tool{def: func(Caller) Definition {
		return writeDef("update_reminders", "Update reminders",
			"Change when the user's reminders fire: offset_minutes of a relative or deadline reminder, at of an absolute one. The kind never changes: remove the reminder and add another instead. get_task lists a task's reminders.",
			object([]string{"updates"}, map[string]any{
				"updates": map[string]any{"type": "array", "minItems": 1, "maxItems": PerCall, "items": object([]string{"id"}, map[string]any{
					"id":             map[string]any{"type": "string", "description": "Reminder id (see get_task)."},
					"offset_minutes": offsetProp,
					"at":             reminderAtProp,
				})},
			}), false, true, nil, false)
	}, plan: (*Registry).planUpdateReminders})

	register(tool{def: func(Caller) Definition {
		return writeDef("remove_reminders", "Remove reminders",
			"Remove the user's reminders, as deleting them in the task panel does. History keeps them.",
			object([]string{"ids"}, map[string]any{"ids": map[string]any{"type": "array", "minItems": 1, "maxItems": PerCall, "items": map[string]any{"type": "string"},
				"description": fmt.Sprintf("Reminder ids (see get_task), at most %d.", PerCall)}}), true, true, nil, false)
	}, plan: (*Registry).planRemoveReminders})
}

// zone is the user's time zone for reminders (Options.UserZone).
func (r *Registry) zone(ctx context.Context, uid string) *time.Location {
	if r.userZone != nil {
		if loc := r.userZone(ctx, uid); loc != nil {
			return loc
		}
	}
	return time.UTC
}

// liveReminders are the caller's live reminders on tasks the snapshot shows
// (a task of a project kept away from assistants hides its reminders).
func (r *Registry) liveReminders(ctx context.Context, uid string, snap *snapshot) ([]opsync.Entity, error) {
	all, err := r.list(ctx, uid, "reminder", false)
	if err != nil {
		return nil, err
	}
	out := make([]opsync.Entity, 0, len(all))
	for _, rem := range all {
		if !deleted(rem) && snap.task(rawStr(rem, "task_id")) != nil {
			out = append(out, rem)
		}
	}
	return out, nil
}

// reminderOffset reads offset_minutes: an integer from -MaxReminderOffset to 0.
func (a args) reminderOffset(prefix string) (json.RawMessage, bool, error) {
	n, has, err := a.integer("offset_minutes")
	if err != nil {
		return nil, false, argErr(prefix + err.Error())
	}
	if !has {
		return nil, false, nil
	}
	if n > 0 || n < -opsync.MaxReminderOffset {
		return nil, false, argErr(fmt.Sprintf("%soffset_minutes: from -%d to 0 (minutes before)", prefix, opsync.MaxReminderOffset))
	}
	return raw(n), true, nil
}

// reminderAt reads at, the moment of an absolute reminder, as Unix ms.
func (a args) reminderAt(prefix string, loc *time.Location) (int64, bool, error) {
	if !a.present("at") {
		return 0, false, nil
	}
	var at struct {
		Date string `json:"date"`
		Time string `json:"time"`
		TZ   string `json:"tz"`
	}
	var extra map[string]json.RawMessage
	if json.Unmarshal(a["at"], &at) != nil || json.Unmarshal(a["at"], &extra) != nil {
		return 0, false, argErr(prefix + "at: must be an object with date and time")
	}
	for k := range extra {
		if k != "date" && k != "time" && k != "tz" {
			return 0, false, argErr(prefix + "at." + k + ": unknown argument")
		}
	}
	if at.TZ != "" {
		l, err := parseZone(at.TZ, prefix+"at.tz")
		if err != nil {
			return 0, false, err
		}
		loc = l
	}
	if d, err := time.Parse("2006-01-02", at.Date); err != nil || d.Format("2006-01-02") != at.Date {
		return 0, false, argErr(prefix + "at.date: must be a date in YYYY-MM-DD form")
	}
	if c, err := time.Parse("15:04", at.Time); err != nil || c.Format("15:04") != at.Time {
		return 0, false, argErr(prefix + "at.time: must be HH:MM (24-hour)")
	}
	t, err := zoned.Instant(at.Date, at.Time, loc)
	if err != nil {
		return 0, false, argErr(prefix + "at: not a moment that exists in that time zone")
	}
	return t.UnixMilli(), true, nil
}

// reminderFire is the firing time of a relative or deadline reminder on task t.
func reminderFire(kind string, t opsync.Entity, offset json.RawMessage, loc *time.Location) json.RawMessage {
	if kind == "deadline" {
		return zoned.DeadlineFireAt(t["deadline"], offset, loc)
	}
	return zoned.RelativeFireAt(zoned.DecodeDue(t["due"]), offset, loc)
}

func fireOut(v json.RawMessage) *string {
	var ms float64
	if json.Unmarshal(v, &ms) != nil || ms <= 0 {
		return nil
	}
	return isoTime(ms)
}

func (r *Registry) planAddReminders(ctx context.Context, c Caller, a args, overlay ChangeSet) (Plan, error) {
	if err := a.only("", "items", "client_request_id"); err != nil {
		return Plan{}, err
	}
	list, err := a.items("items")
	if err != nil {
		return Plan{}, err
	}
	seed, err := a.requestID(c)
	if err != nil {
		return Plan{}, err
	}
	snap, err := r.loadFor(ctx, c, overlay)
	if err != nil {
		return Plan{}, err
	}
	live, err := r.liveReminders(ctx, c.UserID, snap)
	if err != nil {
		return Plan{}, err
	}
	perTask := map[string]int{}
	for _, rem := range live {
		perTask[rawStr(rem, "task_id")]++
	}
	loc := r.zone(ctx, c.UserID)
	now := stamp()
	var cs ChangeSet
	var out []map[string]any
	var missing []string
	chosen := map[string]bool{}
	for i, it := range list {
		p := fmt.Sprintf("items[%d].", i)
		if err := it.only(p, "task_id", "kind", "offset_minutes", "at", "id"); err != nil {
			return Plan{}, err
		}
		taskID, err := it.str("task_id")
		if err != nil || taskID == "" {
			return Plan{}, argErr(p + "task_id: the task id is required")
		}
		kind, err := it.str("kind")
		if err != nil || (kind != "relative" && kind != "deadline" && kind != "absolute") {
			return Plan{}, argErr(p + `kind: must be "relative", "deadline" or "absolute"`)
		}
		offset, hasOffset, err := it.reminderOffset(p)
		if err != nil {
			return Plan{}, err
		}
		at, hasAt, err := it.reminderAt(p, loc)
		if err != nil {
			return Plan{}, err
		}
		switch {
		case kind == "absolute" && (!hasAt || hasOffset):
			return Plan{}, argErr(p + "at: an absolute reminder needs at (and no offset_minutes)")
		case kind != "absolute" && hasAt:
			return Plan{}, argErr(p + "at: only an absolute reminder takes at; give offset_minutes")
		case kind != "absolute" && !hasOffset:
			offset = raw(0)
		}
		id, err := it.chosenID(p)
		if err != nil {
			return Plan{}, err
		}
		if id != "" {
			if chosen[id] {
				return Plan{}, argErr(p + "id: each id may appear only once per call")
			}
			chosen[id] = true
		} else if seed != "" {
			id = entityID(seed, i)
		} else {
			id = ids.New()
		}
		t := snap.task(taskID)
		if t == nil {
			missing = append(missing, taskID)
			continue
		}
		perTask[taskID]++
		if perTask[taskID] > MaxRemindersPerTask {
			return Plan{}, &ToolError{Code: "invalid", Message: fmt.Sprintf("a task holds at most %d reminders from an assistant call; remove one first; nothing was changed", MaxRemindersPerTask),
				Data: map[string]any{"task_id": taskID}}
		}
		fire := raw(at)
		if kind != "absolute" {
			fire = reminderFire(kind, t, offset, loc)
		} else {
			offset = nullRaw
		}
		patch := map[string]json.RawMessage{"task_id": raw(taskID), "kind": raw(kind), "offset_minutes": offset, "fire_at": fire,
			"delivered_at": nullRaw, "dismissed_at": nullRaw, "created_at": raw(now), "deleted_at": nullRaw}
		if err := checkPatch(p, "reminder", id, patch); err != nil {
			return Plan{}, err
		}
		cs = append(cs, Change{Entity: "reminder", EntityID: id, Create: true, Patch: patch, opSeed: seed})
		out = append(out, map[string]any{"id": id, "status": "created", "task_id": taskID, "kind": kind, "fire_at": fireOut(fire)})
	}
	if len(missing) > 0 {
		return Plan{}, notFound("task", missing)
	}
	if err := r.claimIDs(ctx, c, cs, chosen); err != nil {
		return Plan{}, err
	}
	return Plan{Result: result("add_reminders", out, len(cs)), Changes: cs, Count: len(cs)}, nil
}

func (r *Registry) planUpdateReminders(ctx context.Context, c Caller, a args, overlay ChangeSet) (Plan, error) {
	if err := a.only("", "updates"); err != nil {
		return Plan{}, err
	}
	list, err := a.items("updates")
	if err != nil {
		return Plan{}, err
	}
	snap, err := r.loadFor(ctx, c, overlay)
	if err != nil {
		return Plan{}, err
	}
	live, err := r.liveReminders(ctx, c.UserID, snap)
	if err != nil {
		return Plan{}, err
	}
	byID := map[string]opsync.Entity{}
	for _, rem := range live {
		byID[rawStr(rem, "id")] = rem
	}
	loc := r.zone(ctx, c.UserID)
	var cs ChangeSet
	var out []map[string]any
	var missing []string
	seen := map[string]bool{}
	for i, it := range list {
		p := fmt.Sprintf("updates[%d].", i)
		if err := it.only(p, "id", "offset_minutes", "at"); err != nil {
			return Plan{}, err
		}
		id, err := it.str("id")
		if err != nil || id == "" {
			return Plan{}, argErr(p + "id: the reminder id is required")
		}
		if seen[id] {
			return Plan{}, argErr(p + "id: each reminder may appear only once per call")
		}
		seen[id] = true
		offset, hasOffset, err := it.reminderOffset(p)
		if err != nil {
			return Plan{}, err
		}
		at, hasAt, err := it.reminderAt(p, loc)
		if err != nil {
			return Plan{}, err
		}
		rem, ok := byID[id]
		if !ok {
			missing = append(missing, id)
			continue
		}
		kind := rawStr(rem, "kind")
		patch := map[string]json.RawMessage{}
		switch {
		case kind == "absolute" && hasOffset, kind != "absolute" && hasAt:
			return Plan{}, argErr(p + "a reminder keeps its kind: give at for an absolute reminder, offset_minutes otherwise; to change the kind remove it and add another")
		case !hasOffset && !hasAt:
			return Plan{}, argErr(p + "nothing to change: give offset_minutes or at")
		case kind == "absolute":
			patch["fire_at"] = raw(at)
		default:
			patch["offset_minutes"] = offset
			patch["fire_at"] = reminderFire(kind, snap.task(rawStr(rem, "task_id")), offset, loc)
		}
		if !opsync.SameJSON(patch["fire_at"], rem["fire_at"]) {
			// A moved reminder fires again, as when its task's due date moves.
			for _, f := range []string{"delivered_at", "dismissed_at"} {
				if v, ok := rem[f]; ok && string(v) != "null" {
					patch[f] = nullRaw
				}
			}
		}
		if err := checkPatch(p, "reminder", id, patch); err != nil {
			return Plan{}, err
		}
		for f, v := range patch {
			if opsync.SameJSON(rem[f], v) {
				delete(patch, f)
			}
		}
		if len(patch) == 0 {
			out = append(out, map[string]any{"id": id, "status": "unchanged", "fire_at": fireOut(rem["fire_at"])})
			continue
		}
		cs = append(cs, Change{Entity: "reminder", EntityID: id, Patch: patch, Base: base(rem, patch)})
		fire := rem["fire_at"]
		if v, ok := patch["fire_at"]; ok {
			fire = v
		}
		out = append(out, map[string]any{"id": id, "status": "updated", "fire_at": fireOut(fire)})
	}
	if len(missing) > 0 {
		return Plan{}, notFound("reminder", missing)
	}
	return Plan{Result: result("update_reminders", out, len(cs)), Changes: cs, Count: len(cs)}, nil
}

func (r *Registry) planRemoveReminders(ctx context.Context, c Caller, a args, overlay ChangeSet) (Plan, error) {
	if err := a.only("", "ids"); err != nil {
		return Plan{}, err
	}
	list, err := a.idList("ids")
	if err != nil {
		return Plan{}, err
	}
	snap, err := r.loadFor(ctx, c, overlay)
	if err != nil {
		return Plan{}, err
	}
	live, err := r.liveReminders(ctx, c.UserID, snap)
	if err != nil {
		return Plan{}, err
	}
	byID := map[string]opsync.Entity{}
	for _, rem := range live {
		byID[rawStr(rem, "id")] = rem
	}
	var missing []string
	for _, id := range list {
		if _, ok := byID[id]; !ok {
			missing = append(missing, id)
		}
	}
	if len(missing) > 0 {
		return Plan{}, notFound("reminder", missing)
	}
	now := stamp()
	var cs ChangeSet
	var out []map[string]any
	for _, id := range list {
		patch := map[string]json.RawMessage{"deleted_at": raw(now)}
		cs = append(cs, Change{Entity: "reminder", EntityID: id, Patch: patch, Base: base(byID[id], patch)})
		out = append(out, map[string]any{"id": id, "status": "removed"})
	}
	return Plan{Result: result("remove_reminders", out, len(cs)), Changes: cs, Count: len(cs)}, nil
}

// reminderOut is one of the caller's reminders in get_task (D2).
type reminderOut struct {
	ID            string  `json:"id"`
	Kind          string  `json:"kind"`
	OffsetMinutes *int    `json:"offset_minutes"`
	FireAt        *string `json:"fire_at"`
	Dismissed     bool    `json:"dismissed"`
}

// taskReminders lists the caller's live reminders of one task.
func (r *Registry) taskReminders(ctx context.Context, uid, taskID string) ([]reminderOut, error) {
	all, err := r.list(ctx, uid, "reminder", false)
	if err != nil {
		return nil, err
	}
	out := []reminderOut{}
	for _, rem := range all {
		if deleted(rem) || rawStr(rem, "task_id") != taskID || len(out) == MaxItems {
			continue
		}
		o := reminderOut{ID: rawStr(rem, "id"), Kind: rawStr(rem, "kind"), FireAt: fireOut(rem["fire_at"])}
		if v, ok := rem["offset_minutes"]; ok && string(v) != "null" {
			var n int
			if json.Unmarshal(v, &n) == nil {
				o.OffsetMinutes = &n
			}
		}
		if v, ok := rem["dismissed_at"]; ok && string(v) != "null" {
			o.Dismissed = true
		}
		out = append(out, o)
	}
	return out, nil
}
