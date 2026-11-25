package agenttools

import (
	"github.com/OpenTodoApp/opentodo/internal/kept"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Kept subtasks in the agent tools (OpenSpec change keep-open-subtasks, design D5).

// isKept reports whether t is a kept subtask (internal/kept).
func (snap *snapshot) isKept(t opsync.Entity) bool {
	if snap.kept == nil {
		snap.kept = kept.OfRows(snap.tasks)
	}
	return snap.kept[rawStr(t, "id")]
}

// openDescendants are the open tasks below id at any depth, parents first.
func (snap *snapshot) openDescendants(id string) []opsync.Entity {
	kids := map[string][]opsync.Entity{}
	for _, t := range snap.tasks {
		if p := rawStr(t, "parent_id"); p != "" {
			kids[p] = append(kids[p], t)
		}
	}
	var out []opsync.Entity
	seen := map[string]bool{id: true}
	for level := []string{id}; len(level) > 0; {
		var next []string
		for _, p := range level {
			for _, k := range kids[p] {
				kid := rawStr(k, "id")
				if seen[kid] {
					continue
				}
				seen[kid] = true
				next = append(next, kid)
				if isOpen(k) {
					out = append(out, k)
				}
			}
		}
		level = next
	}
	return out
}

// listed reports whether t belongs in a list of open work or a count: visible
// (archived projects as asked) and not kept.
func (snap *snapshot) listed(t opsync.Entity, includeArchived bool) bool {
	return snap.visible(t, includeArchived) && !snap.isKept(t)
}
