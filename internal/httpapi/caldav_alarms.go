package httpapi

import (
	"encoding/json"
	"sort"
	"time"

	"github.com/pixari/opentodo/internal/caldav"
	"github.com/pixari/opentodo/internal/ids"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// Alarms as reminders (OpenSpec change caldav-interop, "Alarms as reminders",
// design D3, D4, D6): each mappable VALARM of a PUT becomes a reminder
// operation in the same batch as the task's fields, matched to a served
// reminder by its UID; an alarm the reminder model cannot express is kept as
// client data.

// alarmResult is what a PUT's alarms write.
type alarmResult struct {
	ops     []opsync.Op
	kept    []string        // content lines of alarms kept as client data
	touched map[string]bool // reminder ids written by ops
}

// alarmMinuteMs is the tolerance for an absolute trigger: a VALARM carries no
// sub-minute precision once parsed, so a served trigger sent back unchanged
// must not move the reminder (and reset its dismissal).
const alarmMinuteMs = 60_000

// alarmWrites maps the inbound VALARMs of a task onto reminder ops. f holds the
// task fields this PUT writes; current is nil on create, and then no reminder
// exists yet (a copy into another sharing scope starts afresh too).
func (d *davRequest) alarmWrites(v *davView, in *caldav.Inbound, current opsync.Entity, taskID string, f map[string]json.RawMessage, ts int64) (alarmResult, error) {
	res := alarmResult{touched: map[string]bool{}}
	var existing []opsync.Entity
	if current != nil && idOf(current["id"]) == taskID {
		existing = v.reminders[taskID]
	}
	if len(in.Alarms) == 0 && len(existing) == 0 {
		return res, nil
	}
	// The task's dates once this PUT is applied.
	dueRaw, deadlineRaw := f["due"], f["deadline"]
	if dueRaw == nil && current != nil {
		dueRaw = current["due"]
	}
	if deadlineRaw == nil && current != nil {
		deadlineRaw = current["deadline"]
	}
	hasDeadline := !isNullish(deadlineRaw)
	// RELATED=START is the due date when the VTODO's DTSTART is the due date.
	startIsDue := in.Shape == caldav.ShapeStartDue || in.Shape == caldav.ShapeStartDueEqual || in.Shape == caldav.ShapeStartDuration
	datesChanged := current == nil || !opsync.SameJSON(dueRaw, current["due"]) || !opsync.SameJSON(deadlineRaw, current["deadline"])
	byID := map[string]opsync.Entity{}
	for _, r := range existing {
		byID[idOf(r["id"])] = r
	}
	var loc *time.Location
	location := func() *time.Location {
		if loc == nil {
			loc = d.s.tzLocation(d.ctx(), d.user.ID)
		}
		return loc
	}
	op := func(id, field string, val json.RawMessage) {
		res.ops = append(res.ops, d.op("reminder", id, field, val, ts))
		res.touched[id] = true
	}
	matched := map[string]bool{}
	mapped := 0
	now := time.Now().UnixMilli()
	for _, a := range in.Alarms {
		kind, offset, fire, ok := alarmTarget(a, hasDeadline, startIsDue, dueRaw, deadlineRaw, location)
		if !ok || mapped >= caldav.MaxMappedAlarms {
			res.kept = append(res.kept, a.Lines...)
			continue
		}
		mapped++
		if r, served := byID[a.UID]; served && !matched[a.UID] {
			matched[a.UID] = true
			sameKind := idOf(r["kind"]) == kind
			sameOffset := kind == "absolute" || int(numberOf(r["offset_minutes"])) == offset
			if sameKind && sameOffset && kind != "absolute" && !datesChanged {
				continue // nothing moved: leave fire_at, delivery and dismissal alone
			}
			if kind == "absolute" && sameKind && closeInstant(r["fire_at"], fire) {
				continue
			}
			if !sameKind {
				op(a.UID, "kind", mustJSON(kind))
			}
			offVal := json.RawMessage("null")
			if kind != "absolute" {
				offVal = mustJSON(offset)
			}
			if !opsync.SameJSON(offVal, r["offset_minutes"]) {
				op(a.UID, "offset_minutes", offVal)
			}
			if !opsync.SameJSON(fire, r["fire_at"]) {
				op(a.UID, "fire_at", fire)
				for _, field := range []string{"delivered_at", "dismissed_at"} {
					if !isNullish(r[field]) {
						op(a.UID, field, json.RawMessage("null"))
					}
				}
			}
			continue
		}
		id, err := d.newReminderID(v, a.UID)
		if err != nil {
			return res, err
		}
		offVal := json.RawMessage("null")
		if kind != "absolute" {
			offVal = mustJSON(offset)
		}
		for _, kv := range []struct {
			field string
			val   json.RawMessage
		}{
			{"task_id", mustJSON(taskID)}, {"kind", mustJSON(kind)}, {"offset_minutes", offVal}, {"fire_at", fire},
			{"delivered_at", json.RawMessage("null")}, {"dismissed_at", json.RawMessage("null")},
			{"created_at", mustJSON(now)}, {"deleted_at", json.RawMessage("null")},
		} {
			op(id, kv.field, kv.val)
		}
	}
	// A served reminder whose alarm is gone is deleted, but only when the
	// client shows it knew about alarms: it sent one, or it echoes the served
	// count (design D3). A client that never saw them leaves reminders alone.
	knew := len(in.Alarms) > 0 || (in.ServedAlarms != nil && *in.ServedAlarms > 0)
	if knew {
		rids := make([]string, 0, len(byID))
		for id := range byID {
			rids = append(rids, id)
		}
		sort.Strings(rids)
		for _, id := range rids {
			if !matched[id] {
				op(id, "deleted_at", mustJSON(now))
			}
		}
	}
	return res, nil
}

// alarmTarget decides what reminder an alarm is (design D4) and its firing
// time; ok is false for an alarm kept as client data.
func alarmTarget(a caldav.Alarm, hasDeadline, startIsDue bool, dueRaw, deadlineRaw json.RawMessage, loc func() *time.Location) (kind string, offset int, fire json.RawMessage, ok bool) {
	if !a.Mappable {
		return "", 0, nil, false
	}
	if a.At != nil {
		at, ok := dueInstantMs(&due{Date: a.At.Date, Time: a.At.Time, TZ: a.At.TZ}, loc())
		if !ok {
			return "", 0, nil, false
		}
		return "absolute", 0, mustJSON(at), true
	}
	if a.Offset == nil {
		return "", 0, nil, false
	}
	offset = *a.Offset
	switch {
	case a.Kind == "DEADLINE":
		kind = "deadline"
	case a.Kind == "RELATIVE":
		kind = "relative"
	case a.Related == "START":
		if !startIsDue {
			return "", 0, nil, false
		}
		kind = "relative"
	case hasDeadline:
		// Served with a deadline, DUE was the deadline.
		kind = "deadline"
	default:
		kind = "relative"
	}
	off := mustJSON(offset)
	if kind == "deadline" {
		return kind, offset, deadlineFireAt(deadlineRaw, off, loc()), true
	}
	return kind, offset, relativeFireAt(decodeDue(dueRaw), off, loc()), true
}

// newReminderID is the id of a reminder created from an alarm: the alarm's UID
// when it is a usable id no entity has (so the next fetch serves the same UID),
// otherwise a fresh one.
func (d *davRequest) newReminderID(v *davView, uid string) (string, error) {
	if uid == "" || !usableID.MatchString(uid) {
		return ids.New(), nil
	}
	if _, known := v.remTask[uid]; known {
		return ids.New(), nil
	}
	r, err := d.s.sync.Get(d.ctx(), d.user.ID, "reminder", uid)
	if err != nil {
		return "", err
	}
	if r != nil {
		return ids.New(), nil
	}
	return uid, nil
}

func closeInstant(a, b json.RawMessage) bool {
	if isNullish(a) || isNullish(b) {
		return isNullish(a) && isNullish(b)
	}
	x, y := int64(numberOf(a)), int64(numberOf(b))
	diff := x - y
	if diff < 0 {
		diff = -diff
	}
	return diff < alarmMinuteMs
}

// remindersFor lists a task's live reminders for the VTODO, oldest first.
func (v *davView) remindersFor(taskID string) []caldav.Reminder {
	list := v.reminders[taskID]
	if len(list) == 0 {
		return nil
	}
	sorted := append([]opsync.Entity(nil), list...)
	sort.SliceStable(sorted, func(i, j int) bool {
		ci, cj := numberOf(sorted[i]["created_at"]), numberOf(sorted[j]["created_at"])
		if ci != cj {
			return ci < cj
		}
		return idOf(sorted[i]["id"]) < idOf(sorted[j]["id"])
	})
	out := make([]caldav.Reminder, 0, len(sorted))
	for _, r := range sorted {
		if idOf(r["kind"]) == "absolute" && isNullish(r["fire_at"]) {
			continue // an absolute reminder without a time has no trigger to serve
		}
		out = append(out, caldav.Reminder{
			ID: idOf(r["id"]), Kind: idOf(r["kind"]), Offset: int(numberOf(r["offset_minutes"])),
			FireAt: int64(numberOf(r["fire_at"])),
		})
	}
	return out
}
