package httpapi

import (
	"strings"
	"testing"
)

// A token limited to one workspace (token-workspaces) over REST and MCP: it
// lists and changes only that workspace, its new tasks land there, the rest of
// the account answers as missing, and routes over the whole account refuse it.
func TestTokenLimitedToAWorkspace(t *testing.T) {
	e := ownerEnv(t)
	e.enableMCP(true)
	resp, out := e.do("POST", "/api/v1/workspaces", map[string]any{"name": "Work"})
	e.mustStatus(resp, 201, out)
	work := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/projects", map[string]any{"name": "Launch", "workspace_id": work})
	e.mustStatus(resp, 201, out)
	launch := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Ship it", "project_id": launch})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Buy milk"})
	e.mustStatus(resp, 201, out)
	home := out["id"].(string)

	resp, out = e.do("POST", "/api/v1/tokens", map[string]any{"name": "Work assistant", "scope": "agent", "workspaces": []string{work}})
	e.mustStatus(resp, 201, out)
	secret := out["secret"].(string)
	if !strings.HasPrefix(secret, "otw_") {
		t.Fatalf("secret = %q", secret)
	}
	if ws := out["token"].(map[string]any)["workspaces"].([]any); len(ws) != 1 || ws[0] != work {
		t.Fatalf("token = %v", out["token"])
	}
	full := func() string {
		resp, out := e.do("POST", "/api/v1/tokens", map[string]any{"name": "Work full", "scope": "full", "workspaces": []string{work}})
		e.mustStatus(resp, 201, out)
		return out["secret"].(string)
	}()
	c := e.bearerClient()

	// REST: only Work's task; Home's reads as missing and cannot be changed.
	resp, out = c.do("GET", "/api/v1/tasks", nil, bearer(full)...)
	e.mustStatus(resp, 200, out)
	if items := out["tasks"].([]any); len(items) != 1 || items[0].(map[string]any)["title"] != "Ship it" {
		t.Fatalf("tasks = %v", out)
	}
	resp, out = c.do("GET", "/api/v1/tasks/"+home, nil, bearer(full)...)
	if resp.StatusCode != 404 {
		t.Fatalf("Home's task = %d %v", resp.StatusCode, out)
	}
	resp, out = c.do("PATCH", "/api/v1/tasks/"+home, map[string]any{"title": "Changed"}, bearer(full)...)
	if resp.StatusCode != 404 {
		t.Fatalf("patch Home's task = %d %v", resp.StatusCode, out)
	}
	// A new task without a project lands in Work's Inbox.
	resp, out = c.do("POST", "/api/v1/tasks", map[string]any{"title": "Call the client"}, bearer(full)...)
	e.mustStatus(resp, 201, out)
	if out["workspace_id"] != work {
		t.Fatalf("new task = %v", out)
	}
	resp, out = c.do("GET", "/api/v1/workspaces", nil, bearer(full)...)
	e.mustStatus(resp, 200, out)
	if ws := out["workspaces"].([]any); len(ws) != 1 || ws[0].(map[string]any)["id"] != work {
		t.Fatalf("workspaces = %v", out)
	}
	// Routes over the whole account refuse the token.
	for _, rt := range []struct{ method, path string }{
		{"POST", "/api/v1/sync"}, {"GET", "/api/v1/export"}, {"GET", "/api/v1/activity"}, {"GET", "/api/v1/tasks/" + home + "/history"},
	} {
		resp, out := c.do(rt.method, rt.path, map[string]any{"device": "d", "cursor": 0, "ops": []any{}}, bearer(full)...)
		if resp.StatusCode != 403 || errCode(out) != "token_restricted" {
			t.Fatalf("%s %s = %d %v", rt.method, rt.path, resp.StatusCode, out)
		}
	}

	// MCP: list_projects sees Launch only; create_tasks lands in Work; frames are closed.
	projects := e.mcpTool(secret, "list_projects", map[string]any{})
	if s := mustJSON(projects); !strings.Contains(string(s), "Launch") || strings.Contains(string(s), "Inbox\",\"workspace\":\"default") {
		t.Fatalf("list_projects = %s", s)
	}
	tasks := e.mcpTool(secret, "list_tasks", map[string]any{})
	if s := string(mustJSON(tasks)); strings.Contains(s, "Buy milk") || !strings.Contains(s, "Ship it") {
		t.Fatalf("list_tasks = %s", s)
	}
	out = e.rpc(secret, "tools/call", map[string]any{"name": "list_frames", "arguments": map[string]any{}})
	if res := out["result"].(map[string]any); res["isError"] != true || !strings.Contains(string(mustJSON(res)), "token_restricted") {
		t.Fatalf("list_frames = %v", out)
	}
	// A token without workspaces still sees everything.
	all := e.token("full")
	resp, out = c.do("GET", "/api/v1/tasks", nil, bearer(all)...)
	e.mustStatus(resp, 200, out)
	if items := out["tasks"].([]any); len(items) != 3 {
		t.Fatalf("unrestricted tasks = %d", len(items))
	}
	// An unknown workspace is refused at creation.
	resp, out = e.do("POST", "/api/v1/tokens", map[string]any{"name": "x", "workspaces": []string{"nope"}})
	if resp.StatusCode != 400 || errCode(out) != "invalid_input" {
		t.Fatalf("unknown workspace = %d %v", resp.StatusCode, out)
	}
}

