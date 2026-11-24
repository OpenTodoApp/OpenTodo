package agenttools

import "context"

// Calendar events for agents (OpenSpec change calendar-event-edits, D8): a
// read tool and one write tool that moves or renames an event. There is no
// tool that deletes an event. The write is no ChangeSet (events are not
// ops): planning validates and exec calls the EventEditor the server
// installs, which is the REST route's own path. Neither tool is in
// reachTools, so a token limited to workspaces gets token_restricted.

// EventTime is one end of an event, shaped like a task's due.
type EventTime struct {
	Date string  `json:"date"`
	Time *string `json:"time,omitempty"`
	TZ   *string `json:"tz,omitempty"`
}

// EventAccess is what the assistant may do with an event.
type EventAccess struct {
	Update bool   `json:"update"`
	Reason string `json:"reason,omitempty"`
}

// EventText is an event's text written by people.
type EventText struct {
	Summary  string `json:"summary"`
	Location string `json:"location,omitempty"`
}

// EventItem is one event as the tools return it.
type EventItem struct {
	ID           string       `json:"id"`
	ConnectionID string       `json:"connection_id,omitempty"`
	Rev          string       `json:"rev,omitempty"`
	Start        EventTime    `json:"start"`
	End          EventTime    `json:"end"`
	AllDay       bool         `json:"all_day"`
	Free         bool         `json:"free"`
	Access       *EventAccess `json:"access,omitempty"`
	Untrusted    EventText    `json:"untrusted_text"`
}

// EventUpdate is a call of update_calendar_event.
type EventUpdate struct {
	ConnectionID, EventID, Rev string
	Summary                    *string
	Start, End                 *EventTime
	AllDay                     *bool
}

// EventEditor reads and changes the user's calendar events for the tools;
// errors are *ToolError with the REST codes.
type EventEditor interface {
	// Events lists the events the calendar view shows in [from, to].
	Events(ctx context.Context, c Caller, from, to string) ([]EventItem, error)
	// Validate checks an update's arguments as the PATCH route does.
	Validate(u EventUpdate) error
	// Update changes an event as the assistant (its undo is kept).
	Update(ctx context.Context, c Caller, u EventUpdate) (EventItem, error)
}

// SetEventEditor installs the calendar event tools' editor.
func (r *Registry) SetEventEditor(e EventEditor) { r.eventEditor = e }

// MaxEventDays is the widest range list_calendar_events reads.
const MaxEventDays = 92
