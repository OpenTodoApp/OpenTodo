package sync

import (
	"database/sql"
	"encoding/json"
	"errors"
)

// Location reminders (OpenSpec change location-reminders, design D1). A
// reminder of kind "arrive" or "leave" fires on a phone that crosses the circle
// of radius_m around its task's location, so it never has a fire_at or an
// offset; every other kind never has a radius. The resolver refuses the
// batch's ops of kind, fire_at, offset_minutes and radius_m for a reminder
// whose effective values would mix them: the batch's winning value of each
// field when the batch carries one, else the stored value. Refused ops travel
// back with ReasonInvalidReminder like forbidden ones; the rest of the batch
// (other reminders, other fields) applies.
// Concurrent edits from two devices may still merge into a mix by LWW: readers
// (the scheduler, CalDAV, clients) treat a location kind as having no firing
// time and another kind as having no radius.

// ReasonInvalidReminder refuses a reminder op that mixes a location kind with
// a firing time or an offset, or another kind with a radius.
const ReasonInvalidReminder = "invalid_reminder"

// MinReminderRadius and MaxReminderRadius bound a location reminder's radius
// in metres (location-reminders D1); clients preset DefaultReminderRadius.
const (
	MinReminderRadius     = 100
	MaxReminderRadius     = 5000
	DefaultReminderRadius = 150
)

// IsLocationKind reports whether a reminder kind is one of the location kinds.
func IsLocationKind(kind string) bool { return kind == "arrive" || kind == "leave" }

// reminderShapeFields are the reminder fields whose combination is checked.
var reminderShapeFields = map[string]bool{"kind": true, "fire_at": true, "offset_minutes": true, "radius_m": true}

// noteReminder collects the batch's winning value of each shape field per
// reminder, so the check sees the batch's result whatever the op order.
func (r *resolver) noteReminder(op Op) {
	if op.Entity != "reminder" || !reminderShapeFields[op.Field] {
		return
	}
	if r.batchReminder == nil {
		r.batchReminder = map[string]map[string]Op{}
	}
	fields := r.batchReminder[op.EntityID]
	if fields == nil {
		fields = map[string]Op{}
		r.batchReminder[op.EntityID] = fields
	}
	if prev, ok := fields[op.Field]; !ok || Wins(op.TS, op.Device, prev.TS, prev.Device) {
		fields[op.Field] = op
	}
}

// reminderValue is the effective value of a reminder field: the batch's
// winning value, else the stored one in scope, else nil.
func (r *resolver) reminderValue(scope, id, field string) (json.RawMessage, error) {
	if op, ok := r.batchReminder[id][field]; ok {
		return op.Value, nil
	}
	var value sql.NullString
	err := r.tx.QueryRowContext(r.ctx, `SELECT value FROM scope_fields WHERE scope_id = ? AND entity = 'reminder' AND entity_id = ? AND field = ?`,
		scope, id, field).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && !value.Valid) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return json.RawMessage(value.String), nil
}

// checkReminderShape refuses every shape field op of a reminder whose
// effective values after the batch would mix a location kind with a firing
// time or an offset, or another kind with a radius. The answer is computed once
// per reminder and batch, so the batch's shape ops of a reminder are refused or
// applied together, whatever their order.
func (r *resolver) checkReminderShape(op Op, scope string) (string, error) {
	if !reminderShapeFields[op.Field] {
		return "", nil
	}
	if ok, done := r.reminderShapeOK[op.EntityID]; done {
		return shapeReason(ok), nil
	}
	values := map[string]json.RawMessage{}
	for f := range reminderShapeFields {
		v, err := r.reminderValue(scope, op.EntityID, f)
		if err != nil {
			return "", err
		}
		values[f] = v
	}
	set := func(f string) bool { return values[f] != nil && !IsNull(values[f]) }
	ok := !set("radius_m")
	if IsLocationKind(StringOf(values["kind"])) {
		ok = !set("fire_at") && !set("offset_minutes")
	}
	if r.reminderShapeOK == nil {
		r.reminderShapeOK = map[string]bool{}
	}
	r.reminderShapeOK[op.EntityID] = ok
	return shapeReason(ok), nil
}

func shapeReason(ok bool) string {
	if ok {
		return ""
	}
	return ReasonInvalidReminder
}
