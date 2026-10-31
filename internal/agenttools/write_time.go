package agenttools

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"time"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
	"github.com/OpenTodoApp/opentodo/internal/timetrack"
)

// Time entry write tools (OpenSpec change agent-tools-complete, design D6):
// start_timer, stop_timer, log_time and update_time_entries. Start, stop, log
// and edit, never delete, and never a silent stop: starting while another
// entry of the user runs is refused with timer_running unless the call says
// stop_running, so a Focus session the person runs cannot be ended by
// accident. update_time_entries changes only entries this same token created
// (device agent:<token-id>); the person's own tracked time is never rewritten.

const (
	// MaxEntryMinutes bounds one logged entry (24 hours).
	MaxEntryMinutes = 24 * 60
	// MaxEntryNote caps an entry's note in characters.
	MaxEntryNote = 2000
	// entrySkew is how far in the future an entry may end (clock skew).
	entrySkew = int64(time.Minute / time.Millisecond)
)

var (
	entryTimeProp = map[string]any{"type": "string", "description": "RFC 3339 time, e.g. 2026-10-29T09:00:00+01:00."}
	entryNoteProp = map[string]any{"type": "string", "maxLength": MaxEntryNote, "description": "Optional note on the entry."}
)

func init() {
	register(tool{def: func(Caller) Definition {
		return writeDef("start_timer", "Start a timer",
			"Start tracking time on a task for the user now. When another of the user's timers runs (a Focus session, say), the call is refused with timer_running: ask the person first, and only then call again with stop_running true, which ends that timer at this start.",
			object([]string{"task_id"}, map[string]any{
				"task_id":           map[string]any{"type": "string", "description": "Task id."},
				"stop_running":      map[string]any{"type": "boolean", "default": false, "description": "End the user's running timer at this start. Only after the person agreed."},
				"note":              entryNoteProp,
				"id":                chosenIDProp,
				"client_request_id": requestIDProp,
			}), false, false, []string{"note"}, false)
	}, plan: (*Registry).planStartTimer})

	register(tool{def: func(Caller) Definition {
		return writeDef("stop_timer", "Stop the timer", "Stop the user's running timer now.",
			object(nil, map[string]any{}), false, true, nil, false)
	}, plan: (*Registry).planStopTimer})

	register(tool{def: func(Caller) Definition {
		item := object([]string{"task_id", "started_at", "ended_at"}, map[string]any{
			"task_id": map[string]any{"type": "string", "description": "Task id."}, "started_at": entryTimeProp, "ended_at": entryTimeProp, "note": entryNoteProp, "id": chosenIDProp,
		})
		return writeDef("log_time", "Log time",
			fmt.Sprintf("Log finished stretches of work on tasks for the user, up to %d per call: the end after the start, at most 24 hours each, not in the future.", PerCall),
			object([]string{"items"}, map[string]any{
				"items":             map[string]any{"type": "array", "minItems": 1, "maxItems": PerCall, "items": item},
				"client_request_id": requestIDProp,
			}), false, false, []string{"note"}, false)
	}, plan: (*Registry).planLogTime})

	register(tool{def: func(Caller) Definition {
		return writeDef("update_time_entries", "Update time entries",
			"Change the start, end or note of time entries this same assistant token created (start_timer or log_time). Entries the person tracked are refused with not_permitted. Entries cannot be deleted.",
			object([]string{"updates"}, map[string]any{
				"updates": map[string]any{"type": "array", "minItems": 1, "maxItems": PerCall, "items": object([]string{"id"}, map[string]any{
					"id": map[string]any{"type": "string", "description": "Time entry id (see list_time_entries)."}, "started_at": entryTimeProp, "ended_at": entryTimeProp, "note": entryNoteProp,
				})},
			}), false, true, []string{"note"}, false)
	}, plan: (*Registry).planUpdateTimeEntries})
}

// entryTime reads an RFC 3339 time (or Unix milliseconds, as the REST routes
// send) as Unix ms.
func (a args) entryTime(prefix, name string) (int64, bool, error) {
	if !a.present(name) {
		return 0, false, nil
	}
	var f float64
	if json.Unmarshal(a[name], &f) == nil {
		if f <= 0 || f != math.Trunc(f) {
			return 0, false, argErr(prefix + name + ": must be a positive Unix millisecond time")
		}
		return int64(f), true, nil
	}
	var s string
	if json.Unmarshal(a[name], &s) != nil {
		return 0, false, argErr(prefix + name + ": must be an RFC 3339 time")
	}
	t, err := time.Parse(time.RFC3339, strings.TrimSpace(s))
	if err != nil {
		return 0, false, argErr(prefix + name + ": must be an RFC 3339 time, e.g. 2026-10-29T09:00:00Z")
	}
	return t.UnixMilli(), true, nil
}

