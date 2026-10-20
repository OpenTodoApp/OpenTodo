package timetrack

import (
	"encoding/json"
	"sort"
	"strings"
	"time"
)

// FromRow reads an Entry from a materialized time_entry row (sync.Entity).
func FromRow(row map[string]json.RawMessage) Entry {
	var e Entry
	_ = json.Unmarshal(row["id"], &e.ID)
	_ = json.Unmarshal(row["task_id"], &e.TaskID)
	_ = json.Unmarshal(row["user_id"], &e.UserID)
	e.StartedAt = int64Of(row["started_at"])
	if v, ok := row["ended_at"]; ok && string(v) != "null" {
		n := int64Of(v)
		e.EndedAt = &n
	}
	_ = json.Unmarshal(row["note"], &e.Note)
	if v, ok := row["deleted_at"]; ok && string(v) != "null" {
		n := int64Of(v)
		e.DeletedAt = &n
	}
	return e
}

// TaskFromRow reads a Task from a materialized task row: its title, project,
// label ids, custom field values (`fields.<id>`) and deletion state.
func TaskFromRow(row map[string]json.RawMessage) Task {
	t := Task{Fields: map[string]any{}}
	_ = json.Unmarshal(row["id"], &t.ID)
	_ = json.Unmarshal(row["title"], &t.Title)
	_ = json.Unmarshal(row["project_id"], &t.ProjectID)
	_ = json.Unmarshal(row["labels"], &t.Labels)
	if v, ok := row["deleted_at"]; ok && string(v) != "null" {
		n := int64Of(v)
		t.DeletedAt = &n
	}
	for k, v := range row {
		id, ok := strings.CutPrefix(k, "fields.")
		if !ok || id == "" || string(v) == "null" {
			continue
		}
		var x any
		if json.Unmarshal(v, &x) == nil {
			t.Fields[id] = x
		}
	}
	return t
}

func int64Of(raw json.RawMessage) int64 {
	var f float64
	_ = json.Unmarshal(raw, &f)
	return int64(f)
}

// Query selects entries for a listing: a task, a range of logical days in
// Loc, running ones only.
type Query struct {
	Task     string
	From, To string
	Running  bool
	Loc      *time.Location
	DayStart int
}

// Select keeps the live entries matching q whose task is live (liveTask
// reports it), newest first: the greatest started_at, then the greatest id.
func Select(entries []Entry, q Query, liveTask func(string) bool) []Entry {
	var out []Entry
	for _, e := range entries {
		if !e.Live() || (q.Task != "" && e.TaskID != q.Task) || (q.Running && e.EndedAt != nil) || !liveTask(e.TaskID) {
			continue
		}
		if q.From != "" || q.To != "" {
			day := DayOf(e.StartedAt, q.Loc, q.DayStart)
			if (q.From != "" && day < q.From) || (q.To != "" && day > q.To) {
				continue
			}
		}
		out = append(out, e)
	}
	sort.SliceStable(out, func(i, j int) bool { return wins(out[i], out[j]) })
	return out
}
