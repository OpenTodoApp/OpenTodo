package agenttools

import (
	"context"
	"fmt"

	"github.com/pixari/opentodo/internal/digest"
	opsync "github.com/pixari/opentodo/internal/sync"
	"github.com/pixari/opentodo/internal/timetrack"
)

// ---- list_time_entries (OpenSpec change time-tracking, design D11) ----
//
// The sixth read tool. There is no write tool for entries: an assistant can
// report tracked time but never start, stop or edit it.

func init() {
	register(tool{
		def: readDef("list_time_entries", "List time entries",
			"List the time entries the user can read (their own and other members' on shared tasks), newest first, with minutes and the task. "+
				"from and to are local days in timezone; running: true returns only the entry that is running now. Paged: pass next_cursor back as cursor.",
			object(nil, map[string]any{
				"task_id":  map[string]any{"type": "string", "description": "Only entries of this task."},
				"from":     map[string]any{"type": "string", "format": "date", "description": "Only entries that started on or after this local day (YYYY-MM-DD)."},
				"to":       map[string]any{"type": "string", "format": "date", "description": "Only entries that started on or before this local day (YYYY-MM-DD)."},
				"running":  map[string]any{"type": "boolean", "default": false, "description": "Only running entries."},
				"timezone": timezoneProp,
				"limit":    map[string]any{"type": "integer", "minimum": 1, "maximum": MaxItems, "description": "Maximum number of entries to return (default and maximum 200)."},
				"cursor":   cursorProp,
			})),
		read: (*Registry).listTimeEntries,
	})
}

// entryText is the user-written text of an entry and its task.
type entryText struct {
	Note string `json:"note"`
	Task string `json:"task"`
}

type entryOut struct {
	ID        string    `json:"id"`
	Untrusted entryText `json:"untrusted_text"`
	TaskID    string    `json:"task_id"`
	UserID    string    `json:"user_id"`
	// TrackedByYou is false for entries other members tracked.
	TrackedByYou bool    `json:"tracked_by_you"`
	StartedAt    *string `json:"started_at"`
	EndedAt      *string `json:"ended_at"`
	Minutes      int     `json:"minutes"`
}

func (r *Registry) listTimeEntries(ctx context.Context, userID string, a args) (map[string]any, error) {
	q := timetrack.Query{}
	var err error
	if q.Task, err = a.str("task_id"); err != nil {
		return nil, err
	}
	if q.From, err = a.date("from"); err != nil {
		return nil, err
	}
	if q.To, err = a.date("to"); err != nil {
		return nil, err
	}
	if q.From != "" && q.To != "" && q.To < q.From {
		return nil, argErr("to: must not be before from")
	}
	if q.Running, err = a.boolean("running"); err != nil {
		return nil, err
	}
	if q.Loc, err = a.location(); err != nil {
		return nil, err
	}
	limit, err := a.limit()
	if err != nil {
		return nil, err
	}
	cursor, err := a.str("cursor")
	if err != nil {
		return nil, err
	}
	snap, err := r.load(ctx, userID)
	if err != nil {
		return nil, err
	}
	tasks := map[string]opsync.Entity{}
	for _, t := range snap.tasks {
		if snap.visible(t, true) {
			tasks[str(t, "id")] = t
		}
	}
	if q.Task != "" && tasks[q.Task] == nil {
		return nil, ErrTaskNotFound
	}
	if prefs, err := r.get(ctx, userID, "user_prefs", "me"); err == nil && prefs != nil {
		q.DayStart = digest.DayStart(rawStr(prefs, "day_start"))
	}
	rows, err := r.list(ctx, userID, "time_entry", false)
	if err != nil {
		return nil, err
	}
	entries := make([]timetrack.Entry, 0, len(rows))
	for _, e := range rows {
		entries = append(entries, timetrack.FromRow(e))
	}
	now := r.now().UnixMilli()
	sel := timetrack.Select(entries, q, func(id string) bool { return tasks[id] != nil })
	items := make([]keyed[entryOut], 0, len(sel))
	for _, e := range sel {
		out := entryOut{ID: e.ID, TaskID: e.TaskID, UserID: e.UserID, TrackedByYou: e.UserID == userID,
			Untrusted: entryText{Note: timetrack.Display(e.Note), Task: str(tasks[e.TaskID], "title")},
			StartedAt: isoTime(float64(e.StartedAt)), Minutes: timetrack.MinutesOf(e, now)}
		if e.EndedAt != nil {
			out.EndedAt = isoTime(float64(*e.EndedAt))
		}
		// Newest first: the key orders by descending start (page sorts ascending).
		items = append(items, keyed[entryOut]{key: fmt.Sprintf("%019d", int64(1<<62)-e.StartedAt), id: e.ID, v: out})
	}
	list, next, err := page(items, cursor, limit)
	if err != nil {
		return nil, err
	}
	return map[string]any{"time_entries": list, "next_cursor": nullable(next), "timezone": q.Loc.String(), "server_time": r.serverTime(),
		"total_minutes": totalMinutes(sel, now)}, nil
}

func totalMinutes(entries []timetrack.Entry, now int64) int {
	n := 0
	for _, e := range entries {
		n += timetrack.MinutesOf(e, now)
	}
	return n
}
