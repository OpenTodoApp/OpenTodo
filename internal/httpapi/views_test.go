package httpapi

import (
	"context"
	"strings"
	"testing"
)

func registeredEnv(t *testing.T) *env {
	t.Helper()
	e := newEnv(t, false)
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "o@example.com", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	return e
}

func errMessage(out map[string]any) string {
	if e, ok := out["error"].(map[string]any); ok {
		m, _ := e["message"].(string)
		return m
	}
	return ""
}

func TestViewsRequireAuth(t *testing.T) {
	e := newEnv(t, false)
	for _, c := range []struct {
		method, path string
		body         any
	}{
		{"GET", "/api/v1/views", nil},
		{"POST", "/api/v1/views", map[string]any{"name": "Waiting", "query": "@waiting"}},
		{"GET", "/api/v1/views/x", nil},
		{"PATCH", "/api/v1/views/x", map[string]any{"name": "y"}},
		{"DELETE", "/api/v1/views/x", nil},
	} {
		resp, out := e.do(c.method, c.path, c.body)
		e.mustStatus(resp, 401, out)
		if errCode(out) != "unauthorized" {
			t.Fatalf("%s %s: error = %v", c.method, c.path, out)
		}
	}
	// A bearer token works like the session (the spec's script scenario).
	e = registeredEnv(t)
	resp, out := e.do("POST", "/api/v1/tokens", map[string]any{"name": "script"})
	e.mustStatus(resp, 201, out)
	secret := out["secret"].(string)
	anon := newClientFor(e)
	resp, out = anon.do("POST", "/api/v1/views", map[string]any{"name": "Waiting", "query": "@waiting", "pinned": true}, "Authorization", "Bearer "+secret)
	anon.mustStatus(resp, 201, out)
	resp, out = anon.do("GET", "/api/v1/views", nil, "Authorization", "Bearer bad")
	anon.mustStatus(resp, 401, out)
}

func TestViewsCrud(t *testing.T) {
	e := registeredEnv(t)

	resp, out := e.do("POST", "/api/v1/views", map[string]any{"name": "Waiting", "query": "@waiting", "pinned": true})
	e.mustStatus(resp, 201, out)
	id, _ := out["id"].(string)
	want := map[string]any{"name": "Waiting", "query": "@waiting", "pinned": true, "kind": "list", "group_by": "project", "sort_by": "due", "sort_dir": "asc"}
	for k, v := range want {
		if out[k] != v {
			t.Fatalf("created view %s = %v, want %v (%v)", k, out[k], v, out)
		}
	}
	if id == "" || out["position"] == nil || out["created_at"] == nil || out["color"] == nil {
		t.Fatalf("created view = %v", out)
	}
	if p, ok := out["panels"].([]any); !ok || len(p) != 0 {
		t.Fatalf("panels = %v", out["panels"])
	}

	resp, out = e.do("GET", "/api/v1/views/"+id, nil)
	e.mustStatus(resp, 200, out)

	resp, out = e.do("PATCH", "/api/v1/views/"+id, map[string]any{"query": "@waiting & !@someday", "group_by": "due", "sort_by": "priority", "sort_dir": "desc"})
	e.mustStatus(resp, 200, out)
	if out["query"] != "@waiting & !@someday" || out["group_by"] != "due" || out["sort_dir"] != "desc" {
		t.Fatalf("patched view = %v", out)
	}

	// A dashboard with the list view as a panel.
	resp, out = e.do("POST", "/api/v1/views", map[string]any{"name": "Morning", "kind": "dashboard", "panels": []string{id}})
	e.mustStatus(resp, 201, out)
	dash := out["id"].(string)
	if out["query"] != "" || out["kind"] != "dashboard" {
		t.Fatalf("dashboard = %v", out)
	}

	resp, out = e.do("GET", "/api/v1/views", nil)
	e.mustStatus(resp, 200, out)
	if n := len(out["views"].([]any)); n != 2 {
		t.Fatalf("views = %d", n)
	}

	resp, out = e.do("DELETE", "/api/v1/views/"+id, nil)
	e.mustStatus(resp, 204, out)
	resp, out = e.do("GET", "/api/v1/views/"+id, nil)
	e.mustStatus(resp, 404, out)
	resp, out = e.do("GET", "/api/v1/views?include_deleted=true", nil)
	e.mustStatus(resp, 200, out)
	if n := len(out["views"].([]any)); n != 2 {
		t.Fatalf("views including deleted = %d", n)
	}
	// The dashboard keeps the dangling panel id; clients show a placeholder.
	resp, out = e.do("GET", "/api/v1/views/"+dash, nil)
	e.mustStatus(resp, 200, out)
	if p := out["panels"].([]any); len(p) != 1 || p[0] != id {
		t.Fatalf("dashboard panels after delete = %v", p)
	}

	// The write went through the op log: a device pulls the view ops.
	resp, out = e.do("POST", "/api/v1/sync", map[string]any{"device": "phone", "cursor": 0})
	e.mustStatus(resp, 200, out)
	found := false
	for _, o := range out["ops"].([]any) {
		op := o.(map[string]any)
		if op["entity"] == "view" && op["field"] == "query" && op["value"] == "@waiting & !@someday" {
			found = true
		}
	}
	if !found {
		t.Fatalf("sync did not return the view ops: %v", out["ops"])
	}
}

