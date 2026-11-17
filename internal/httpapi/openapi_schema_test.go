package httpapi

import (
	"go/ast"
	"go/parser"
	gotoken "go/token"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// The types of the OpenAPI description (OpenSpec change openapi-description,
// design D2): the v1 surface's field types as JSON Schema 2020-12, the op kinds
// as named component schemas, and request and response bodies built from the
// surface's JSON paths ("tasks[].title").

type schema = map[string]any

// ref is a JSON reference to a component schema.
func ref(name string) schema { return schema{"$ref": "#/components/schemas/" + name} }

// nullable adds null to a schema: a type list, or anyOf for a reference.
func nullable(s schema) schema {
	if t, ok := s["type"].(string); ok {
		out := schema{}
		for k, v := range s {
			out[k] = v
		}
		out["type"] = []any{t, "null"}
		return out
	}
	return schema{"anyOf": []any{s, schema{"type": "null"}}}
}

// kindSchemas maps every op kind name (internal/sync kindnames.go) to its
// schema. The compound shapes are component schemas (kindComponents).
var kindSchemas = map[string]schema{
	"string":           {"type": "string"},
	"id":               {"type": "string", "description": "An id: a UUID, or for some entities a name-based id."},
	"clock":            {"type": "string", "description": "A wall-clock time, HH:MM.", "pattern": `^\d{2}:\d{2}$`},
	"weekdays":         {"type": "string", "description": "Weekdays as a string of ISO weekday numbers (1 Monday … 7 Sunday)."},
	"energy":           {"type": "string", "description": "The energy a task needs: \"\", low, medium or high."},
	"sector":           {"type": "string", "description": "A time sector: \"\", a week (2026-W45), a month (2026-11) or a quarter (2026-Q4)."},
	"objective_title":  {"type": "string"},
	"objective_period": {"type": "string", "description": "An objective's period: a quarter (2026-Q4), a month or a year."},
	"memory_text":      {"type": "string"},
	"doc":              {"type": "string", "description": "A mergeable notes document (\"ydoc:v1:…\"), see docs/sync.md \"Mergeable documents\". Write `description` (Markdown) instead unless you merge documents yourself."},
	"nullable_string":  {"type": []any{"string", "null"}},
	"nullable_text":    {"type": []any{"string", "null"}},
	"recurrence":       {"type": []any{"string", "null"}, "description": "A repeat rule in English, such as \"every weekday\" (docs/recurrence.md)."},
	"date":             {"type": []any{"string", "null"}, "format": "date", "description": "A calendar date, YYYY-MM-DD."},
	"start":            {"type": []any{"string", "null"}, "format": "date", "description": "The date a task starts, YYYY-MM-DD."},
	"day_part":         {"type": []any{"string", "null"}, "description": "The part of the day: morning, afternoon, or null (the evening is the `evening` flag)."},
	"number":           {"type": "number"},
	"focus_session":    {"type": "number"},
	"nullable_number":  {"type": []any{"number", "null"}},
	"positive_int":     {"type": []any{"integer", "null"}, "minimum": 1},
	"offset_minutes":   {"type": []any{"integer", "null"}, "description": "Minutes relative to the due time (negative: before)."},
	"instant":          {"type": []any{"integer", "null"}, "description": "A point in time in Unix milliseconds."},
	"radius":           {"type": []any{"number", "null"}, "description": "A radius in metres."},
	"bool":             {"type": "boolean"},
	"priority":         {"type": "integer", "enum": []any{1, 2, 3, 4}, "description": "1 is the highest, 4 the default."},
	"string_list":      {"type": "array", "items": schema{"type": "string"}},
	"id_list":          {"type": "array", "items": schema{"type": "string"}, "description": "A list of ids."},
	"order_list":       {"type": "array", "items": schema{"type": "string"}, "description": "Ids in their display order."},
	"reminder_kind":    {"type": "string", "enum": []any{"relative", "absolute", "deadline", "arrive", "leave"}},
	"due":              nullable(ref("Due")),
	"origin":           {"anyOf": []any{ref("Origin"), schema{"type": "string", "description": "Ciphertext on an end-to-end encrypted account."}, schema{"type": "null"}}},
	"location":         {"anyOf": []any{ref("Location"), schema{"type": "string", "description": "Ciphertext on an end-to-end encrypted account."}, schema{"type": "null"}}},
	"geo":              {"anyOf": []any{ref("Geo"), schema{"type": "string", "description": "Ciphertext on an end-to-end encrypted account."}, schema{"type": "null"}}},
	"split":            nullable(ref("SplitFrom")),
	"field_value":      {"description": "A custom field's value: text, link, date (YYYY-MM-DD) and choice are strings, numbers and checkboxes their JSON types; null clears it."},
	"rule":             {"description": "A section's on-drop rule (docs/sync.md)."},
	"rule_trigger":     {"description": "An automation rule's trigger (docs/automations.md)."},
	"rule_condition":   {"description": "An automation rule's condition (docs/automations.md)."},
	"rule_actions":     {"description": "An automation rule's actions (docs/automations.md)."},
	"routine_steps":    {"description": "A routine's steps (docs/routines.md)."},
	"reactions":        {"description": "A comment's reactions: emoji to the ids of the people who reacted."},
	"theme_doc":        {"description": "A theme document (docs/themes.md)."},
}

// kindComponents are the compound value shapes the kinds refer to.
var kindComponents = map[string]schema{
	"Due": {"type": "object", "required": []any{"date"}, "description": "When a task is due: floating (the viewer's day) unless `tz` is set.", "properties": schema{
		"date": schema{"type": "string", "format": "date", "description": "YYYY-MM-DD."},
		"time": schema{"type": "string", "pattern": `^\d{2}:\d{2}$`, "description": "Optional wall-clock time, HH:MM."},
		"tz":   schema{"type": "string", "description": "Optional IANA time zone, only with `time`: the due is then the instant `date time` in that zone."},
	}},
	"Location": {"type": "object", "properties": schema{
		"name": schema{"type": "string"}, "address": schema{"type": "string"},
		"lat": schema{"type": "number"}, "lon": schema{"type": "number"}, "place_id": schema{"type": "string"},
	}},
	"Geo": {"type": "object", "required": []any{"lat", "lon"}, "properties": schema{"lat": schema{"type": "number"}, "lon": schema{"type": "number"}}},
	"Origin": {"type": "object", "required": []any{"kind"}, "description": "Where a task came from (docs/api.md \"Task fields\").", "properties": schema{
		"kind": schema{"type": "string"}, "provider": schema{"type": "string"}, "id": schema{"type": "string"},
		"url": schema{"type": "string", "format": "uri"}, "title": schema{"type": "string"},
	}},
	"SplitFrom": {"type": "object", "required": []any{"series", "date"}, "properties": schema{
		"series": schema{"type": "string"}, "date": schema{"type": "string", "format": "date"},
	}},
}

// fieldSchemas are the types of fieldTypes that are not op kinds.
var fieldSchemas = map[string]schema{
	// rules.StepPreview.Preview: runState.preview of a ruleval.Value.
	"step_preview": {"description": "A preview of the step's output, by its type: text and a date are a string, lines a list of strings, a number a number, " +
		"a task or a note {id, title}, a project {id, name}, tasks or notes a list of {id, title}.",
		"anyOf": []any{
			schema{"type": "string"}, schema{"type": "number"},
			schema{"type": "array", "items": schema{"type": "string"}},
			schema{"type": "object", "additionalProperties": schema{"type": "string"}},
			schema{"type": "array", "items": schema{"type": "object", "additionalProperties": schema{"type": "string"}}},
		}},
	// auth.PendingMember, for a project's or workspace's owner and admins.
	"pending_members": {"type": "array", "description": "The open invitations, shown to the owner and admins.", "items": schema{"type": "object", "properties": schema{
		"id": schema{"type": "string"}, "email": schema{"type": "string"}, "role": schema{"type": "string"}, "invitedBy": schema{"type": "string"},
		"createdAt": schema{"type": "number"}, "expiresAt": schema{"type": "number"},
	}}},
	// opsync.PendingAppend.
	"pending_appends": {"type": "array", "description": "Appends not yet merged into the body, oldest first.", "items": schema{"type": "object", "properties": schema{
		"id": schema{"type": "string"}, "text": schema{"type": "string"},
	}}},
}

// fieldTypes are the fields the static analysis sees as `any` (an interface
// value, set or left nil) or only as a list (observed on a running server, an
// empty list), with the type read from the code that sets them. A field named
// here gets the type while its analysed type is `when`.
var fieldTypes = map[string]struct{ when, typ string }{
	// membersView and workspaceView.
	"pending": {"any", "pending_members"},
	// handleAuditList: the next page's cursor, null on the last page.
	"cursor": {"any", "number|null"},
	// projectAgentAccess: the id of the ancestor project it is kept away by.
	"inherited_from": {"any", "string|null"},
	// microsoftClientView: when Microsoft refused the client, Unix ms.
	"refused_at": {"any", "number|null"},
	// A new public link: auth.PublicLink.LastUsedAt, null until first used.
	"lastUsedAt": {"any", "number|null"},
	"preview":    {"any", "step_preview"},
	// A task's or note's row (observedRowMembers sees an empty list).
	"appends": {"array", "pending_appends"},
}

// routeFieldTypes are fieldTypes for one route, where its answers differ:
// adding a member answers the project or workspace (201), inviting one
// {pending: true} (202, inviteMember).
var routeFieldTypes = map[string]map[string]string{
	"POST /api/v1/projects/{id}/members":   {"pending": "boolean|pending_members"},
	"POST /api/v1/workspaces/{id}/members": {"pending": "boolean|pending_members"},
}

// withFieldTypes gives a route's fields the types of fieldTypes.
func withFieldTypes(route string, fields map[string]any) map[string]any {
	out := make(map[string]any, len(fields))
	for k, v := range fields {
		out[k] = v
		typ, _ := v.(string)
		bare, optional := strings.CutSuffix(typ, "?")
		ft, ok := fieldTypes[k[strings.LastIndex(k, ".")+1:]]
		if !ok || bare != ft.when {
			continue
		}
		if t, ok := routeFieldTypes[route][k]; ok {
			ft.typ = t
		}
		if optional {
			ft.typ += "?"
		}
		out[k] = ft.typ
	}
	return out
}

// typeSchema is the schema of one surface field type: a kind name, a JSON
// type ("string", "boolean", "object", "array", "any"), "nullable_<kind>", or
// a union such as "string|null". It reports whether the type is known.
func typeSchema(typ string) (schema, bool) {
	if s, ok := kindSchemas[typ]; ok {
		return copySchema(s), true
	}
	switch typ {
	case "boolean":
		return schema{"type": "boolean"}, true
	case "object":
		return schema{"type": "object"}, true
	case "array":
		return schema{"type": "array", "items": schema{}}, true
	case "any", "":
		return schema{}, false
	}
	if s, ok := fieldSchemas[typ]; ok {
		return copySchema(s), true
	}
	if elem, ok := strings.CutSuffix(typ, "[]"); ok {
		items, known := typeSchema(elem)
		return schema{"type": "array", "items": items}, known
	}
	if parts := strings.Split(typ, "|"); len(parts) > 1 {
		var types []any
		var rest []any
		for _, p := range parts {
			if p == "null" {
				types = append(types, "null")
				continue
			}
			s, ok := typeSchema(p)
			if t, plain := s["type"].(string); ok && plain && len(s) == 1 {
				types = append(types, t)
			} else {
				rest = append(rest, s)
			}
		}
		if len(rest) == 0 {
			return schema{"type": types}, true
		}
		for _, t := range types {
			rest = append(rest, schema{"type": t})
		}
		return schema{"anyOf": rest}, true
	}
	return schema{}, false
}

func copySchema(s schema) schema {
	out := schema{}
	for k, v := range s {
		out[k] = v
	}
	return out
}

// bodyNode is one object or array in a body being built from JSON paths.
type bodyNode struct {
	typ      string // the surface type of the node itself, if listed
	optional bool
	children map[string]*bodyNode
	array    bool   // the path continued with "[]": an array of the children
	elem     string // the type of a list's elements ("tags[]"), when they are not objects
}

// buildBody turns a surface field set into a schema. In a request, a field
// without "?" is required; a response lists its fields without requiring them.
// It returns the number of fields whose type is unknown.
func buildBody(fields map[string]any, request bool) (schema, int) {
	root := &bodyNode{children: map[string]*bodyNode{}}
	keys := make([]string, 0, len(fields))
	for k := range fields {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, path := range keys {
		typ, _ := fields[path].(string)
		n := root
		segs := strings.Split(path, ".")
		for i, seg := range segs {
			name, isArray := strings.CutSuffix(seg, "[]")
			if name == "(type)" {
				break
			}
			child := n.children[name]
			if child == nil {
				child = &bodyNode{children: map[string]*bodyNode{}}
				n.children[name] = child
			}
			if isArray {
				child.array = true
			}
			switch {
			case i == len(segs)-1 && isArray:
				child.elem = strings.TrimSuffix(typ, "?")
			case i == len(segs)-1:
				child.typ, child.optional = strings.CutSuffix(typ, "?")
			}
			n = child
		}
	}
	unknown := 0
	return root.schema(request, &unknown), unknown
}

func (n *bodyNode) schema(request bool, unknown *int) schema {
	if len(n.children) == 0 {
		s, ok := typeSchema(n.typ)
		if !ok {
			*unknown++
		}
		return s
	}
	obj := schema{"type": "object"}
	props := schema{}
	var required []any
	names := make([]string, 0, len(n.children))
	for k := range n.children {
		names = append(names, k)
	}
	sort.Strings(names)
	for _, name := range names {
		c := n.children[name]
		cs := c.schema(request, unknown)
		if c.array && len(c.children) > 0 {
			cs = schema{"type": "array", "items": cs}
		} else if c.array {
			items, ok := typeSchema(c.elem)
			if !ok {
				*unknown++
			}
			cs = schema{"type": "array", "items": items}
		}
		if strings.Contains(c.typ, "null") && len(c.children) > 0 {
			cs = nullable(cs)
		}
		props[name] = cs
		if request && !c.optional {
			required = append(required, name)
		}
	}
	obj["properties"] = props
	if len(required) > 0 {
		obj["required"] = required
	}
	return obj
}

// entityName is an entity's component schema name: "time_entry" → "TimeEntry".
func entityName(entity string) string {
	var b strings.Builder
	for _, p := range strings.Split(entity, "_") {
		if p != "" {
			b.WriteString(strings.ToUpper(p[:1]) + p[1:])
		}
	}
	return b.String()
}

// entitySchemas are the synced entities of the REST collections as component
// schemas, each field described with its comment in internal/sync/ops.go.
func entitySchemas(t *testing.T) map[string]schema {
	t.Helper()
	docs := opFieldDocs(t)
	kinds := opsync.SchemaKinds()
	out := map[string]schema{}
	for _, entity := range opsync.Plural {
		props := schema{"id": schema{"type": "string", "description": "The " + strings.ReplaceAll(entity, "_", " ") + "'s id."}}
		for f, k := range kinds[entity] {
			s := copySchema(kindSchemas[k])
			if d := docs[entity+"."+f]; d != "" {
				s["description"] = d
			}
			props[f] = s
		}
		e := schema{"type": "object", "required": []any{"id"}, "properties": props}
		if d := docs[entity]; d != "" {
			e["description"] = d
		}
		out[entityName(entity)] = e
	}
	return out
}

// opFieldDocs reads the comments of Schema in internal/sync/ops.go: "entity"
// and "entity.field" to their text.
func opFieldDocs(t *testing.T) map[string]string {
	t.Helper()
	fset := gotoken.NewFileSet()
	f, err := parser.ParseFile(fset, filepath.Join("..", "sync", "ops.go"), nil, parser.ParseComments)
	if err != nil {
		t.Fatal(err)
	}
	cmap := ast.NewCommentMap(fset, f, f.Comments)
	text := func(n ast.Node) string {
		var parts []string
		for _, g := range cmap[n] {
			parts = append(parts, strings.Join(strings.Fields(g.Text()), " "))
		}
		return strings.Join(parts, " ")
	}
	out := map[string]string{}
	ast.Inspect(f, func(n ast.Node) bool {
		vs, ok := n.(*ast.ValueSpec)
		if !ok || len(vs.Names) != 1 || vs.Names[0].Name != "Schema" || len(vs.Values) != 1 {
			return true
		}
		lit, _ := vs.Values[0].(*ast.CompositeLit)
		if lit == nil {
			return false
		}
		for _, el := range lit.Elts {
			kv, _ := el.(*ast.KeyValueExpr)
			if kv == nil {
				continue
			}
			key, ok := kv.Key.(*ast.BasicLit)
			if !ok {
				continue
			}
			entity, _ := strconv.Unquote(key.Value)
			out[entity] = text(kv)
			fields, _ := kv.Value.(*ast.CompositeLit)
			if fields == nil {
				continue
			}
			for _, fe := range fields.Elts {
				fkv, _ := fe.(*ast.KeyValueExpr)
				if fkv == nil {
					continue
				}
				if bl, ok := fkv.Key.(*ast.BasicLit); ok {
					name, _ := strconv.Unquote(bl.Value)
					out[entity+"."+name] = text(fkv)
				}
			}
		}
		return false
	})
	return out
}
