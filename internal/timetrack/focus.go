package timetrack

import "encoding/json"

// Focus is what a Focus work session wrote on its time entry (OpenSpec change
// focus-session-readable, design D2): the mode, the work session's number in
// the Pomodoro cycle (0 otherwise) and when the stretch ends if nothing
// changes (nil for Flowtime). Breaks and pauses write no entry, so they have
// no Focus details either.
type Focus struct {
	Mode         string `json:"mode"`
	Session      int    `json:"session"`
	PlannedEndAt *int64 `json:"plannedEndAt"`
}

// FocusFromRow reads the Focus details of a materialized time_entry row, nil
// for an entry that is no Focus session (focus_mode empty or absent: an entry
// from the Start button, the API, CalDAV, an import or before this change).
// An unknown mode from a newer client is kept as written.
func FocusFromRow(row map[string]json.RawMessage) *Focus {
	var mode string
	_ = json.Unmarshal(row["focus_mode"], &mode)
	if mode == "" {
		return nil
	}
	f := &Focus{Mode: mode, Session: int(int64Of(row["focus_session"]))}
	if v, ok := row["planned_end_at"]; ok && len(v) > 0 && string(v) != "null" {
		if n := int64Of(v); n > 0 {
			f.PlannedEndAt = &n
		}
	}
	return f
}
