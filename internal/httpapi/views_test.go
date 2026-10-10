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
	resp, out := e.do("POST", "/api/v1/views", map[string]any{"name": "Waiting", "query": "@waiting"})
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
	for _, k := range []string{"projects", "tasks", "labels"} {
		if _, ok := out[k]; !ok {
			t.Fatalf("export lost %s: %v", k, out)
		}
	}
}
