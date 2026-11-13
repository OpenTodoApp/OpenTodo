package davroutes

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"

	"github.com/OpenTodoApp/opentodo/internal/caldav"
	"github.com/OpenTodoApp/opentodo/internal/calfeed"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Event mode of an app password (OpenSpec change caldav-events): its calendars
// hold one VEVENT per open task with a due date, written as Calendar sync
// writes it (calfeed.WriteEvent), and an edit of the event changes only what an
// event carries: the title, the notes and the timing.

// servedAsEvent reports whether a task is a member of an event calendar.
func servedAsEvent(t opsync.Entity) bool {
	if !isNullish(t["completed_at"]) {
		return false
	}
	d := decodeDue(t["due"])
	return d != nil && d.Date != ""
}

// encodeEvent is encode for an event calendar.
func (v *davView) encodeEvent(t opsync.Entity) ([]byte, string) {
	ft, _ := v.feedTask(t)
	ft.UID = v.uidOf(ft.ID)
	body := calfeed.WriteEvent(ft, calfeed.FeedOptions{Now: v.now, BaseURL: v.baseURL})
	sum := sha256.Sum256(body)
	return body, `"` + hex.EncodeToString(sum[:16]) + `"`
}

// eventFields are the task fields an edited event may change.
var eventFields = map[string]bool{"title": true, "description": true, "due": true, "estimate_minutes": true, "start": true, "span": true}

// eventTiming reads an event's days into the task (caldav-events D3): an
// all-day event over several days is a multi-day task from its first to its
// last day; any other event of a multi-day task ends the span.
func eventTiming(in *caldav.Inbound, cur opsync.Entity) {
	if in.Due == nil {
		return
	}
	if in.EventLastDay != "" && in.Due.Time == nil {
		first := in.Due.Date
		on := true
		in.Start, in.Span = &first, &on
		in.Due.Date = in.EventLastDay
		return
	}
	if cur != nil && string(cur["span"]) == "true" {
		off := false
		in.Span = &off
	}
}

// updateEvent applies an edited event to its task: only eventFields change.
func (d *davRequest) updateEvent(v *davView, cur opsync.Entity, in *caldav.Inbound) (string, error) {
	id := idOf(cur["id"])
	eventTiming(in, cur)
	if cd := decodeDue(cur["due"]); cd != nil {
		in.KeepZone(&caldav.Due{Date: cd.Date, Time: cd.Time, TZ: cd.TZ})
	}
	ts := d.s.opTS()
	df, err := d.fields(v, in, cur, id, ts)
	if err != nil {
		return "", err
	}
	var ops []opsync.Op
	for field, val := range df.f {
		if !eventFields[field] || opsync.SameJSON(val, cur[field]) {
			continue
		}
		if field == "description" && idOf(cur[field]) == "" && idOf(val) == "" {
			continue
		}
		ops = append(ops, d.op("task", id, field, val, ts))
	}
	if len(ops) == 0 {
		return id, nil
	}
	_, err = d.apply(ops)
	return id, err
}

// unscheduleEvent is a DELETE in an event calendar: the task loses its due
// date and stays (caldav-events D3).
func (d *davRequest) unscheduleEvent(t opsync.Entity) error {
	ts := d.s.opTS()
	ops := []opsync.Op{d.op("task", idOf(t["id"]), "due", json.RawMessage("null"), ts)}
	if string(t["span"]) == "true" {
		ops = append(ops, d.op("task", idOf(t["id"]), "span", json.RawMessage("false"), ts))
	}
	_, err := d.apply(ops)
	return err
}
