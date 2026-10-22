package agenttools

import (
	"context"
	"encoding/json"
	"sort"
	"strings"

	opsync "github.com/pixari/opentodo/internal/sync"
)

// Workspaces in tools (OpenSpec change workspaces, mcp-server "Workspaces in
// tools"): list_workspaces, the `workspace` argument of list_projects,
// list_tasks and search_tasks, and workspace_id on writes. Where an entity
// belongs follows sync.Partition, the rule the devices use.

func init() {
	register(tool{
		def: readDef("list_workspaces", "List workspaces",
			"List the user's workspaces: separate rooms with their own projects, labels and views. Each has an id, a name, the user's role and whether it is the default workspace; for workspaces the user owns, the names of the members and groups. Pass a workspace's id or name as workspace to list_projects, list_tasks or search_tasks.",
			object(nil, map[string]any{})),
		read: (*Registry).listWorkspaces,
	})
}

// workspaceProp is the optional `workspace` argument of the read tools.
var workspaceProp = map[string]any{"type": "string", "description": "Only this workspace: its id or exact name (see list_workspaces). Absent: every workspace."}

// workspaceIDProp is `workspace_id` on create_project, create_tasks and update_project.
var workspaceIDProp = map[string]any{"type": []string{"string", "null"}, "description": "Workspace id (see list_workspaces), or null for the default workspace."}

type workspaceText struct {
	Name    string   `json:"name"`
	Members []string `json:"members,omitempty"`
	Groups  []string `json:"groups,omitempty"`
}

type workspaceOut struct {
	ID        string        `json:"id"`
	Untrusted workspaceText `json:"untrusted_text"`
	Role      string        `json:"role"`
	Default   bool          `json:"default"`
}

func (r *Registry) loadWorkspaces(ctx context.Context, userID string, snap *snapshot) error {
	list, err := r.sync.Workspaces(ctx, userID)
	if err != nil {
		return err
	}
	snap.workspaces = list
	return nil
}

// defaultWorkspace is the id of the user's default workspace.
func (snap *snapshot) defaultWorkspace() string {
	for _, w := range snap.workspaces {
		if w.Default {
			return w.ID
		}
	}
	return ""
}

// partition places the snapshot's projects and tasks in workspaces.
func (snap *snapshot) partition() *opsync.Partition {
	if snap.part != nil {
		return snap.part
	}
	p := &opsync.Partition{Default: snap.defaultWorkspace(), Known: map[string]bool{}, Projects: map[string]opsync.PartitionProject{}, Tasks: map[string]opsync.PartitionTask{}}
	for _, w := range snap.workspaces {
		p.Known[w.ID] = true
	}
	for _, pr := range snap.projList {
		p.Projects[str(pr, "id")] = opsync.PartitionProject{WorkspaceID: rawStr(pr, "workspace_id"), ParentID: rawStr(pr, "parent_id")}
	}
	for _, t := range snap.tasks {
		p.Tasks[str(t, "id")] = opsync.PartitionTask{WorkspaceID: rawStr(t, "workspace_id"), ProjectID: rawStr(t, "project_id"), ParentID: rawStr(t, "parent_id")}
	}
	snap.part = p
	return p
}

// workspaceName is the name of a workspace id ("" when unknown).
func (snap *snapshot) workspaceName(id string) string {
	for _, w := range snap.workspaces {
		if w.ID == id {
			return w.Name
		}
	}
	return ""
}

// resolveWorkspace turns a `workspace` argument (id or exact name, ignoring
// case) into a workspace id; "" stays "" (every workspace).
func (snap *snapshot) resolveWorkspace(name, arg string) (string, error) {
	if arg == "" {
		return "", nil
	}
	for _, w := range snap.workspaces {
		if w.ID == arg {
			return w.ID, nil
		}
	}
	for _, w := range snap.workspaces {
		if strings.EqualFold(w.Name, arg) {
			return w.ID, nil
		}
	}
	names := make([]string, 0, len(snap.workspaces))
	for _, w := range snap.workspaces {
		names = append(names, w.Name)
	}
	sort.Strings(names)
	return "", argErr(name + ": no such workspace; the user's workspaces are " + strings.Join(names, ", "))
}

// workspaceValue checks a workspace_id argument of a write and returns the
// value to store: null for the default workspace.
func (snap *snapshot) workspaceValue(a args) (json.RawMessage, bool, error) {
	v, ok := a["workspace_id"]
	if !ok {
		return nil, false, nil
	}
	if string(v) == "null" {
		return nullRaw, true, nil
	}
	var id string
	if json.Unmarshal(v, &id) != nil {
		return nil, false, argErr("workspace_id: must be a workspace id or null")
	}
	id, err := snap.resolveWorkspace("workspace_id", strings.TrimSpace(id))
	if err != nil {
		return nil, false, err
	}
	if id == "" || id == snap.defaultWorkspace() {
		return nullRaw, true, nil
	}
	return raw(id), true, nil
}

func (r *Registry) workspacesPayload(snap *snapshot) map[string]any {
	out := make([]workspaceOut, 0, len(snap.workspaces))
	for _, w := range snap.workspaces {
		wo := workspaceOut{ID: w.ID, Untrusted: workspaceText{Name: w.Name}, Role: w.Role, Default: w.Default}
		if w.Role == opsync.WorkspaceOwner && !w.Default {
			for _, m := range w.Members {
				wo.Untrusted.Members = append(wo.Untrusted.Members, m.Name)
			}
			for _, g := range w.Groups {
				wo.Untrusted.Groups = append(wo.Untrusted.Groups, g.Name)
			}
		}
		out = append(out, wo)
	}
	return map[string]any{"workspaces": out, "server_time": r.serverTime()}
}

func (r *Registry) listWorkspaces(ctx context.Context, userID string, _ args) (map[string]any, error) {
	snap, err := r.load(ctx, userID)
	if err != nil {
		return nil, err
	}
	return r.workspacesPayload(snap), nil
}

// WorkspacesResource is opentodo://workspaces.
func (r *Registry) WorkspacesResource(ctx context.Context, userID string) (map[string]any, error) {
	snap, err := r.load(ctx, userID)
	if err != nil {
		return nil, err
	}
	return noticed(r.workspacesPayload(snap)), nil
}