// checkRange applies the D6 bounds to a closed entry.
func checkRange(prefix string, start, end, now int64) error {
	switch {
	case end < start:
		return argErr(prefix + "ended_at, started_at: the end must not be before the start")
	case end-start > MaxEntryMinutes*60_000:
		return argErr(prefix + "ended_at, started_at: an entry is at most 24 hours long")
	case end > now+entrySkew:
		return argErr(prefix + "ended_at: must not be in the future")
	}
	return nil
}

// timeState is the caller's entries: all of them for the one-running rule,
// and whether each entry's task is visible to the assistant.
type timeState struct {
	entries []timetrack.Entry
	rows    map[string]opsync.Entity
}

func (r *Registry) timeState(ctx context.Context, uid string) (*timeState, error) {
	rows, err := r.list(ctx, uid, "time_entry", false)
	if err != nil {
		return nil, err
	}
	st := &timeState{rows: map[string]opsync.Entity{}}
	for _, row := range rows {
		e := timetrack.FromRow(row)
		st.entries = append(st.entries, e)
		st.rows[e.ID] = row
	}
	return st, nil
}

// trackRole refuses tracking on a task whose shared project the caller only views.
func (snap *snapshot) trackRole(t opsync.Entity) error {
	pid := rawStr(t, "project_id")
	if role := snap.role(pid); role == opsync.RoleViewer {
		return forbidden([]map[string]any{{"id": rawStr(t, "id"), "reason": "forbidden", "role": role}})
	}
	return nil
}

func entryResult(id, status, taskID string, start int64, end *int64) map[string]any {
	out := map[string]any{"id": id, "status": status, "task_id": taskID, "started_at": isoTime(float64(start)), "ended_at": nil}
	if end != nil {
		out["ended_at"] = isoTime(float64(*end))
	}
	return out
}

func newEntryPatch(c Caller, taskID string, start int64, end *int64, note string) map[string]json.RawMessage {
	ended := nullRaw
	if end != nil {
		ended = raw(*end)
	}
	return map[string]json.RawMessage{"task_id": raw(taskID), "user_id": raw(c.UserID), "started_at": raw(start), "ended_at": ended,
		"device_id": raw(c.Device()), "note": raw(note), "created_at": raw(stamp()), "deleted_at": nullRaw}
}

// replayed reports whether a keyed create already made this entry.
func (st *timeState) replayed(id string) bool {
	_, ok := st.rows[id]
	return ok
}

func (r *Registry) planStartTimer(ctx context.Context, c Caller, a args, overlay ChangeSet) (Plan, error) {
	if err := a.only("", "task_id", "stop_running", "note", "client_request_id", "id"); err != nil {
		return Plan{}, err
	}
	taskID, err := a.str("task_id")
	if err != nil || taskID == "" {
		return Plan{}, argErr("task_id: the task id is required")
	}
	stop, err := a.boolean("stop_running")
	if err != nil {
		return Plan{}, err
	}
	note, _, err := a.contentText(c, "note", false, MaxEntryNote)
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
	t := snap.task(taskID)
	if t == nil {
		return Plan{}, notFound("task", []string{taskID})
	}
	if err := snap.trackRole(t); err != nil {
		return Plan{}, err
	}
	st, err := r.timeState(ctx, c.UserID)
	if err != nil {
		return Plan{}, err
	}
	// A chosen id lets ot mcp --decrypt bind the note's ciphertext to the entry.
	id, err := a.chosenID("")
	if err != nil {
		return Plan{}, err
	}
	chosen := map[string]bool{id: id != ""}
	if id == "" {
		id = entityID(seed, 0)
	}
	if seed != "" && st.replayed(id) {
		e := timetrack.FromRow(st.rows[id])
		return Plan{Result: result("start_timer", []map[string]any{entryResult(id, "exists", e.TaskID, e.StartedAt, e.EndedAt)}, 0)}, nil
	}
	now := r.now().UnixMilli()
	var cs ChangeSet
	if run := timetrack.Running(st.entries, c.UserID); run != nil {
		visible := snap.task(run.TaskID) != nil
		if !stop || !visible {
			data := map[string]any{"running_entry_id": run.ID, "started_at": isoTime(float64(run.StartedAt))}
			msg := "another timer of the user is running; ask the person before taking it over, then call again with stop_running true; nothing was changed"
			if visible {
				data["task_id"] = run.TaskID
			} else {
				delete(data, "running_entry_id")
				msg = "another timer of the user is running on a task you cannot see; only the person can stop it; nothing was changed"
			}
			return Plan{}, &ToolError{Code: "timer_running", Message: msg, Data: data}
		}
		for _, rp := range timetrack.StartBatch(st.entries, c.UserID, now) {
			patch := map[string]json.RawMessage{"ended_at": raw(rp.EndedAt)}
			cs = append(cs, Change{Entity: "time_entry", EntityID: rp.ID, Patch: patch, Base: base(st.rows[rp.ID], patch)})
		}
	}
	patch := newEntryPatch(c, taskID, now, nil, note)
	if err := checkPatch("", "time_entry", id, patch); err != nil {
		return Plan{}, err
	}
	stopped := len(cs)
	cs = append(cs, Change{Entity: "time_entry", EntityID: id, Create: true, Patch: patch, opSeed: seed})
	if err := r.claimIDs(ctx, c, cs, chosen); err != nil {
		return Plan{}, err
	}
	res := result("start_timer", []map[string]any{entryResult(id, "started", taskID, now, nil)}, len(cs))
	res["stopped"] = stopped
	return Plan{Result: res, Changes: cs, Count: len(cs)}, nil
}

