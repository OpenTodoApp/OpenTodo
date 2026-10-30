// Package defaultreminder is the default reminder rule (OpenSpec change
// default-reminders): when a person's write gives a task that had no due date a
// due date, one ordinary relative reminder with that person's default for the
// kind of due (with a time, or a date only) joins the same batch (design D3).
// Its id is derived from the person and the task (D4), so it is created at most
// once per person and task. When the due switches between a date only and a
// time, an untouched default reminder takes the other default (D5).
//
// web/src/lib/defaultReminder.ts implements the same rule; both are pinned by
// web/src/lib/defaultReminder.vectors.json. A leaf: it imports zoned and ids only.
package defaultreminder

import (
	"encoding/json"
	"regexp"
	"strconv"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/ids"
	"github.com/OpenTodoApp/opentodo/internal/zoned"
)

// MaxOffset bounds a default, the sync schema's MaxReminderOffset: one year
// before or after the due time (a test keeps them equal).
const MaxOffset = 525600

// Prefs are the two defaults in minutes from the due time (09:00 for a date
// only); nil is none.
type Prefs struct {
	Timed, Dated *int64
}

// Set reports whether either default is set.
func (p Prefs) Set() bool { return p.Timed != nil || p.Dated != nil }

var offsetRE = regexp.MustCompile(`^-?\d{1,7}$`)

// ParseOffset reads one stored value: a whole number of minutes within
// MaxOffset, else none (the stored value is kept by its writer).
func ParseOffset(v string) *int64 {
	if !offsetRE.MatchString(v) {
		return nil
	}
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil || n < -MaxOffset || n > MaxOffset {
		return nil
	}
	return &n
}

// ReadPrefs reads the defaults from a user_prefs row (nil reads as none).
func ReadPrefs(row map[string]json.RawMessage) Prefs {
	str := func(f string) string {
		var s string
		_ = json.Unmarshal(row[f], &s)
		return s
	}
	return Prefs{Timed: ParseOffset(str("reminder_default_timed")), Dated: ParseOffset(str("reminder_default_dated"))}
}

// ID is the id of a person's default reminder on a task (D4).
func ID(userID, taskID string) string {
	return ids.NameID("default-reminder", userID+"\x00"+taskID)
}

// Change is one reminder's field changes.
type Change struct {
	ID    string
	Patch map[string]json.RawMessage
}

// Input is one write to one task by one person.
type Input struct {
	UserID, TaskID string
	// Before is the stored task, nil when this write creates it.
	Before map[string]json.RawMessage
	// Patch holds every field the write sets on the task.
	Patch map[string]json.RawMessage
	// Reminders are this person's stored reminders (live or deleted; other
	// tasks' are ignored).
	Reminders []map[string]json.RawMessage
	// Batch holds reminder changes already in the same write.
	Batch []Change
	Prefs Prefs
	// Loc reads a floating due (the person's zone).
	Loc *time.Location
	Now int64
}

type reminder struct {
	kind    string
	offset  json.RawMessage
	deleted bool
}

func isNull(v json.RawMessage) bool { return len(v) == 0 || string(v) == "null" }

func str(v json.RawMessage) string {
	var s string
	_ = json.Unmarshal(v, &s)
	return s
}

// merged is the task's reminders after the batch, keyed by id.
func (in Input) merged() map[string]map[string]json.RawMessage {
	out := map[string]map[string]json.RawMessage{}
	for _, r := range in.Reminders {
		if str(r["task_id"]) != in.TaskID {
			continue
		}
		cp := map[string]json.RawMessage{}
		for k, v := range r {
			cp[k] = v
		}
		out[str(r["id"])] = cp
	}
	for _, c := range in.Batch {
		row, ok := out[c.ID]
		if !ok {
			if str(c.Patch["task_id"]) != in.TaskID {
				continue
			}
			row = map[string]json.RawMessage{}
			out[c.ID] = row
		}
		for k, v := range c.Patch {
			row[k] = v
		}
	}
	return out
}

func view(r map[string]json.RawMessage) reminder {
	kind := str(r["kind"])
	if kind == "" {
		kind = "relative"
	}
	return reminder{kind: kind, offset: r["offset_minutes"], deleted: !isNull(r["deleted_at"])}
}

func timed(d *zoned.Due) bool { return d.Time != nil && *d.Time != "" }

func (in Input) pref(d *zoned.Due) *int64 {
	if timed(d) {
		return in.Prefs.Timed
	}
	return in.Prefs.Dated
}

func quote(s string) json.RawMessage {
	b, _ := json.Marshal(s)
	return b
}

func num(n int64) json.RawMessage { return json.RawMessage(strconv.FormatInt(n, 10)) }

func sameOffset(raw json.RawMessage, n int64) bool {
	var v float64
	return !isNull(raw) && json.Unmarshal(raw, &v) == nil && v == float64(n)
}

// Plan returns the reminder changes the write adds: none, a new default
// reminder, or the default reminder switched to the other kind of due.
func Plan(in Input) []Change {
	dueRaw, has := in.Patch["due"]
	if !has {
		return nil
	}
	newDue := zoned.DecodeDue(dueRaw)
	if newDue == nil {
		return nil
	}
	id := ID(in.UserID, in.TaskID)
	all := in.merged()
	own, hasOwn := all[id]
	var oldDue *zoned.Due
	if in.Before != nil {
		oldDue = zoned.DecodeDue(in.Before["due"])
	}
	null := json.RawMessage("null")
	if oldDue != nil {
		// D5: the kind of due changed and the default reminder is untouched.
		if timed(oldDue) == timed(newDue) || !hasOwn {
			return nil
		}
		r := view(own)
		from, to := in.pref(oldDue), in.pref(newDue)
		if r.deleted || r.kind != "relative" || from == nil || to == nil || *from == *to || !sameOffset(r.offset, *from) {
			return nil
		}
		return []Change{{ID: id, Patch: map[string]json.RawMessage{
			"offset_minutes": num(*to), "fire_at": zoned.RelativeFireAt(newDue, num(*to), in.Loc),
			"delivered_at": null, "dismissed_at": null,
		}}}
	}
	// D3: the task gets a due date.
	offset := in.pref(newDue)
	if offset == nil || in.blocked() {
		return nil
	}
	for _, row := range all {
		if r := view(row); !r.deleted && r.kind == "relative" {
			return nil
		}
	}
	// A default reminder the person deleted stays deleted; one Undo removed
	// (no offset left) may come back.
	if hasOwn {
		if r := view(own); !r.deleted || !isNull(r.offset) {
			return nil
		}
	}
	return []Change{{ID: id, Patch: map[string]json.RawMessage{
		"task_id": quote(in.TaskID), "kind": json.RawMessage(`"relative"`),
		"offset_minutes": num(*offset), "fire_at": zoned.RelativeFireAt(newDue, num(*offset), in.Loc),
		"delivered_at": null, "dismissed_at": null, "created_at": num(in.Now), "deleted_at": null,
	}}}
}

// blocked: the task after the write is completed, deleted or a habit.
func (in Input) blocked() bool {
	field := func(f string) json.RawMessage {
		if v, ok := in.Patch[f]; ok {
			return v
		}
		return in.Before[f]
	}
	return !isNull(field("completed_at")) || !isNull(field("deleted_at")) || string(field("habit")) == "true"
}