func TestViewsRejectInvalidOption(t *testing.T) {
	e := registeredEnv(t)
	resp, out := e.do("POST", "/api/v1/views", map[string]any{"name": "List", "query": "p1"})
	e.mustStatus(resp, 201, out)
	list := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/views", map[string]any{"name": "Dash", "kind": "dashboard"})
	e.mustStatus(resp, 201, out)
	dash := out["id"].(string)

	cases := []struct {
		body any
		msg  string
	}{
		{map[string]any{"name": "x", "query": "p1", "group_by": "colour"}, "view.group_by must be one of"},
		{map[string]any{"name": "x", "query": "p1", "sort_by": "mood"}, "view.sort_by must be one of"},
		{map[string]any{"name": "x", "query": "p1", "sort_dir": "up"}, "view.sort_dir must be one of"},
		{map[string]any{"name": "x", "query": "p1", "kind": "board"}, "view.kind must be one of"},
		{map[string]any{"query": "p1"}, "view.name is required"},
		{map[string]any{"name": "  ", "query": "p1"}, "view.name must not be empty"},
		{map[string]any{"name": "x"}, "view.query is required"},
		{map[string]any{"name": "x", "query": " "}, "view.query must not be empty"},
		{map[string]any{"name": "x", "query": "@work p1"}, `view.query: Expected "&" or "|" before "p1" at position 7`},
		{map[string]any{"name": "x", "query": "p1", "colour": "red"}, "unknown field"},
		{map[string]any{"name": "x", "query": "p1", "pinned": "yes"}, "must be a boolean"},
		{map[string]any{"name": "x", "query": "p1", "panels": []string{list}}, "only allowed on dashboards"},
		{map[string]any{"name": "x", "kind": "dashboard", "panels": []string{"nope"}}, "unknown or deleted view"},
		{map[string]any{"name": "x", "kind": "dashboard", "panels": []string{dash}}, "dashboards cannot be nested"},
		{map[string]any{"name": "x", "kind": "dashboard", "panels": []string{list, list}}, "listed twice"},
		{map[string]any{"name": "x", "kind": "dashboard", "panels": []string{list, list, list, list, list, list, list}}, "at most 6"},
	}
	for _, c := range cases {
		resp, out = e.do("POST", "/api/v1/views", c.body)
		e.mustStatus(resp, 400, out)
		if errCode(out) != "invalid_input" || !strings.Contains(errMessage(out), c.msg) {
			t.Errorf("%v: error = %v, want message containing %q", c.body, out, c.msg)
		}
	}
	// Nothing was created by the rejected requests.
	resp, out = e.do("GET", "/api/v1/views?include_deleted=true", nil)
	e.mustStatus(resp, 200, out)
	if n := len(out["views"].([]any)); n != 2 {
		t.Fatalf("views after rejected creates = %d", n)
	}

	patches := []struct {
		id   string
		body any
		msg  string
	}{
		{list, map[string]any{"group_by": "colour"}, "view.group_by must be one of"},
		{list, map[string]any{"kind": "dashboard"}, "cannot be changed"},
		{list, map[string]any{"name": ""}, "must not be empty"},
		{list, map[string]any{"query": "p5"}, "Priority must be p1, p2, p3 or p4"},
		{dash, map[string]any{"panels": []string{dash}}, "cannot contain itself"},
		{dash, map[string]any{"kind": "list"}, "cannot be changed"},
	}
	for _, c := range patches {
		resp, out = e.do("PATCH", "/api/v1/views/"+c.id, c.body)
		e.mustStatus(resp, 400, out)
		if errCode(out) != "invalid_input" || !strings.Contains(errMessage(out), c.msg) {
			t.Errorf("PATCH %v: error = %v, want message containing %q", c.body, out, c.msg)
		}
	}
	resp, out = e.do("GET", "/api/v1/views/"+list, nil)
	e.mustStatus(resp, 200, out)
	if out["group_by"] != "project" || out["query"] != "p1" || out["kind"] != "list" {
		t.Fatalf("list changed by rejected patches: %v", out)
	}
	// Restating the current kind and a valid panel list are fine.
	resp, out = e.do("PATCH", "/api/v1/views/"+dash, map[string]any{"kind": "dashboard", "panels": []string{list}})
	e.mustStatus(resp, 200, out)
}