// An agent token limited to a workspace writes through the agent content routes
// (agent-ready-cli D8) only inside it: the tool registry gets the token's limit,
// so a task elsewhere answers as missing and an unlimited tool is refused.
func TestAgentTokenLimitedToAWorkspaceOverREST(t *testing.T) {
	e := ownerEnv(t)
	e.allowWrites(true)
	e.allowMyAssistants(true)
	resp, out := e.do("POST", "/api/v1/workspaces", map[string]any{"name": "Work"})
	e.mustStatus(resp, 201, out)
	work := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/projects", map[string]any{"name": "Launch", "workspace_id": work})
	e.mustStatus(resp, 201, out)
	launch := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Ship it", "project_id": launch})
	e.mustStatus(resp, 201, out)
	ship := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Buy milk"})
	e.mustStatus(resp, 201, out)
	home := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/projects", map[string]any{"name": "Garden"})
	e.mustStatus(resp, 201, out)
	garden := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Walk", "due": map[string]any{"date": localToday(e.now.Now())}, "recurrence": "every day", "habit": true})
	e.mustStatus(resp, 201, out)
	walk := out["id"].(string)

	resp, out = e.do("POST", "/api/v1/tokens", map[string]any{"name": "Work assistant", "scope": "agent", "workspaces": []string{work}})
	e.mustStatus(resp, 201, out)
	secret := out["secret"].(string)
	c := e.bearerClient()

	// Outside Work: nothing is changed, whatever the route.
	for _, rt := range []struct {
		method, path string
		body         map[string]any
	}{
		{"PATCH", "/api/v1/tasks/" + home, map[string]any{"title": "Changed by limited agent"}},
		{"POST", "/api/v1/tasks/" + home + "/comments", map[string]any{"body": "hello"}},
		{"POST", "/api/v1/tasks", map[string]any{"title": "Planted", "project_id": garden}},
		{"POST", "/api/v1/habits/" + walk + "/log", map[string]any{"state": "done"}},
	} {
		resp, out := c.do(rt.method, rt.path, rt.body, bearer(secret)...)
		if resp.StatusCode < 400 {
			t.Fatalf("%s %s outside the workspace = %d %v", rt.method, rt.path, resp.StatusCode, out)
		}
	}
	resp, out = e.do("GET", "/api/v1/tasks/"+home, nil)
	e.mustStatus(resp, 200, out)
	if out["title"] != "Buy milk" {
		t.Fatalf("Home's task changed: %v", out)
	}
	resp, out = e.do("GET", "/api/v1/tasks/"+home+"/comments", nil)
	e.mustStatus(resp, 200, out)
	if items, _ := out["comments"].([]any); len(items) != 0 {
		t.Fatalf("comment added outside the workspace: %v", out)
	}
	// Inside Work the same token still writes.
	resp, out = c.do("PATCH", "/api/v1/tasks/"+ship, map[string]any{"title": "Ship it today"}, bearer(secret)...)
	e.mustStatus(resp, 200, out)
}
