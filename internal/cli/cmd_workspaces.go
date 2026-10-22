package cli

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
)

// Workspaces (OpenSpec change workspaces, cli-client "Configuration file and
// profiles"): `ot workspaces` lists them, and every command acts on one
// workspace, chosen by --workspace, then OPENTODO_WORKSPACE, then the
// profile's workspace, else the account's default workspace. Placement follows
// the partition rule of internal/sync (testdata/workspaces_fixture.json).

// workspaceEntry is a workspace as GET /api/v1/workspaces returns it.
type workspaceEntry struct {
	ID      string          `json:"id"`
	Name    string          `json:"name"`
	Role    string          `json:"role"`
	Default bool            `json:"default"`
	Raw     json.RawMessage `json:"-"`
}

func (c *client) workspaces(ctx context.Context) ([]workspaceEntry, error) {
	var out struct {
		Workspaces []json.RawMessage `json:"workspaces"`
	}
	if err := c.getJSON(ctx, "/workspaces", &out); err != nil {
		return nil, err
	}
	list := make([]workspaceEntry, 0, len(out.Workspaces))
	for _, raw := range out.Workspaces {
		var w workspaceEntry
		if err := json.Unmarshal(raw, &w); err != nil {
			return nil, serverErr("unexpected workspace shape: %v", err)
		}
		w.Raw = raw
		list = append(list, w)
	}
	return list, nil
}

// wsScope is the workspace one command acts on.
type wsScope struct {
	id, def string
	known   map[string]bool
	name    string
}

// workspaceChoice is the workspace the user asked for, "" for the default.
func (a *App) workspaceChoice(g *globalFlags, t target) string {
	if g.workspace != "" {
		return g.workspace
	}
	if v := strings.TrimSpace(a.Getenv("OPENTODO_WORKSPACE")); v != "" {
		return v
	}
	return t.Workspace
}

// resolveWorkspace matches choice (id or name, ignoring case) against list;
// an unknown name is a usage error listing the workspaces (exit 2).
func resolveWorkspace(list []workspaceEntry, choice string) (*wsScope, error) {
	s := &wsScope{known: map[string]bool{}}
	for _, w := range list {
		s.known[w.ID] = true
		if w.Default {
			s.def = w.ID
			s.id, s.name = w.ID, w.Name
		}
	}
	if choice == "" {
		return s, nil
	}
	for _, w := range list {
		if w.ID == choice || strings.EqualFold(w.Name, choice) {
			s.id, s.name = w.ID, w.Name
			return s, nil
		}
	}
	names := make([]string, 0, len(list))
	for _, w := range list {
		names = append(names, w.Name)
	}
	sort.Strings(names)
	return nil, &exitError{code: ExitUsage, jsonCode: "unknown_workspace",
		msg: fmt.Sprintf("unknown workspace %q; your workspaces are %s (see `ot workspaces`)", choice, strings.Join(names, ", "))}
}

// scope loads the account's workspaces and resolves the command's one.
func (a *App) scope(ctx context.Context, c *client, g *globalFlags, t target) (*wsScope, error) {
	list, err := c.workspaces(ctx)
	var ee *exitError
	if errors.As(err, &ee) && ee.jsonCode == "not_found" && a.workspaceChoice(g, t) == "" {
		// A server from before workspaces: one list, nothing to narrow.
		return &wsScope{known: map[string]bool{}}, nil
	}
	if err != nil {
		return nil, err
	}
	return resolveWorkspace(list, a.workspaceChoice(g, t))
}

// own maps a stored workspace_id onto a workspace: empty, unknown or foreign
// ids read as the default.
func (s *wsScope) own(id *string) string {
	if id != nil && s.known[*id] {
		return *id
	}
	return s.def
}

// project is the workspace of project id: its root ancestor's own value.
func (s *wsScope) project(byID map[string]project, id string) string {
	p, ok := byID[id]
	if !ok {
		return s.def
	}
	for i := 0; i < 64 && p.ParentID != nil && *p.ParentID != ""; i++ {
		parent, ok := byID[*p.ParentID]
		if !ok {
			break
		}
		p = parent
	}
	return s.own(p.WorkspaceID)
}

// task is the workspace of a task: its project's, else its parent task's, else its own.
func (s *wsScope) task(byID map[string]project, tasks map[string]task, t task) string {
	for i := 0; i < 64; i++ {
		if t.ProjectID != nil && *t.ProjectID != "" {
			if _, ok := byID[*t.ProjectID]; ok {
				return s.project(byID, *t.ProjectID)
			}
		}
		if t.ParentID == nil || *t.ParentID == "" {
			break
		}
		parent, ok := tasks[*t.ParentID]
		if !ok {
			break
		}
		t = parent
	}
	return s.own(t.WorkspaceID)
}

// writeValue is the workspace_id a new project-less task or project gets: null
// (absent) in the default workspace.
func (s *wsScope) writeValue() (string, bool) {
	if s == nil || s.id == "" || s.id == s.def {
		return "", false
	}
	return s.id, true
}

// filterTasks keeps the tasks of the scope's workspace.
func (s *wsScope) filterTasks(projects []project, all, list []task) []task {
	byID := make(map[string]project, len(projects))
	for _, p := range projects {
		byID[p.ID] = p
	}
	byTask := make(map[string]task, len(all))
	for _, t := range all {
		byTask[t.ID] = t
	}
	out := list[:0:0]
	for _, t := range list {
		if s.task(byID, byTask, t) == s.id {
			out = append(out, t)
		}
	}
	return out
}

func cmdWorkspaces(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("workspaces", g)
	pos, err := a.parse(g, fs, "workspaces", args)
	if err != nil {
		return a.helpOr("workspaces", err)
	}
	if len(pos) > 0 {
		return usageErr("workspaces takes no arguments (got %q)", pos[0])
	}
	c, t, err := a.connect(g)
	if err != nil {
		return err
	}
	list, err := c.workspaces(ctx)
	if err != nil {
		return err
	}
	current, err := resolveWorkspace(list, a.workspaceChoice(g, t))
	if err != nil {
		return err
	}
	if g.json {
		raws := make([]json.RawMessage, 0, len(list))
		for _, w := range list {
			raws = append(raws, w.Raw)
		}
		return a.printRawList(raws)
	}
	tbl := newTable("ID", "NAME", "ROLE", "")
	for _, w := range list {
		mark := ""
		switch {
		case w.ID == current.id && w.Default:
			mark = "default, current"
		case w.ID == current.id:
			mark = "current"
		case w.Default:
			mark = "default"
		}
		tbl.add(cell{text: shortID(w.ID), style: styleCyan}, plain(w.Name), plain(w.Role), cell{text: mark, style: styleDim})
	}
	tbl.render(a.Stdout, a.color())
	return nil
}
