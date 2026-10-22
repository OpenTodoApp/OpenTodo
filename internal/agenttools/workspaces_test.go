package agenttools

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	opsync "github.com/pixari/opentodo/internal/sync"
)

// Workspaces in tools (OpenSpec change workspaces, task 4.3).
func TestWorkspacesInTools(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	name := "Work"
	work, err := f.sync.CreateWorkspace(ctx, "u1", opsync.WorkspaceInput{Name: &name})
	if err != nil {
		t.Fatal(err)
	}
	f.put("u1", "project", "garden", map[string]any{"name": "Garden"})
	f.put("u1", "project", "site", map[string]any{"name": "Website", "workspace_id": work.ID})
	f.task("u1", "t-site", "Deploy", map[string]any{"project_id": "site"})
	f.task("u1", "t-work-inbox", "Call the client", map[string]any{"workspace_id": work.ID})
	f.task("u1", "t-home", "Water the plants", nil)
	reader := Caller{UserID: "u1", Scope: "read"}

	ws := f.mustCall(reader, "list_workspaces", nil)["workspaces"]
	raw, _ := json.Marshal(ws)
	if !strings.Contains(string(raw), `"name":"Work"`) || !strings.Contains(string(raw), `"default":true`) {
		t.Fatalf("list_workspaces = %s", raw)
	}

	// Projects of one workspace, by name.
	projects := f.mustCall(reader, "list_projects", map[string]any{"workspace": "work"})["projects"]
	raw, _ = json.Marshal(projects)
	if !strings.Contains(string(raw), `"id":"site"`) || strings.Contains(string(raw), `"id":"garden"`) ||
		!strings.Contains(string(raw), `"workspace_id":"`+work.ID+`"`) || !strings.Contains(string(raw), `"workspace":"Work"`) {
		t.Fatalf("Work projects = %s", raw)
	}
	tasks := f.mustCall(reader, "list_tasks", map[string]any{"workspace": work.ID})["tasks"]
	raw, _ = json.Marshal(tasks)
	if !strings.Contains(string(raw), "t-site") || !strings.Contains(string(raw), "t-work-inbox") || strings.Contains(string(raw), "t-home") {
		t.Fatalf("Work tasks = %s", raw)
	}
	found := f.mustCall(reader, "search_tasks", map[string]any{"query": "the", "workspace": "Personal"})["tasks"]
	raw, _ = json.Marshal(found)
	if !strings.Contains(string(raw), "t-home") || strings.Contains(string(raw), "t-work-inbox") {
		t.Fatalf("Personal search = %s", raw)
	}

	// Unknown workspace: an argument error listing the names.
	if _, err := f.call(reader, "list_tasks", map[string]any{"workspace": "Acme"}); !isArgErr(err) || !strings.Contains(err.Error(), "Work") {
		t.Fatalf("unknown workspace: %v", err)
	}

	// Create in a workspace; a task without a project in it.
	out := f.mustCall(agent("u1"), "create_project", map[string]any{"name": "Launch", "workspace_id": work.ID, "client_request_id": "r1"})
	pid := out["results"].([]map[string]any)[0]["id"].(string)
	p, _ := f.sync.Get(ctx, "u1", "project", pid)
	if string(p["workspace_id"]) != `"`+work.ID+`"` {
		t.Fatalf("created project workspace_id = %s", p["workspace_id"])
	}
	out = f.mustCall(agent("u1"), "create_tasks", map[string]any{"items": []any{map[string]any{"title": "Email", "workspace_id": work.ID}}, "client_request_id": "r2"})
	tid := out["results"].([]map[string]any)[0]["id"].(string)
	if got := string(f.get("u1", tid)["workspace_id"]); got != `"`+work.ID+`"` {
		t.Fatalf("created task workspace_id = %s", got)
	}
	// Move back to the default workspace: stored as null.
	f.mustCall(agent("u1"), "update_project", map[string]any{"id": pid, "workspace_id": nil})
	p, _ = f.sync.Get(ctx, "u1", "project", pid)
	if string(p["workspace_id"]) != "null" {
		t.Fatalf("moved project workspace_id = %s", p["workspace_id"])
	}
}
