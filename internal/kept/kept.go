// Package kept is the kept-subtask rule (OpenSpec change keep-open-subtasks,
// design D2), the Go port of keptIds and isKept in web/src/lib/subtasks.ts,
// pinned by the shared vectors web/src/lib/kept.vectors.json.
//
// A task is kept when it is open, not deleted, and has a live (not deleted)
// completed ancestor at any depth. A missing or deleted ancestor ends the walk,
// and so does a cycle. Kept is derived, never stored: kept tasks are left out of
// lists of open work, counts and reminders, and stay in their parent's subtasks.
package kept

import (
	"encoding/json"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Task is the part of a task the rule reads.
type Task struct {
	ID        string
	ParentID  string
	Completed bool
	Deleted   bool
}

// Is reports whether t is kept; get finds a task by id among the tasks held.
func Is(t Task, get func(id string) (Task, bool)) bool {
	if t.Completed || t.Deleted || t.ParentID == "" {
		return false
	}
	seen := map[string]bool{t.ID: true}
	for id := t.ParentID; id != "" && !seen[id]; {
		seen[id] = true
		up, ok := get(id)
		if !ok || up.Deleted {
			return false
		}
		if up.Completed {
			return true
		}
		id = up.ParentID
	}
	return false
}

// IDs returns the ids of the kept tasks among tasks.
func IDs(tasks []Task) map[string]bool {
	out := map[string]bool{}
	var byID map[string]Task
	for _, t := range tasks {
		if t.Completed || t.Deleted || t.ParentID == "" {
			continue
		}
		if byID == nil {
			byID = make(map[string]Task, len(tasks))
			for _, x := range tasks {
				byID[x.ID] = x
			}
		}
		if Is(t, func(id string) (Task, bool) { x, ok := byID[id]; return x, ok }) {
			out[t.ID] = true
		}
	}
	return out
}

// Of reads a materialised task row; a completed_at of 0 is open, as on the web app.
func Of(e opsync.Entity) Task {
	var at float64
	if !opsync.IsNull(e["completed_at"]) {
		_ = json.Unmarshal(e["completed_at"], &at)
	}
	return Task{ID: opsync.StringOf(e["id"]), ParentID: opsync.StringOf(e["parent_id"]), Completed: at != 0, Deleted: e.Deleted()}
}

// OfRows returns the ids of the kept tasks among materialised task rows.
func OfRows(rows []opsync.Entity) map[string]bool {
	tasks := make([]Task, 0, len(rows))
	for _, e := range rows {
		tasks = append(tasks, Of(e))
	}
	return IDs(tasks)
}
