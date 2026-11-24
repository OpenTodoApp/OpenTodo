package agenttools

import (
	"context"
	"encoding/json"
	"errors"
)

// The calendar event tools (calendar-event-edits D8), list_calendar_events and
// update_calendar_event, over the EventEditor of calendar_events.go.

var eventTimeProp = map[string]any{"type": "object", "additionalProperties": false, "required": []string{"date"}, "properties": map[string]any{
	"date": map[string]any{"type": "string", "format": "date", "description": "YYYY-MM-DD."},
	"time": map[string]any{"type": "string", "description": "HH:MM, 24-hour; omit for an all-day event."},
	"tz":   map[string]any{"type": "string", "description": "IANA time zone; keep the event's own (see list_calendar_events). Omit for a floating time."},
}}

func eventsOff() *ToolError {
	return toolErr("unavailable", "calendar events are not available on this server")
}

func init() {
	register(tool{
		def: func(Caller) Definition {
			return writeDef("update_calendar_event", "Change a calendar event",
				"Move or rename one event of a connected calendar (see list_calendar_events): send its connection_id, id and rev, and a new summary, or start and end "+
					"together (dates only with all_day true). The change is written to the user's calendar only when access.update is true; the result says when the user can undo it. "+
					"Repeating events, events with guests or organised by someone else, and subscribed calendars cannot be changed. There is no tool that deletes events.",
				object([]string{"connection_id", "event_id", "rev"}, map[string]any{
					"connection_id": map[string]any{"type": "string", "description": "The event's connection_id."},
					"event_id":      map[string]any{"type": "string", "description": "The event's id."},
					"rev":           map[string]any{"type": "string", "description": "The event's rev as listed; a changed event answers event_changed."},
					"summary":       map[string]any{"type": "string", "maxLength": 500, "description": "New title."},
					"start":         eventTimeProp,
					"end":           eventTimeProp,
					"all_day":       map[string]any{"type": "boolean", "description": "With start and end: an all-day event."},
				}), false, false, nil, false)
		},
		plan: planUpdateEvent,
	})
}

func planUpdateEvent(r *Registry, ctx context.Context, c Caller, a args, _ ChangeSet) (Plan, error) {
	if r.eventEditor == nil {
		return Plan{}, eventsOff()
	}
	var u EventUpdate
	var err error
	if u.ConnectionID, err = a.str("connection_id"); err != nil {
		return Plan{}, err
	}
	if u.EventID, err = a.str("event_id"); err != nil {
		return Plan{}, err
	}
	if u.Rev, err = a.str("rev"); err != nil {
		return Plan{}, err
	}
	if u.ConnectionID == "" || u.EventID == "" || u.Rev == "" {
		return Plan{}, argErr("connection_id, event_id, rev: required")
	}
	if a.present("summary") {
		var s string
		if json.Unmarshal(a["summary"], &s) != nil {
			return Plan{}, argErr("summary: must be a string")
		}
		u.Summary = &s
	}
	for name, dst := range map[string]**EventTime{"start": &u.Start, "end": &u.End} {
		if a.present(name) {
			var t EventTime
			if json.Unmarshal(a[name], &t) != nil {
				return Plan{}, argErr(name + ": must be {date, time?, tz?}")
			}
			*dst = &t
		}
	}
	if a.present("all_day") {
		v, err := a.boolean("all_day")
		if err != nil {
			return Plan{}, err
		}
		u.AllDay = &v
	}
	if err := r.eventEditor.Validate(u); err != nil {
		return Plan{}, err
	}
	return Plan{Result: map[string]any{}, Count: 1, execWrites: true, exec: func(ctx context.Context, maxWrites int) (map[string]any, int, error) {
		ev, err := r.eventEditor.Update(ctx, c, u)
		if err != nil {
			var te *ToolError
			if errors.As(err, &te) {
				return nil, 0, te
			}
			return nil, 0, err
		}
		out := map[string]any{"event": ev}
		if ev.Undoable {
			out["undo"] = "the user can undo this change from the event in OpenTodo's calendar"
		}
		return out, 1, nil
	}}, nil
}
