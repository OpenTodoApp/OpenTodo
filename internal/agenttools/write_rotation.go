package agenttools

import (
	"encoding/json"
	"fmt"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Rotating assignees in the agent tools (OpenSpec change chore-rotation,
// design D6): the task view names the people who take turns, and
// update_tasks sets or clears them with the REST API's checks.

// rotationProp is update_tasks' rotation property.
var rotationProp = map[string]any{"type": []string{"array", "null"}, "maxItems": opsync.MaxRotation, "items": map[string]any{"type": "string"},
	"description": "Account ids of the members who take turns on a recurring task of a shared project, in order (see the task's assignee and rotation); completing the task assigns the next of them. An empty array or null stops taking turns."}

// rotationPatch checks an update's rotation against the task after the
// patch: at most MaxRotation distinct ids, and a non-empty list only on a
// top-level recurring task of a project with at least two members, every id
// one of them.
func (snap *snapshot) rotationPatch(p string, v json.RawMessage, t opsync.Entity, patch map[string]json.RawMessage) error {
	var list []string
	if string(v) != "null" && json.Unmarshal(v, &list) != nil {
		return argErr(p + "rotation: must be an array of account ids")
	}
	if list == nil {
		list = []string{}
	}
	if !opsync.ValidRotation(list) {
		return argErr(fmt.Sprintf("%srotation: at most %d different account ids", p, opsync.MaxRotation))
	}
	if len(list) > 0 {
		recur := t["recurrence"]
		if r, ok := patch["recurrence"]; ok {
			recur = r
		}
		pid := rawStr(t, "project_id")
		members := snap.members[pid]
		if opsync.StringOf(recur) == "" || rawStr(t, "parent_id") != "" || len(members) < 2 {
			return argErr(p + "rotation: only a top-level recurring task in a project shared with at least one other member takes turns")
		}
		for _, id := range list {
			if !members[id] {
				return argErr(fmt.Sprintf("%srotation: %s is not a member of the task's project", p, id))
			}
		}
	}
	patch["rotation"] = raw(list)
	return nil
}

// rotationView fills a task view's rotation: the ids in order and, as
// untrusted text, the people's names.
func (snap *snapshot) rotationView(t opsync.Entity, out *taskOut) {
	ids := stringList(t, "rotation")
	if len(ids) == 0 || rawStr(t, "recurrence") == "" {
		return
	}
	out.Rotation = ids
	for _, id := range ids {
		name, ok := snap.people[id]
		if !ok {
			name = "(left the project)"
		}
		out.Untrusted.Rotation = append(out.Untrusted.Rotation, name)
	}
}
