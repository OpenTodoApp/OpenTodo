package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Custom fields (OpenSpec change `custom-fields`, design D3). The op log stores
// one `fields.<id>` op field per value; the REST API reads and writes them as
// one `fields` object keyed by definition id. Definitions are the `fields`
// collection. Like sections, the reference rules (live definition of the task's
// project, type conformance, the 30 limit, unique names) are enforced here and
// by the clients, never on the sync path.

// Field types and their limits (spec "Typed values and their limits").
const (
	maxFieldOptions = 50
	maxOptionLen    = 100
	maxFieldName    = 100
)

// foldFieldsInPlace moves a task's `fields.<id>` keys into its `fields` object.
func foldFieldsInPlace(e opsync.Entity) {
	if e == nil {
		return
	}
	folded := opsync.FoldFieldValues(e)
	for _, k := range opsync.FieldValueKeys(e) {
		delete(e, k)
	}
	e["fields"] = folded["fields"]
}

// fieldTree is what the inherited-fields rules read (OpenSpec changes
// inherited-custom-fields and workspace-fields): the projects the user sees,
// every definition, where each project is and the user's workspaces.
type fieldTree struct {
	projects   map[string]opsync.Entity
	defs       []opsync.Entity
	place      *opsync.Partition
	workspaces []opsync.Workspace
}

func (s *Server) loadFieldTree(ctx context.Context, uid string) (fieldTree, error) {
	projects, err := s.sync.List(ctx, uid, "project", false)
	if err != nil {
		return fieldTree{}, err
	}
	defs, err := s.sync.List(ctx, uid, "field", false)
	if err != nil {
		return fieldTree{}, err
	}
	place, err := s.sync.Partition(ctx, uid)
	if err != nil {
		return fieldTree{}, err
	}
	workspaces, err := s.sync.Workspaces(ctx, uid)
	if err != nil {
		return fieldTree{}, err
	}
	return fieldTree{projects: opsync.ProjectsByID(projects), defs: defs, place: place, workspaces: workspaces}, nil
}

// applicable lists the fields that apply to a project: its workspace's
// fields, its ancestors' live definitions, then its own (none for Inbox).
func (t fieldTree) applicable(projectID string) []opsync.Entity {
	return opsync.ApplicableFields(projectID, t.projects, t.defs, t.place)
}

// own lists the live definitions of one project.
func (t fieldTree) own(projectID string) []opsync.Entity {
	var out []opsync.Entity
	for _, d := range t.defs {
		if projectID != "" && idOf(d["project_id"]) == projectID && !d.Deleted() {
			out = append(out, d)
		}
	}
	return out
}

// workspace finds one of the user's workspaces by id.
func (t fieldTree) workspace(id string) (opsync.Workspace, bool) {
	for _, w := range t.workspaces {
		if w.ID == id {
			return w, true
		}
	}
	return opsync.Workspace{}, false
}

// workspaceName is a workspace's name for a message.
func (t fieldTree) workspaceName(id string) string {
	if w, ok := t.workspace(id); ok {
		return w.Name
	}
	return id
}

// inWorkspace lists the live projects of one workspace, sorted by id.
func (t fieldTree) inWorkspace(ws string) []string {
	var out []string
	for id := range t.projects {
		if t.place.Project(id) == ws {
			out = append(out, id)
		}
	}
	sort.Strings(out)
	return out
}

// projectName is a project's name for a message (an encrypted one reads as the placeholder).
func (t fieldTree) projectName(id string) string {
	if p, ok := t.projects[id]; ok {
		return rawStr(p, "name")
	}
	return id
}

