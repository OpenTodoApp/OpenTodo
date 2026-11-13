package rules

import (
	"context"
	"encoding/json"
	"errors"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// A routine's workspace (OpenSpec change routine-conditions, D1): rule.workspace_id
// names the one workspace a personal routine works in. Its world holds only that
// workspace's tasks, projects and sections, so its trigger fires only for them
// and its steps find and change only them; a change that would reach another
// workspace fails the run with a reason. Null is every workspace, which every
// routine made before the field reads as. A shared project's routine is bound
// by its project instead (routines-shared D3).

// ErrCodeOtherWorkspace is the failure of a step that would move a task into
// another workspace's project.
const ErrCodeOtherWorkspace = "other_workspace"

// ErrWorkspaceGone is the answer for a routine whose workspace the user no
// longer belongs to: it does not run.
var ErrWorkspaceGone = errors.New("workspace gone")

// workspaceList lists the user's workspaces once per world.
func (w *world) workspaceList() []opsync.Workspace {
	if w.wsList == nil && w.loadWorkspaces != nil {
		list, err := w.loadWorkspaces()
		if err != nil {
			list = nil
		}
		w.wsList = &list
	}
	if w.wsList == nil {
		return nil
	}
	return *w.wsList
}

// partition places the world's projects and tasks in the user's workspaces.
func (w *world) partition() *opsync.Partition {
	p := &opsync.Partition{Known: map[string]bool{}, Projects: map[string]opsync.PartitionProject{}, Tasks: map[string]opsync.PartitionTask{}}
	for _, ws := range w.workspaceList() {
		p.Known[ws.ID] = true
		if ws.Default {
			p.Default = ws.ID
		}
	}
	for id, pr := range w.projectRows {
		p.Projects[id] = opsync.PartitionProject{WorkspaceID: str(pr, "workspace_id"), ParentID: str(pr, "parent_id")}
	}
	for id, t := range w.tasks {
		p.Tasks[id] = opsync.PartitionTask{WorkspaceID: str(t, "workspace_id"), ProjectID: str(t, "project_id"), ParentID: str(t, "parent_id")}
	}
	return p
}

// inWorkspace is the world a routine of workspace ws reads: that workspace's
// tasks, projects and sections, with the other workspaces' projects kept in
// elsewhere. It returns nil when ws is not one of the user's workspaces.
func (w *world) inWorkspace(ws string) *world {
	part := w.partition()
	if !part.Known[ws] {
		return nil
	}
	b := *w
	b.workspace, b.workspaceDefault = ws, part.Default == ws
	b.tasks, b.parent, b.projectRows, b.elsewhere = map[string]opsync.Entity{}, map[string]string{}, map[string]opsync.Entity{}, map[string]bool{}
	b.sections, b.sectionName = map[string]string{}, map[string]string{}
	b.tracked, b.trackedOcc, b.changed = nil, nil, nil
	b.notes, b.noteDates, b.noteMs = nil, nil, nil
	for id, p := range w.projectRows {
		if part.Project(id) == ws {
			b.projectRows[id], b.parent[id] = p, w.parent[id]
		} else {
			b.elsewhere[id] = true
		}
	}
	for id, t := range w.tasks {
		if part.Task(id) == ws {
			b.tasks[id] = t
		}
	}
	for id, pid := range w.sections {
		if _, ok := b.projectRows[pid]; ok {
			b.sections[id] = pid
			if n, ok := w.sectionName[id]; ok {
				b.sectionName[id] = n
			}
		}
	}
	for _, x := range w.workspaceList() {
		if x.ID == ws {
			b.workspaceName = x.Name
		}
	}
	return &b
}

// worldOf is the world one rule runs in for Run now, a test and a device's
// commit: a shared routine's project (for a member, refused below editor),
// a personal routine's workspace, or the user's whole world.
func (e *Engine) worldOf(ctx context.Context, uid string, r *rule, w *world) (*world, error) {
	if r.Shared {
		return e.sharedWorld(ctx, uid, r, w)
	}
	if r.WorkspaceID == "" {
		return w, nil
	}
	if b := w.inWorkspace(r.WorkspaceID); b != nil {
		return b, nil
	}
	return nil, ErrWorkspaceGone
}

// outsideWorkspace checks a routine's planned changes against its workspace
// (D1): "" when every change stays in it, else the entity that would reach
// another workspace. A task is outside when it is not one of the workspace's
// tasks (and not created by the run), or when the change moves it into
// another workspace's project or names another workspace.
func (st *runState) outsideWorkspace() string {
	ws := st.w.workspace
	if ws == "" {
		return ""
	}
	created := map[string]bool{}
	for _, c := range st.overlay {
		if c.Create {
			created[c.Entity+"\x00"+c.EntityID] = true
		}
	}
	inTask := func(id string) bool { _, ok := st.w.tasks[id]; return ok || created["task\x00"+id] }
	other := func(patch map[string]json.RawMessage) bool {
		if v, ok := patch["project_id"]; ok && st.w.elsewhere[strOf(v)] {
			return true
		}
		if v, ok := patch["parent_id"]; ok && strOf(v) != "" && !inTask(strOf(v)) {
			return true
		}
		if v, ok := patch["workspace_id"]; ok {
			if _, project := patch["project_id"]; !project || strOf(patch["project_id"]) == "" {
				id := strOf(v)
				if id == "" && !st.w.workspaceDefault || id != "" && id != ws {
					return true
				}
			}
		}
		return false
	}
	for _, c := range st.overlay {
		switch c.Entity {
		case "task":
			if !c.Create && !inTask(c.EntityID) || other(c.Patch) {
				return "task"
			}
		case "project":
			if st.w.elsewhere[c.EntityID] || other(c.Patch) {
				return "project"
			}
		case "comment", "time_entry":
			if id := strOf(c.Patch["task_id"]); id != "" && !inTask(id) {
				return c.Entity
			}
		case "note":
			// Only the workspace's notes (notes-in-routines D7).
			if _, ok := st.w.notes[c.EntityID]; !ok && !created["note\x00"+c.EntityID] || other(c.Patch) {
				return "note"
			}
		}
	}
	return ""
}

// workspaceFailure is the run's reason when a change would leave its workspace.
func (st *runState) workspaceFailure(where string) string {
	return "this routine works only in the workspace " + st.w.workspaceName + " (a " + where + " outside it)"
}
