package cli

import (
	"context"
	"encoding/json"
	"strings"
)

// nameResolver turns the names a routine file may give (projects, sections,
// labels, saved views, webhooks) into ids before anything is sent; a name that
// matches nothing fails naming it (routines-engine "Routine CLI").
type nameResolver struct {
	ctx    context.Context
	c      *client
	lists  map[string][]named
	loaded map[string]bool
	err    error
}

type named struct{ id, name string }

func newNameResolver(ctx context.Context, c *client) *nameResolver {
	return &nameResolver{ctx: ctx, c: c, lists: map[string][]named{}, loaded: map[string]bool{}}
}

// load reads one collection once: projects, sections, labels, views, webhooks.
func (n *nameResolver) load(kind string) []named {
	if n.loaded[kind] || n.err != nil {
		return n.lists[kind]
	}
	n.loaded[kind] = true
	var out map[string]json.RawMessage
	if err := n.c.getJSON(n.ctx, "/"+kind, &out); err != nil {
		n.err = err
		return nil
	}
	var rows []map[string]any
	_ = json.Unmarshal(out[kind], &rows)
	for _, row := range rows {
		id, _ := row["id"].(string)
		name, _ := row["name"].(string)
		if name == "" {
			name, _ = row["url"].(string) // a webhook is named by its address
		}
		if del, ok := row["deleted_at"]; ok && del != nil {
			continue
		}
		n.lists[kind] = append(n.lists[kind], named{id, name})
	}
	return n.lists[kind]
}

// id resolves a reference of one kind: an id as it is, else a name ignoring case.
func (n *nameResolver) id(kind, what string, v any) any {
	ref, ok := v.(string)
	if !ok || ref == "" || n.err != nil {
		return v
	}
	list := n.load(kind)
	for _, x := range list {
		if x.id == ref {
			return ref
		}
	}
	for _, x := range list {
		if strings.EqualFold(strings.TrimSpace(x.name), strings.TrimSpace(ref)) {
			return x.id
		}
	}
	if n.err == nil {
		n.err = usageErr("%s %s not found", what, ref)
	}
	return v
}

func (n *nameResolver) ids(kind, what string, v any) any {
	list, ok := v.([]any)
	if !ok {
		return v
	}
	for i := range list {
		list[i] = n.id(kind, what, list[i])
	}
	return list
}

// routine resolves every name of a routine file in place.
func (n *nameResolver) routine(doc map[string]any) error {
	if tr, ok := doc["trigger"].(map[string]any); ok {
		n.fields(tr, map[string][2]string{"label_id": {"labels", "label"}, "project_id": {"projects", "project"}, "section_id": {"sections", "section"}})
	}
	if c, ok := doc["condition"].(map[string]any); ok {
		n.condition(c)
	}
	if a, ok := doc["actions"].(map[string]any); ok {
		n.actions(a)
	}
	if steps, ok := doc["steps"].([]any); ok {
		n.steps(steps)
	}
	// The project a routine belongs to (routines-shared D11), sent as project_id.
	if p, ok := doc["project"]; ok {
		delete(doc, "project")
		doc["project_id"] = n.id("projects", "project", p)
	}
	return n.err
}

func (n *nameResolver) fields(m map[string]any, kinds map[string][2]string) {
	for f, k := range kinds {
		if v, ok := m[f]; ok {
			m[f] = n.id(k[0], k[1], v)
		}
	}
}

func (n *nameResolver) condition(c map[string]any) {
	if l, ok := c["labels"].(map[string]any); ok {
		for _, f := range []string{"any", "all", "none"} {
			if v, ok := l[f]; ok {
				l[f] = n.ids("labels", "label", v)
			}
		}
	}
	for _, f := range []string{"project", "section"} {
		if p, ok := c[f].(map[string]any); ok {
			p["in"] = n.ids(f+"s", f, p["in"])
		}
	}
}

func (n *nameResolver) actions(a map[string]any) {
	for _, f := range []string{"add_labels", "remove_labels"} {
		if v, ok := a[f]; ok {
			a[f] = n.ids("labels", "label", v)
		}
	}
	if s, ok := a["section"].(map[string]any); ok {
		n.fields(s, map[string][2]string{"project_id": {"projects", "project"}, "section_id": {"sections", "section"}})
	}
	if w, ok := a["webhook"].(map[string]any); ok {
		n.fields(w, map[string][2]string{"webhook_id": {"webhooks", "webhook"}})
	}
}

func (n *nameResolver) steps(steps []any) {
	for _, raw := range steps {
		s, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		in, _ := s["in"].(map[string]any)
		for name, rawArg := range in {
			arg, ok := rawArg.(map[string]any)
			if !ok {
				continue
			}
			lit, has := arg["literal"]
			if !has {
				continue
			}
			switch name {
			case "labels":
				arg["literal"] = n.ids("labels", "label", lit)
			case "view":
				arg["literal"] = n.id("views", "saved view", lit)
			case "webhook_id":
				arg["literal"] = n.id("webhooks", "webhook", lit)
			case "section":
				arg["literal"] = n.id("sections", "section", lit)
			case "condition", "where":
				if c, ok := lit.(map[string]any); ok {
					n.condition(c)
				}
			case "set":
				if a, ok := lit.(map[string]any); ok {
					n.actions(a)
				}
			default:
				if m, ok := lit.(map[string]any); ok {
					n.fields(m, map[string][2]string{"project": {"projects", "project"}})
				}
			}
		}
		for _, b := range []string{"then", "otherwise", "do"} {
			if inner, ok := s[b].([]any); ok {
				n.steps(inner)
			}
		}
	}
}

// name is the name of an id of one kind ("" for none or unknown).
func (n *nameResolver) name(kind, id string) string {
	if id == "" {
		return ""
	}
	for _, x := range n.load(kind) {
		if x.id == id {
			return x.name
		}
	}
	return id
}
