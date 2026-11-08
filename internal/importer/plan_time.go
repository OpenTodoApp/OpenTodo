package importer

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/zoned"
)

// Tracked time from another app (OpenSpec change migration-everywhere, design
// D4). A file that only says "30 minutes on 1 October" becomes one closed time
// entry of the importing account per day, starting at 09:00 on that day in the
// import's time zone, as the time-entry routes would write a logged entry.

const (
	importEntryClock = "09:00"
	maxEntryMinutes  = 24 * 60
)

// timeEntries builds the time entries of a created task.
func (pl *planner) timeEntries(taskID string, list []TimeEntry, res *RowResult) []change {
	var out []change
	for _, e := range list {
		if e.Minutes <= 0 {
			continue
		}
		minutes := e.Minutes
		if minutes > maxEntryMinutes {
			minutes = maxEntryMinutes
			res.Warnings = append(res.Warnings, fmt.Sprintf("time tracked on %s is more than 24 hours; imported as 24 hours", e.Day))
		}
		start, err := zoned.Instant(e.Day, importEntryClock, pl.opts.Location())
		if err != nil {
			res.Warnings = append(res.Warnings, fmt.Sprintf("time tracked on %q dropped (not a date)", e.Day))
			continue
		}
		startMS := start.UnixMilli()
		endMS := start.Add(time.Duration(minutes) * time.Minute).UnixMilli()
		id := pl.newID()
		fields := []field{
			{"task_id", raw(taskID)}, {"user_id", raw(pl.st.UserID)},
			{"started_at", raw(startMS)}, {"ended_at", raw(endMS)},
			{"device_id", raw(Device)}, {"note", raw("")},
			{"created_at", raw(pl.now)}, {"deleted_at", json.RawMessage("null")},
		}
		if err := validateFields(KindTimeEntry, id, fields); err != nil {
			res.Warnings = append(res.Warnings, "time entry dropped: "+err.Error())
			continue
		}
		out = append(out, change{entity: KindTimeEntry, id: id, fields: fields, created: true})
	}
	return out
}
