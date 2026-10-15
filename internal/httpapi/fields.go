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

// Custom fields (OpenSpec change `custom-fields`, design D3). A task's values
// are stored as one "fields.<id>" field per definition so each converges on its
// own; REST shows and accepts them as one `fields` object keyed by definition
// id. The definition and type rules are enforced here, never on the sync path
// (a value and its definition may arrive in any order there).

// Limits shared with web/src/lib/fields.ts.
const (
	maxFieldsPerProject = 30
	maxFieldNameLength  = 60
	maxFieldOptions     = 50
	maxFieldOptionLen   = 100
)

var fieldTypes = map[string]bool{"text": true, "number": true, "date": true, "choice": true, "link": true, "checkbox": true}

// foldFields moves a task's "fields.<id>" entries into a `fields` object, so a
// read never carries the per-field keys and always carries the object.
func foldFields(list ...opsync.Entity) {
	for _, e := range list {
		if e == nil {
			continue
		}
		values := map[string]json.RawMessage{}
		for k, v := range e {
			if id, ok := strings.CutPrefix(k, opsync.FieldValuePrefix); ok {
				values[id] = v
				delete(e, k)
			}
		}
		raw, _ := json.Marshal(values)
		e["fields"] = raw
	}
}

// checkFields dispatches the custom field rules of the entity being written.
// For a task it also unfolds the `fields` object into "fields.<id>" keys.
func (s *Server) checkFields(ctx context.Context, uid, entity, id string, body map[string]json.RawMessage, existing opsync.Entity) (string, error) {
	switch entity {
	case "field":
		return s.checkField(ctx, uid, id, body, existing)
	case "task":
		return s.checkTaskFields(ctx, uid, body, existing)
	}
	return "", nil
}

// checkTaskFields validates a task body's `fields` object against the live
// definitions of the task's project after the write, normalizes each value and
// replaces the object with one "fields.<id>" key per entry. A raw
// "fields.<id>" key is refused so the object is the only way in.
func (s *Server) checkTaskFields(ctx context.Context, uid string, body map[string]json.RawMessage, existing opsync.Entity) (string, error) {
	for k := range body {
		if strings.HasPrefix(k, opsync.FieldValuePrefix) {
			return fmt.Sprintf("task.%s: send custom field values as a fields object keyed by field id", k), nil
		}
	}
	raw, has := body["fields"]
	if !has {
		return "", nil
	}
	var values map[string]json.RawMessage
	if err := json.Unmarshal(raw, &values); err != nil || values == nil {
		return "task.fields must be an object keyed by field id", nil
	}
	project := idOf(body["project_id"])
	if _, has := body["project_id"]; !has && existing != nil {
		project = idOf(existing["project_id"])
	}
	ids := make([]string, 0, len(values))
	for id := range values {
		ids = append(ids, id)
	}
	sort.Strings(ids) // the first error is stable
	out := make(map[string]json.RawMessage, len(values))
	for _, id := range ids {
		def, err := s.sync.Get(ctx, uid, "field", id)
		if err != nil {
			return "", err
		}
		if def == nil || def.Deleted() || project == "" || idOf(def["project_id"]) != project {
			return fmt.Sprintf("task.fields.%s: no field with this id in the task's project", id), nil
		}
		v, msg := opsync.CheckFieldValue(def, values[id])
		if msg != "" {
			var name string
			_ = json.Unmarshal(def["name"], &name)
			return fmt.Sprintf("task.fields.%s (%s): %s", id, e2ee.Display(name), msg), nil
		}
		out[opsync.FieldValuePrefix+id] = v
	}
	delete(body, "fields")
	for k, v := range out {
		body[k] = v
	}
	return "", nil
}

// checkField validates a definition create (existing == nil) or patch: a name,
// a known type and an existing, non-deleted project on create; type and project
// never change; options only on a choice field; at most 30 live definitions per
// project, names unique within it ignoring case.
func (s *Server) checkField(ctx context.Context, uid, id string, body map[string]json.RawMessage, existing opsync.Entity) (string, error) {
	str := func(raw json.RawMessage) (string, bool) {
		var v string
		return v, json.Unmarshal(raw, &v) == nil
	}
	var project, typ string
	if existing != nil {
		project = idOf(existing["project_id"])
		typ, _ = str(existing["type"])
		if raw, has := body["project_id"]; has && idOf(raw) != project {
			return "field.project_id cannot change; create the field in the other project instead", nil
		}
		if raw, has := body["type"]; has {
			if t, _ := str(raw); t != typ {
				return "field.type cannot change; create a new field instead", nil
			}
		}
	} else {
		var ok bool
		if typ, ok = str(body["type"]); !ok || !fieldTypes[typ] {
			return "field.type is required: text, number, date, choice, link or checkbox", nil
		}
		if project = idOf(body["project_id"]); project == "" {
			return "field.project_id is required", nil
		}
		p, err := s.sync.Get(ctx, uid, "project", project)
		if err != nil {
			return "", err
		}
		if p == nil || p.Deleted() {
			return fmt.Sprintf("field.project_id references unknown or deleted project %q", project), nil
		}
		if _, has := body["name"]; !has {
			return "field.name must not be empty", nil
		}
		if _, has := body["options"]; !has {
			body["options"] = json.RawMessage(`""`)
		}
	}
	if raw, has := body["options"]; has {
		options, ok := str(raw)
		if !ok {
			return "", nil // type errors are reported by the op schema
		}
		if !e2ee.IsCiphertext(options) {
			list := opsync.FieldOptions(options)
			if typ != "choice" && len(list) > 0 {
				return "field.options: only a choice field has options", nil
			}
			if len(list) > maxFieldOptions {
				return fmt.Sprintf("field.options: a choice field has at most %d options", maxFieldOptions), nil
			}
			seen := map[string]bool{}
			for _, o := range list {
				if utf8.RuneCountInString(o) > maxFieldOptionLen {
					return fmt.Sprintf("field.options: an option has at most %d characters", maxFieldOptionLen), nil
				}
				if seen[strings.ToLower(o)] {
					return fmt.Sprintf("field.options: %q is listed twice", o), nil
				}
				seen[strings.ToLower(o)] = true
			}
			norm, _ := json.Marshal(strings.Join(list, "\n"))
			body["options"] = norm
		}
	}
	all, err := s.sync.List(ctx, uid, "field", false)
	if err != nil {
		return "", err
	}
	var siblings []opsync.Entity
	for _, f := range all {
		if idOf(f["project_id"]) == project && idOf(f["id"]) != id {
			siblings = append(siblings, f)
		}
	}
	if existing == nil && len(siblings) >= maxFieldsPerProject {
		return fmt.Sprintf("a project has at most %d fields", maxFieldsPerProject), nil
	}
	if raw, has := body["name"]; has {
		name, ok := str(raw)
		if !ok {
			return "", nil
		}
		if e2ee.IsCiphertext(name) {
			return "", nil
		}
		name = strings.TrimSpace(name)
		if name == "" {
			return "field.name must not be empty", nil
		}
		if utf8.RuneCountInString(name) > maxFieldNameLength {
			return fmt.Sprintf("field.name has at most %d characters", maxFieldNameLength), nil
		}
		for _, f := range siblings {
			if other, _ := str(f["name"]); strings.EqualFold(strings.TrimSpace(other), name) {
				return fmt.Sprintf("field.name: this project already has a field named %q", name), nil
			}
		}
		body["name"], _ = json.Marshal(name)
	}
	return "", nil
}