func TestViewsSyncAcceptsUnknownOptionValues(t *testing.T) {
	// Sync is never refused for an enumeration value (additive, design D1); only REST is.
	e := registeredEnv(t)
	resp, out := e.do("POST", "/api/v1/sync", map[string]any{"device": "newer", "cursor": 0, "ops": []map[string]any{
		{"id": "o1", "entity": "view", "entityId": "v1", "field": "name", "value": "Future", "ts": 1, "device": "newer"},
		{"id": "o2", "entity": "view", "entityId": "v1", "field": "group_by", "value": "colour", "ts": 1, "device": "newer"},
	}})
	e.mustStatus(resp, 200, out)
	v, err := e.sync.Get(context.Background(), userIDOf(t, e), "view", "v1")
	if err != nil || string(v["group_by"]) != `"colour"` {
		t.Fatalf("view = %v, %v", v, err)
	}
}

func userIDOf(t *testing.T, e *env) string {
	t.Helper()
	resp, out := e.do("GET", "/api/v1/me", nil)
	e.mustStatus(resp, 200, out)
	return out["user"].(map[string]any)["id"].(string)
}

func TestExportIncludesViews(t *testing.T) {
	e := registeredEnv(t)
	resp, out := e.do("POST", "/api/v1/views", map[string]any{"name": "Waiting", "query": "@waiting", "on_drop": map[string]any{"priority": 2}})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("POST", "/api/v1/views", map[string]any{"name": "Old", "query": "p1"})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("DELETE", "/api/v1/views/"+out["id"].(string), nil)
	e.mustStatus(resp, 204, out)

	resp, out = e.do("GET", "/api/v1/export", nil)
	e.mustStatus(resp, 200, out)
	views, ok := out["views"].([]any)
	if !ok || len(views) != 2 || out["version"] != float64(1) {
		t.Fatalf("export = %v", out)
	}
	deleted := 0
	for _, v := range views {
		if v.(map[string]any)["deleted_at"] != nil {
			deleted++
		}
	}
	if deleted != 1 {
		t.Fatalf("export should keep the deleted view, got %d deleted", deleted)
	}
	// Every exported view carries on_drop: the rule, or null (rule-boards).
	for _, v := range views {
		m := v.(map[string]any)
		r, has := m["on_drop"]
		switch {
		case !has:
			t.Fatalf("exported view without on_drop: %v", m)
		case m["name"] == "Waiting" && r.(map[string]any)["priority"] != float64(2):
			t.Fatalf("exported rule = %v", r)
		case m["name"] == "Old" && r != nil:
			t.Fatalf("view without a rule exported on_drop %v", r)
		}
	}
	for _, k := range []string{"projects", "tasks", "labels"} {
		if _, ok := out[k]; !ok {
			t.Fatalf("export lost %s: %v", k, out)
		}
	}
}