func (r *Registry) planStopTimer(ctx context.Context, c Caller, a args, overlay ChangeSet) (Plan, error) {
	if err := a.only(""); err != nil {
		return Plan{}, err
	}
	snap, err := r.loadFor(ctx, c, overlay)
	if err != nil {
		return Plan{}, err
	}
	st, err := r.timeState(ctx, c.UserID)
	if err != nil {
		return Plan{}, err
	}
	run := timetrack.Running(st.entries, c.UserID)
	if run == nil || snap.task(run.TaskID) == nil {
		return Plan{}, &ToolError{Code: "not_found", Message: "no timer of the user is running; nothing was changed"}
	}
	now := r.now().UnixMilli()
	var cs ChangeSet
	var end int64
	for _, rp := range timetrack.StartBatch(st.entries, c.UserID, now) {
		patch := map[string]json.RawMessage{"ended_at": raw(rp.EndedAt)}
		cs = append(cs, Change{Entity: "time_entry", EntityID: rp.ID, Patch: patch, Base: base(st.rows[rp.ID], patch)})
		if rp.ID == run.ID {
			end = rp.EndedAt
		}
	}
	return Plan{Result: result("stop_timer", []map[string]any{entryResult(run.ID, "stopped", run.TaskID, run.StartedAt, &end)}, len(cs)), Changes: cs, Count: len(cs)}, nil
}

func (r *Registry) planLogTime(ctx context.Context, c Caller, a args, overlay ChangeSet) (Plan, error) {
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
	st, err := r.timeState(ctx, c.UserID)
	if err != nil {
		return Plan{}, err
	}
	now := r.now().UnixMilli()
	var cs ChangeSet
	var out []map[string]any
	var missing []string
	chosen := map[string]bool{}
	for i, it := range list {
		p := fmt.Sprintf("items[%d].", i)
		if err := it.only(p, "task_id", "started_at", "ended_at", "note", "id"); err != nil {
			return Plan{}, err
		}
		taskID, err := it.str("task_id")
		if err != nil || taskID == "" {
			return Plan{}, argErr(p + "task_id: the task id is required")
		}
		start, hasStart, err := it.entryTime(p, "started_at")
		if err != nil {
			return Plan{}, err
		}
		end, hasEnd, err := it.entryTime(p, "ended_at")
		if err != nil {
			return Plan{}, err
		}
		if !hasStart || !hasEnd {
			return Plan{}, argErr(p + "started_at, ended_at: both are required (use start_timer to start a running timer)")
		}
		if err := checkRange(p, start, end, now); err != nil {
			return Plan{}, err
		}
		note, _, err := it.contentText(c, "note", false, MaxEntryNote)
		if err != nil {
			return Plan{}, argErr(p + err.Error())
		}
		t := snap.task(taskID)
		if t == nil {
			missing = append(missing, taskID)
			continue
		}
		if err := snap.trackRole(t); err != nil {
			return Plan{}, err
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
		} else {
			id = entityID(seed, i)
		}
		if seed != "" && st.replayed(id) {
			e := timetrack.FromRow(st.rows[id])
			out = append(out, entryResult(id, "exists", e.TaskID, e.StartedAt, e.EndedAt))
			continue
		}
		patch := newEntryPatch(c, taskID, start, &end, note)
		if err := checkPatch(p, "time_entry", id, patch); err != nil {
			return Plan{}, err
		}
		cs = append(cs, Change{Entity: "time_entry", EntityID: id, Create: true, Patch: patch, opSeed: seed})
		out = append(out, entryResult(id, "logged", taskID, start, &end))
	}
	if len(missing) > 0 {
		return Plan{}, notFound("task", missing)
	}
	if err := r.claimIDs(ctx, c, cs, chosen); err != nil {
		return Plan{}, err
	}
	return Plan{Result: result("log_time", out, len(cs)), Changes: cs, Count: len(cs)}, nil
}

