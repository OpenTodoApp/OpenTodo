package importer

import (
	"context"
	"encoding/json"
	"fmt"

	opsync "github.com/pixari/opentodo/internal/sync"
)

// The target workspace of an import (OpenSpec change import-workspace): every
// project, label and view an import creates, and every task it creates
// without a project, goes into one workspace; name matching and duplicate
// fingerprints only look inside it (design D2, D3). An own export keeps its
// own mapping unless the option names a workspace (D4).

// targetWorkspace records the import's target workspace and the partition of
// the account's data in st, and refuses a target project outside the chosen
// workspace.
func (s *Service) targetWorkspace(ctx context.Context, uid string, opts Options, st *State) error {
	list, err := s.sync.Workspaces(ctx, uid)
	if err != nil {
		return err
	}
	p := &opsync.Partition{Known: map[string]bool{}, Projects: map[string]opsync.PartitionProject{}, Tasks: map[string]opsync.PartitionTask{}}
	for _, w := range list {
		p.Known[w.ID] = true
		if w.Default {
			p.Default = w.ID
		}
	}
	target := p.Default
	if opts.Workspace != "" {
		if !p.Known[opts.Workspace] {
			return errNoSuchWorkspace
		}
		target = opts.Workspace
	}
	for _, e := range st.Projects {
		p.Projects[str(e, "id")] = opsync.PartitionProject{WorkspaceID: str(e, "workspace_id"), ParentID: str(e, "parent_id")}
	}
	for _, e := range st.Tasks {
		p.Tasks[str(e, "id")] = opsync.PartitionTask{WorkspaceID: str(e, "workspace_id"), ProjectID: str(e, "project_id"), ParentID: str(e, "parent_id")}
	}
	st.Partition, st.Workspace = p, target
	if opts.Workspace != "" && opts.TargetProject != "" && p.Project(opts.TargetProject) != target {
		return &OptionError{"targetProject: the project is in another workspace than the one chosen"}
	}
	return nil
}

// errNoSuchWorkspace is the same for a workspace that does not exist and one
// the account is not a member of (workspaces "Non-member").
var errNoSuchWorkspace = &OptionError{"workspace: no such workspace in your account"}

// checkWorkspace refuses an unknown workspace before the file is read and
// returns the chosen workspace's name and whether it is the default.
func (s *Service) checkWorkspace(ctx context.Context, uid, id string) (string, bool, error) {
	if id == "" {
		return "", false, nil
	}
	list, err := s.sync.Workspaces(ctx, uid)
	if err != nil {
		return "", false, err
	}
	for _, w := range list {
		if w.ID == id {
			return w.Name, w.Default, nil
		}
	}
	return "", false, errNoSuchWorkspace
}

// intoWorkspace puts every row of an own export into one workspace: the
// export's workspaces are neither matched nor created (design D4).
func intoWorkspace(parsed *Parsed, target string, isDefault bool, name string) {
	value := json.RawMessage("null")
	if !isDefault {
		value, _ = json.Marshal(target)
	}
	for i := range parsed.Rows {
		r := &parsed.Rows[i]
		e := r.Entity
		if e == nil {
			continue
		}
		switch r.Kind {
		case KindProject, KindLabel, KindView:
			e["workspace_id"] = value
		case KindTask:
			if _, has := e["workspace_id"]; has || isNull(e["project_id"]) {
				e["workspace_id"] = value
			}
		}
	}
	if len(parsed.Workspaces) > 0 {
		parsed.Notes = append(parsed.Notes, fmt.Sprintf("Everything goes into %s; the export's workspaces are not created.", name))
	}
}

// inTarget reports whether an existing entity is in the import's workspace;
// without a partition every entity is.
func (pl *planner) inTarget(kind string, e opsync.Entity) bool {
	p := pl.st.Partition
	if p == nil {
		return true
	}
	switch kind {
	case KindProject:
		return p.Project(str(e, "id")) == pl.st.Workspace
	case KindTask:
		return p.Task(str(e, "id")) == pl.st.Workspace
	}
	return p.Own(str(e, "workspace_id")) == pl.st.Workspace
}

// fingerprintPlace is the project part of a duplicate fingerprint: a task
// without a project is matched only inside its workspace.
func fingerprintPlace(projectID, workspace string) string {
	if projectID != "" {
		return projectID
	}
	return "ws:" + workspace
}

// stampWorkspace gives the created projects, labels, views and project-less
// tasks of a foreign import the target workspace; the default workspace
// writes nothing, as devices do (design D2).
func (pl *planner) stampWorkspace(changes []change) {
	p := pl.st.Partition
	if p == nil || pl.st.Workspace == "" || pl.st.Workspace == p.Default {
		return
	}
	value := raw(pl.st.Workspace)
	for i := range changes {
		c := &changes[i]
		if !c.created || c.value("workspace_id") != nil {
			continue
		}
		switch c.entity {
		case KindProject, KindLabel, KindView:
		case KindTask:
			if !isNull(c.value("project_id")) {
				continue
			}
		default:
			continue
		}
		c.fields = append(c.fields, field{"workspace_id", value})
	}
}
