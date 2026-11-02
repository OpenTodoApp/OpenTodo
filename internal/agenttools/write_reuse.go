package agenttools

import (
	"encoding/json"

	"github.com/OpenTodoApp/opentodo/internal/reuse"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Reusable lists in create_tasks (OpenSpec reusable-lists, design D6): an item
// whose title matches one already in a reusable list is not created again. A
// ticked-off match is reopened ("reopened") and an open one is named
// ("already_on_list"), so an agent that "adds milk" twice never duplicates it.
// An item with new: true, its own id or blockers, a subtask, and an encrypted
// account's items are created as given.

var newItemProp = map[string]any{"type": "boolean", "description": "In a reusable list (see list_projects), create a new task even when an item with the same title is already there; by default that item is reopened or reported as already on the list."}

// reuseItems rewrites the planned creates of items that match an item of a
// reusable list. cs and out hold one entry per item of list, in order.
func (snap *snapshot) reuseItems(c Caller, list []args, cs ChangeSet, out []map[string]any) (ChangeSet, []map[string]any) {
	if c.Encrypted || len(cs) != len(list) {
		return cs, out
	}
	for _, it := range list {
		if it.present("blocked_by") {
			return cs, out
		}
	}
	var tasks []reuse.Task
	kept := make(ChangeSet, 0, len(cs))
	for i, ch := range cs {
		it := list[i]
		pid := rawStr(opsync.Entity(ch.Patch), "project_id")
		var fresh bool
		_ = json.Unmarshal(it["new"], &fresh)
		if pid == "" || rawStr(opsync.Entity(ch.Patch), "parent_id") != "" || it.present("id") || fresh || !boolean(snap.projects[pid], "reusable") {
			kept = append(kept, ch)
			continue
		}
		if tasks == nil {
			tasks = reuse.FromRows(snap.tasks)
		}
		m, ok := reuse.FindMatch(pid, rawStr(opsync.Entity(ch.Patch), "title"), tasks)
		if !ok {
			kept = append(kept, ch)
			continue
		}
		if m.State == reuse.Open {
			out[i] = map[string]any{"id": m.Task.ID, "status": "already_on_list"}
			continue
		}
		patch := map[string]json.RawMessage{"completed_at": nullRaw, "completed_by": nullRaw}
		kept = append(kept, Change{Entity: "task", EntityID: m.Task.ID, Patch: patch, Base: base(snap.task(m.Task.ID), patch)})
		out[i] = map[string]any{"id": m.Task.ID, "status": "reopened"}
	}
	return kept, out
}