func (r *Registry) planUpdateTimeEntries(ctx context.Context, c Caller, a args, overlay ChangeSet) (Plan, error) {
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
	st, err := r.timeState(ctx, c.UserID)
	if err != nil {
		return Plan{}, err
	}
	now := r.now().UnixMilli()
	var cs ChangeSet
	var out []map[string]any
	var missing []string
	var foreign []string
	seen := map[string]bool{}
	for i, it := range list {
		p := fmt.Sprintf("updates[%d].", i)
		if err := it.only(p, "id", "started_at", "ended_at", "note"); err != nil {
			return Plan{}, err
		}
		id, err := it.str("id")
		if err != nil || id == "" {
			return Plan{}, argErr(p + "id: the time entry id is required")
		}
		if seen[id] {
			return Plan{}, argErr(p + "id: each entry may appear only once per call")
		}
		seen[id] = true
		row, ok := st.rows[id]
		if !ok || deleted(row) || snap.task(rawStr(row, "task_id")) == nil {
			missing = append(missing, id)
			continue
		}
		if rawStr(row, "device_id") != c.Device() || rawStr(row, "user_id") != c.UserID {
			foreign = append(foreign, id)
			continue
		}
		e := timetrack.FromRow(row)
		patch := map[string]json.RawMessage{}
		if v, has, err := it.entryTime(p, "started_at"); err != nil {
			return Plan{}, err
		} else if has {
			e.StartedAt = v
			patch["started_at"] = raw(v)
		}
		if v, has, err := it.entryTime(p, "ended_at"); err != nil {
			return Plan{}, err
		} else if has {
			e.EndedAt = &v
			patch["ended_at"] = raw(v)
		}
		if v, has, err := it.contentText(c, "note", false, MaxEntryNote); err != nil {
			return Plan{}, argErr(p + err.Error())
		} else if has {
			patch["note"] = raw(v)
		}
		if len(patch) == 0 {
			return Plan{}, argErr(p + "nothing to change: give started_at, ended_at or note")
		}
		if e.EndedAt != nil {
			if err := checkRange(p, e.StartedAt, *e.EndedAt, now); err != nil {
				return Plan{}, err
			}
		} else if e.StartedAt > now+entrySkew {
			return Plan{}, argErr(p + "started_at: must not be in the future")
		}
		if err := checkPatch(p, "time_entry", id, patch); err != nil {
			return Plan{}, err
		}
		for f, v := range patch {
			if opsync.SameJSON(row[f], v) {
				delete(patch, f)
			}
		}
		if len(patch) == 0 {
			out = append(out, entryResult(id, "unchanged", e.TaskID, e.StartedAt, e.EndedAt))
			continue
		}
		cs = append(cs, Change{Entity: "time_entry", EntityID: id, Patch: patch, Base: base(row, patch)})
		out = append(out, entryResult(id, "updated", e.TaskID, e.StartedAt, e.EndedAt))
	}
	if len(missing) > 0 {
		return Plan{}, notFound("time entry", missing)
	}
	if len(foreign) > 0 {
		return Plan{}, &ToolError{Code: "not_permitted", Message: "only time entries this same assistant token created can be changed; the person's own tracked time is never rewritten; nothing was changed",
			Data: map[string]any{"ids": foreign}}
	}
	return Plan{Result: result("update_time_entries", out, len(cs)), Changes: cs, Count: len(cs)}, nil
}