// TestViewsOnDrop covers the REST side of on-drop rules (OpenSpec change
// rule-boards): the null default, a valid patch replacing the rule whole, every
// case of the spec's "Invalid rule" and authentication.
func TestViewsOnDrop(t *testing.T) {
	e := registeredEnv(t)
	resp, out := e.do("POST", "/api/v1/views", map[string]any{"name": "Waiting", "query": "@waiting", "pinned": true})
	e.mustStatus(resp, 201, out)
	if v, has := out["on_drop"]; !has || v != nil {
		t.Fatalf("created view on_drop = %v (has %v)", v, has)
	}
	list := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/views", map[string]any{"name": "Dash", "kind": "dashboard"})
	e.mustStatus(resp, 201, out)
	dash := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/labels", map[string]any{"name": "errand"})
	e.mustStatus(resp, 201, out)
	errand := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/labels", map[string]any{"name": "gone"})
	e.mustStatus(resp, 201, out)
	gone := out["id"].(string)
	resp, out = e.do("DELETE", "/api/v1/labels/"+gone, nil)
	e.mustStatus(resp, 204, out)
	resp, out = e.do("POST", "/api/v1/projects", map[string]any{"name": "Home"})
	e.mustStatus(resp, 201, out)
	home := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/projects", map[string]any{"name": "Work"})
	e.mustStatus(resp, 201, out)
	work := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/sections", map[string]any{"name": "Doing", "project_id": home})
	e.mustStatus(resp, 201, out)
	doing := out["id"].(string)

	resp, out = e.do("PATCH", "/api/v1/views/"+list, map[string]any{"on_drop": map[string]any{"priority": 1, "due": "today"}})
	e.mustStatus(resp, 200, out)
	if r, _ := out["on_drop"].(map[string]any); r["priority"] != float64(1) || r["due"] != "today" {
		t.Fatalf("patched on_drop = %v", out["on_drop"])
	}
	// A patch replaces the rule whole.
	rule := map[string]any{"add_labels": []string{errand}, "section": map[string]any{"project_id": home, "section_id": doing}, "state": "reopen"}
	resp, out = e.do("PATCH", "/api/v1/views/"+list, map[string]any{"on_drop": rule})
	e.mustStatus(resp, 200, out)
	if r, _ := out["on_drop"].(map[string]any); r["priority"] != nil || r["state"] != "reopen" {
		t.Fatalf("replaced on_drop = %v", out["on_drop"])
	}
	resp, out = e.do("PATCH", "/api/v1/views/"+list, map[string]any{"on_drop": map[string]any{"section": map[string]any{"project_id": work, "section_id": nil}}})
	e.mustStatus(resp, 200, out)

	cases := []struct {
		id   string
		rule any
		msg  string
	}{
		{list, map[string]any{"priority": 5}, "priority must be from 1"},
		{list, map[string]any{"due": "friday"}, "due must be one of"},
		{list, map[string]any{"add_labels": []string{"nope"}}, "unknown or deleted label"},
		{list, map[string]any{"remove_labels": []string{gone}}, "unknown or deleted label"},
		{list, map[string]any{"colour": "red"}, "unknown rule key"},
		{list, map[string]any{"section": map[string]any{"project_id": work, "section_id": doing}}, "is not a section of project"},
		{list, map[string]any{"section": map[string]any{"project_id": "nope", "section_id": nil}}, "unknown or deleted project"},
		{list, "priority 1", "must be null or an object"},
		{dash, map[string]any{"priority": 1}, "only allowed on list views"},
	}
	for _, c := range cases {
		resp, out = e.do("PATCH", "/api/v1/views/"+c.id, map[string]any{"on_drop": c.rule})
		e.mustStatus(resp, 400, out)
		if errCode(out) != "invalid_input" || !strings.Contains(errMessage(out), "view.on_drop") || !strings.Contains(errMessage(out), c.msg) {
			t.Errorf("on_drop %v: error = %v, want message containing %q", c.rule, out, c.msg)
		}
	}
	resp, out = e.do("POST", "/api/v1/views", map[string]any{"name": "Dash2", "kind": "dashboard", "on_drop": map[string]any{"priority": 1}})
	e.mustStatus(resp, 400, out)
	// Nothing was written by the rejected patches.
	resp, out = e.do("GET", "/api/v1/views/"+list, nil)
	e.mustStatus(resp, 200, out)
	if r, _ := out["on_drop"].(map[string]any); r["section"].(map[string]any)["project_id"] != work {
		t.Fatalf("on_drop changed by rejected patches: %v", out["on_drop"])
	}
	resp, out = e.do("PATCH", "/api/v1/views/"+list, map[string]any{"on_drop": nil})
	e.mustStatus(resp, 200, out)
	if out["on_drop"] != nil {
		t.Fatalf("cleared on_drop = %v", out["on_drop"])
	}
	resp, out = newClientFor(e).do("PATCH", "/api/v1/views/"+list, map[string]any{"on_drop": map[string]any{"priority": 1}})
	e.mustStatus(resp, 401, out)
}

// TestViewsAcceptEisenhowerQueries posts the four queries of the Eisenhower
// matrix template (spec "Template parses on the server"); the web test of
// boardTemplates.ts uses the same literal strings.
func TestViewsAcceptEisenhowerQueries(t *testing.T) {
	e := registeredEnv(t)
	for _, c := range []struct {
		name, query string
		rule        map[string]any
	}{
		{"Urgent and important", "(p1 | p2) & (due <= tomorrow | deadline <= tomorrow)", map[string]any{"priority": 1, "due": "today"}},
		{"Important, not urgent", "(p1 | p2) & !(due <= tomorrow | deadline <= tomorrow) & !someday", map[string]any{"priority": 2, "due": "next-week"}},
		{"Urgent, not important", "!(p1 | p2) & (due <= tomorrow | deadline <= tomorrow)", map[string]any{"priority": 3, "due": "today"}},
		{"Neither", "!(p1 | p2) & !(due <= tomorrow | deadline <= tomorrow) & !someday", map[string]any{"priority": 4, "due": "clear"}},
	} {
		resp, out := e.do("POST", "/api/v1/views", map[string]any{"name": c.name, "query": c.query, "kind": "list", "on_drop": c.rule})
		e.mustStatus(resp, 201, out)
	}
}