// checkTaskFields validates a task body's `fields` object against the live
// definitions of the task's project after the write and replaces it with one
// `fields.<id>` key per value, so fieldOps emits one op per field. A raw
// `fields.<id>` key is refused: clients have one spelling.
func (s *Server) checkTaskFields(ctx context.Context, uid string, body map[string]json.RawMessage, existing opsync.Entity) (string, error) {
	var direct []string
	for k := range body {
		if strings.HasPrefix(k, opsync.FieldValuePrefix) {
			direct = append(direct, k)
		}
	}
	if len(direct) > 0 {
		sort.Strings(direct)
		return fmt.Sprintf("unknown field %q for task: send custom field values in the fields object", direct[0]), nil
	}
	raw, has := body["fields"]
	if !has {
		return "", nil
	}
	delete(body, "fields")
	var values map[string]json.RawMessage
	if string(raw) == "null" || json.Unmarshal(raw, &values) != nil || values == nil {
		return "task.fields must be an object keyed by field id", nil
	}
	if len(values) == 0 {
		return "", nil
	}
	project := idOf(body["project_id"])
	if _, moved := body["project_id"]; !moved && existing != nil {
		project = idOf(existing["project_id"])
	}
	tree, err := s.loadFieldTree(ctx, uid)
	if err != nil {
		return "", err
	}
	byID := map[string]opsync.Entity{}
	for _, d := range tree.applicable(project) {
		byID[idOf(d["id"])] = d
	}
	ids := make([]string, 0, len(values))
	for id := range values {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	for _, id := range ids {
		def, ok := byID[id]
		if _, valid := opsync.FieldValueID(opsync.FieldValuePrefix + id); !ok || !valid {
			return fmt.Sprintf("task.fields: %q is not a field of the task's project, of a project above it or of its workspace", id), nil
		}
		if msg := opsync.CheckFieldValue(def, values[id]); msg != "" {
			return fmt.Sprintf("task.fields: %q (%s) %s", id, rawStr(def, "name"), msg), nil
		}
		body[opsync.FieldValuePrefix+id] = values[id]
	}
	return "", nil
}

func rawStr(e opsync.Entity, field string) string {
	var v string
	_ = json.Unmarshal(e[field], &v)
	return e2ee.Display(v)
}

// checkField validates a field definition create (existing == nil) or patch
// body: a non-empty name unique among the fields that apply ignoring case, a
// known type and either an existing, non-deleted project or a workspace the
// user owns (workspace-fields) on create, options only for a choice field, at
// most MaxFieldsPerProject fields on any project, and project_id,
// workspace_id and type never change.
func (s *Server) checkField(ctx context.Context, uid, id string, body map[string]json.RawMessage, existing opsync.Entity) (string, error) {
	project := idOf(body["project_id"])
	workspace := ""
	typ := ""
	if existing != nil {
		if raw, has := body["project_id"]; has && idOf(raw) != idOf(existing["project_id"]) {
			return "field.project_id cannot change; create a field in the other project instead", nil
		}
		if raw, has := body["workspace_id"]; has && idOf(raw) != idOf(existing["workspace_id"]) {
			return "field.workspace_id cannot change; create a field in the other workspace instead", nil
		}
		if raw, has := body["type"]; has && !opsync.SameJSON(raw, existing["type"]) {
			return "field.type cannot change after creation; create a new field instead", nil
		}
		project = idOf(existing["project_id"])
		if project == "" {
			workspace = idOf(existing["workspace_id"])
		}
		_ = json.Unmarshal(existing["type"], &typ)
	} else {
		workspace = idOf(body["workspace_id"])
		switch {
		case project != "" && workspace != "":
			return "field: give a project_id or a workspace_id, not both", nil
		case project == "" && workspace == "":
			return "field.project_id or field.workspace_id is required", nil
		case project != "":
			p, err := s.sync.Get(ctx, uid, "project", project)
			if err != nil {
				return "", err
			}
			if p == nil || p.Deleted() {
				return fmt.Sprintf("field.project_id references unknown or deleted project %q", project), nil
			}
			delete(body, "workspace_id")
		default:
			list, err := s.sync.Workspaces(ctx, uid)
			if err != nil {
				return "", err
			}
			var ws *opsync.Workspace
			for i := range list {
				if list[i].ID == workspace {
					ws = &list[i]
				}
			}
			if ws == nil {
				return fmt.Sprintf("field.workspace_id references unknown workspace %q", workspace), nil
			}
			if ws.Role != opsync.WorkspaceOwner {
				return "field.workspace_id: only the workspace's owner defines its fields", nil
			}
			// A workspace field has no project: the empty default is never
			// written (an id field refuses "").
			delete(body, "project_id")
		}
		if err := json.Unmarshal(body["type"], &typ); err != nil || !opsync.FieldTypes[typ] {
			return "field.type is required: text, number, date, choice, link or checkbox", nil
		}
		if _, has := body["options"]; !has {
			body["options"] = json.RawMessage(`""`)
		}
	}
	name := ""
	if raw, has := body["name"]; has || existing == nil {
		if err := json.Unmarshal(raw, &name); has && err != nil {
			return "", nil // type errors are reported by the op schema
		}
		name = strings.TrimSpace(name)
		if name == "" {
			return "field.name must not be empty", nil
		}
		if utf8.RuneCountInString(name) > maxFieldName {
			return fmt.Sprintf("field.name must be at most %d characters", maxFieldName), nil
		}
	}
	if raw, has := body["options"]; has {
		var options string
		if err := json.Unmarshal(raw, &options); err != nil {
			return "", nil
		}
		list := opsync.FieldOptions(options)
		switch {
		case typ != "choice" && len(list) > 0:
			return "field.options are only for choice fields", nil
		case len(list) > maxFieldOptions:
			return fmt.Sprintf("field.options: at most %d options", maxFieldOptions), nil
		}
		for _, o := range list {
			if utf8.RuneCountInString(o) > maxOptionLen {
				return fmt.Sprintf("field.options: each option has at most %d characters", maxOptionLen), nil
			}
		}
	}
	tree, err := s.loadFieldTree(ctx, uid)
	if err != nil {
		return "", err
	}
	if project == "" {
		if workspace == "" {
			workspace = tree.place.Default
		}
		return tree.checkWorkspace(workspace, id, name, existing == nil), nil
	}
	return tree.check(project, id, name, existing == nil), nil
}

// checkWorkspace applies the rules of a workspace to a workspace field create
// or rename (workspace-fields "Names and limits across a workspace"): the 30
// limit for every project of the workspace, and a name unique, ignoring case,
// among the workspace's fields and every own field of its projects.
func (t fieldTree) checkWorkspace(ws, id, name string, create bool) string {
	projects := t.inWorkspace(ws)
	if create {
		if len(opsync.WorkspaceFields(ws, t.place, t.defs)) >= opsync.MaxFieldsPerProject {
			return fmt.Sprintf("a workspace can have at most %d fields", opsync.MaxFieldsPerProject)
		}
		for _, pid := range projects {
			if len(t.applicable(pid)) >= opsync.MaxFieldsPerProject {
				return fmt.Sprintf("the project %q would have more than %d fields", t.projectName(pid), opsync.MaxFieldsPerProject)
			}
		}
	}
	if name == "" {
		return ""
	}
	for _, d := range opsync.WorkspaceFields(ws, t.place, t.defs) {
		if other, clash := sameFieldName(d, id, name); clash {
			return fmt.Sprintf("field.name: the workspace already has a field named %q", other)
		}
	}
	for _, pid := range projects {
		for _, d := range t.own(pid) {
			if other, clash := sameFieldName(d, id, name); clash {
				return fmt.Sprintf("field.name: the project %q already has a field named %q", t.projectName(pid), other)
			}
		}
	}
	return ""
}

// sameFieldName reports whether another definition than id has name, ignoring
// case, and returns its name.
func sameFieldName(d opsync.Entity, id, name string) (string, bool) {
	var other string
	_ = json.Unmarshal(d["name"], &other)
	return other, idOf(d["id"]) != id && strings.EqualFold(strings.TrimSpace(other), name)
}

// check applies the rules of a project tree to a field create or rename
// (inherited-custom-fields "Names and limits across a project tree"): the 30
// limit counts inherited and workspace fields, for the project and every sub-project below
// it; a name is unique, ignoring case, among the fields that apply to the
// project and the own fields of every sub-project. Encrypted names cannot be
// compared here; the clients check those.
func (t fieldTree) check(project, id, name string, create bool) string {
	below := opsync.FieldDescendants(project, t.projects)
	if create {
		if len(t.applicable(project)) >= opsync.MaxFieldsPerProject {
			return fmt.Sprintf("a project can have at most %d fields, inherited ones included", opsync.MaxFieldsPerProject)
		}
		for _, pid := range below {
			if len(t.applicable(pid)) >= opsync.MaxFieldsPerProject {
				return fmt.Sprintf("the sub-project %q would have more than %d fields", t.projectName(pid), opsync.MaxFieldsPerProject)
			}
		}
	}
	if name == "" {
		return ""
	}
	same := func(d opsync.Entity) (string, bool) { return sameFieldName(d, id, name) }
	for _, d := range t.applicable(project) {
		other, clash := same(d)
		if !clash {
			continue
		}
		if opsync.IsWorkspaceField(d) {
			return fmt.Sprintf("field.name: the project already has a field named %q from the workspace %q", other, t.workspaceName(opsync.FieldWorkspace(d, t.place)))
		}
		if owner := idOf(d["project_id"]); owner != project {
			return fmt.Sprintf("field.name: the project already inherits a field named %q from %q", other, t.projectName(owner))
		}
		return fmt.Sprintf("field.name: the project already has a field named %q", other)
	}
	for _, pid := range below {
		for _, d := range t.own(pid) {
			if other, clash := same(d); clash {
				return fmt.Sprintf("field.name: the sub-project %q already has a field named %q", t.projectName(pid), other)
			}
		}
	}
	return ""
}
