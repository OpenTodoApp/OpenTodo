package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/pixari/opentodo/internal/e2ee"
	opsync "github.com/pixari/opentodo/internal/sync"
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

// fieldDefs lists the live definitions of a project.
func (s *Server) fieldDefs(ctx context.Context, uid, projectID string) ([]opsync.Entity, error) {
	if projectID == "" {
		return nil, nil
	}
	all, err := s.sync.List(ctx, uid, "field", false)
	if err != nil {
		return nil, err
	}
	var out []opsync.Entity
	for _, f := range all {
		if idOf(f["project_id"]) == projectID {
			out = append(out, f)
		}
	}
	return out, nil
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
	defs, err := s.fieldDefs(ctx, uid, project)
	if err != nil {
		return "", err
	}
	byID := map[string]opsync.Entity{}
	for _, d := range defs {
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
			return fmt.Sprintf("task.fields: %q is not a field of the task's project", id), nil
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
// body: a non-empty name unique in its project ignoring case, a known type and
// an existing, non-deleted project on create, options only for a choice field,
// at most MaxFieldsPerProject live definitions, and project_id and type never
// change.
func (s *Server) checkField(ctx context.Context, uid, id string, body map[string]json.RawMessage, existing opsync.Entity) (string, error) {
	project := idOf(body["project_id"])
	typ := ""
	if existing != nil {
		if raw, has := body["project_id"]; has && idOf(raw) != idOf(existing["project_id"]) {
			return "field.project_id cannot change; create a field in the other project instead", nil
		}
		if raw, has := body["type"]; has && !opsync.SameJSON(raw, existing["type"]) {
			return "field.type cannot change after creation; create a new field instead", nil
		}
		project = idOf(existing["project_id"])
		_ = json.Unmarshal(existing["type"], &typ)
	} else {
		if project == "" {
			return "field.project_id is required", nil
		}
		p, err := s.sync.Get(ctx, uid, "project", project)
		if err != nil {
			return "", err
		}
		if p == nil || p.Deleted() {
			return fmt.Sprintf("field.project_id references unknown or deleted project %q", project), nil
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
	defs, err := s.fieldDefs(ctx, uid, project)
	if err != nil {
		return "", err
	}
	if existing == nil && len(defs) >= opsync.MaxFieldsPerProject {
		return fmt.Sprintf("a project can have at most %d fields", opsync.MaxFieldsPerProject), nil
	}
	if name != "" {
		for _, d := range defs {
			if idOf(d["id"]) == id {
				continue
			}
			var other string
			_ = json.Unmarshal(d["name"], &other)
			if strings.EqualFold(strings.TrimSpace(other), name) {
				return fmt.Sprintf("field.name: the project already has a field named %q", other), nil
			}
		}
	}
	return "", nil
}
