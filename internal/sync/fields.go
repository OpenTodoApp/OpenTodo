package sync

import (
	"encoding/json"
	"fmt"
	"math"
	"net/url"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
)

// MaxFieldText bounds a text or link value in characters (spec "Typed values
// and their limits").
const MaxFieldText = 2000

// FieldTypes are the definition types this server knows. A definition's type
// is a plain string so a later type is additive: clients show an unknown type
// read-only as text.
var FieldTypes = map[string]bool{"text": true, "number": true, "date": true, "choice": true, "link": true, "checkbox": true}

// Custom fields (OpenSpec change custom-fields, design D2/D3). A task's values
// are stored as one op field per definition (`fields.<id>`); every reader that
// presents a task to people or programs (REST, export, webhooks, assistant
// tools) shows them as one `fields` object keyed by definition id instead.

// FoldFieldValues returns a copy of a task with its `fields.<id>` keys moved
// into a `fields` object (always present, `{}` when the task holds none). The
// caller's entity is not modified.
func FoldFieldValues(e Entity) Entity {
	if e == nil {
		return nil
	}
	out := make(Entity, len(e)+1)
	values := map[string]json.RawMessage{}
	for k, v := range e {
		if id, ok := FieldValueID(k); ok {
			values[id] = v
			continue
		}
		out[k] = v
	}
	raw, _ := json.Marshal(values)
	out["fields"] = raw
	return out
}

// FieldValues returns the `fields.<id>` values of a task keyed by definition id.
func FieldValues(e Entity) map[string]json.RawMessage {
	out := map[string]json.RawMessage{}
	for k, v := range e {
		if id, ok := FieldValueID(k); ok {
			out[id] = v
		}
	}
	return out
}

// FieldValueKeys lists the `fields.<id>` keys of an entity in order.
func FieldValueKeys(e Entity) []string {
	var out []string
	for k := range e {
		if _, ok := FieldValueID(k); ok {
			out = append(out, k)
		}
	}
	sort.Strings(out)
	return out
}

// FieldOptions splits a choice field's options (one per line, blanks ignored).
func FieldOptions(raw string) []string {
	var out []string
	for _, l := range strings.Split(raw, "\n") {
		if l = strings.TrimSpace(l); l != "" {
			out = append(out, l)
		}
	}
	return out
}

// CheckFieldValue checks one value against its definition's type (null always
// clears). It returns a user-facing reason or "".
func CheckFieldValue(def Entity, raw json.RawMessage) string {
	if len(raw) == 0 || string(raw) == "null" {
		return ""
	}
	var typ string
	_ = json.Unmarshal(def["type"], &typ)
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		return "must be a JSON value"
	}
	str, isStr := v.(string)
	switch typ {
	case "text":
		if !isStr || utf8.RuneCountInString(str) > MaxFieldText {
			return fmt.Sprintf("must be text of at most %d characters", MaxFieldText)
		}
	case "number":
		n, ok := v.(float64)
		if !ok || math.IsInf(n, 0) || math.IsNaN(n) {
			return "must be a number"
		}
	case "date":
		if !isStr {
			return `must be a date "YYYY-MM-DD"`
		}
		if t, err := time.Parse("2006-01-02", str); err != nil || t.Format("2006-01-02") != str {
			return `must be a date "YYYY-MM-DD"`
		}
	case "choice":
		if !isStr {
			return "must be one of the field's options"
		}
		var options string
		_ = json.Unmarshal(def["options"], &options)
		if e2ee.IsCiphertext(options) {
			return "" // encrypted options cannot be checked here
		}
		for _, o := range FieldOptions(options) {
			if o == str {
				return ""
			}
		}
		return "must be one of the field's options"
	case "link":
		if !isStr || utf8.RuneCountInString(str) > MaxFieldText {
			return fmt.Sprintf("must be an http or https link of at most %d characters", MaxFieldText)
		}
		u, err := url.Parse(str)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
			return "must be an http or https link"
		}
	case "checkbox":
		if _, ok := v.(bool); !ok {
			return "must be true or false"
		}
	default:
		// A type this server does not know (a newer client): shape only.
		switch v.(type) {
		case string, float64, bool:
		default:
			return "must be a string, a number or a boolean"
		}
	}
	return ""
}

// Inherited fields (OpenSpec change inherited-custom-fields, design D1): the
// fields that apply to a project are the live definitions of its ancestors,
// farthest first, then its own, each group in position order. Ancestors follow
// raw parent pointers through the given live projects and stop at a missing or
// deleted parent or a project already visited. The web client's twin is
// web/src/lib/fieldTree.ts; both are pinned by web/src/lib/fields.vectors.json.

// FieldChain returns the ids of the projects whose fields apply to projectID:
// its ancestors farthest first, then projectID itself.
func FieldChain(projectID string, projects map[string]Entity) []string {
	chain := []string{projectID}
	seen := map[string]bool{projectID: true}
	cur := projects[projectID]
	for cur != nil {
		parent := cur.str("parent_id")
		if parent == "" || seen[parent] {
			break
		}
		p, ok := projects[parent]
		if !ok || p.deleted() {
			break
		}
		seen[parent] = true
		chain = append(chain, parent)
		cur = p
	}
	for i, j := 0, len(chain)-1; i < j; i, j = i+1, j-1 {
		chain[i], chain[j] = chain[j], chain[i]
	}
	return chain
}

// ApplicableFields returns the live field definitions that apply to a project
// (none for Inbox, an empty id), inherited ones first.
func ApplicableFields(projectID string, projects map[string]Entity, defs []Entity) []Entity {
	if projectID == "" {
		return nil
	}
	byProject := map[string][]Entity{}
	for _, d := range defs {
		if !d.deleted() {
			pid := d.str("project_id")
			byProject[pid] = append(byProject[pid], d)
		}
	}
	var out []Entity
	for _, pid := range FieldChain(projectID, projects) {
		own := byProject[pid]
		sort.SliceStable(own, func(i, j int) bool {
			if a, b := own[i].number("position"), own[j].number("position"); a != b {
				return a < b
			}
			return own[i].str("id") < own[j].str("id")
		})
		out = append(out, own...)
	}
	return out
}

// FieldDescendants returns the ids of the live projects below projectID at any
// depth, following raw parent pointers (cycle-safe), in no particular order.
func FieldDescendants(projectID string, projects map[string]Entity) []string {
	children := map[string][]string{}
	for id, p := range projects {
		if p.deleted() {
			continue
		}
		if parent := p.str("parent_id"); parent != "" {
			children[parent] = append(children[parent], id)
		}
	}
	var out []string
	seen := map[string]bool{projectID: true}
	stack := []string{projectID}
	for len(stack) > 0 {
		cur := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		for _, c := range children[cur] {
			if !seen[c] {
				seen[c] = true
				out = append(out, c)
				stack = append(stack, c)
			}
		}
	}
	sort.Strings(out)
	return out
}

// ProjectsByID indexes live projects by id, the input FieldChain and
// ApplicableFields expect.
func ProjectsByID(projects []Entity) map[string]Entity {
	out := make(map[string]Entity, len(projects))
	for _, p := range projects {
		if !p.deleted() {
			out[p.str("id")] = p
		}
	}
	return out
}
