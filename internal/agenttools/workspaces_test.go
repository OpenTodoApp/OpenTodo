package agenttools

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
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

// workspaces: a sub-project moved to the top level keeps its workspace (issue 544).
func TestProjectToTopLevelKeepsWorkspace(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	name := "Work"
	work, err := f.sync.CreateWorkspace(ctx, "u1", opsync.WorkspaceInput{Name: &name})
	if err != nil {
		t.Fatal(err)
	}
	f.put("u1", "project", "clients", map[string]any{"name": "Clients", "workspace_id": work.ID})
	f.put("u1", "project", "acme", map[string]any{"name": "Acme", "parent_id": "clients"})
	f.put("u1", "project", "home", map[string]any{"name": "Home"})
	f.put("u1", "project", "shed", map[string]any{"name": "Shed", "parent_id": "home"})
	f.mustCall(agent("u1"), "update_project", map[string]any{"id": "acme", "parent_id": nil})
	f.mustCall(agent("u1"), "update_project", map[string]any{"id": "shed", "parent_id": nil})
	p, _ := f.sync.Get(ctx, "u1", "project", "acme")
	if got := string(p["workspace_id"]); got != `"`+work.ID+`"` {
		t.Fatalf("Work sub-project workspace_id = %s", got)
	}
	p, _ = f.sync.Get(ctx, "u1", "project", "shed")
	if got, ok := p["workspace_id"]; ok && string(got) != "null" {
		t.Fatalf("default sub-project workspace_id = %s", got)
	}
}

// workspaces "Moving a task out of its project keeps its workspace" (#508).
func TestMoveToInboxKeepsWorkspace(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	name := "Work"
	work, err := f.sync.CreateWorkspace(ctx, "u1", opsync.WorkspaceInput{Name: &name})
	if err != nil {
		t.Fatal(err)
	}
	f.put("u1", "project", "unsorted", map[string]any{"name": "Unsorted", "workspace_id": work.ID})
	f.put("u1", "project", "garden", map[string]any{"name": "Garden"})
	f.task("u1", "t-work", "Write the report", map[string]any{"project_id": "unsorted"})
	f.task("u1", "t-home", "Water the plants", map[string]any{"project_id": "garden"})
	f.mustCall(agent("u1"), "move_tasks", map[string]any{"ids": []string{"t-work", "t-home"}, "project_id": nil})
	if got := string(f.get("u1", "t-work")["workspace_id"]); got != `"`+work.ID+`"` {
		t.Fatalf("Work task workspace_id = %s", got)
	}
	// A task of the default workspace writes no workspace_id.
	if got, ok := f.get("u1", "t-home")["workspace_id"]; ok && string(got) != "null" {
		t.Fatalf("default task workspace_id = %s", got)
	}
	inbox := f.mustCall(Caller{UserID: "u1", Scope: "read"}, "list_tasks", map[string]any{"view": "inbox", "workspace": work.ID})["tasks"]
	if raw, _ := json.Marshal(inbox); !strings.Contains(string(raw), "t-work") || strings.Contains(string(raw), "t-home") {
		t.Fatalf("Work inbox = %s", raw)
	}
}

// create_label in a workspace (issue 1222): by id or name, the default one
// without it, a name counted per workspace, and a task's label name resolved
// to the label of the task's workspace.
func TestCreateLabelInWorkspace(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	name := "VPC"
	vpc, err := f.sync.CreateWorkspace(ctx, "u1", opsync.WorkspaceInput{Name: &name})
	if err != nil {
		t.Fatal(err)
	}
	f.put("u1", "project", "client", map[string]any{"name": "Client", "workspace_id": vpc.ID})
	f.task("u1", "t-client", "Send the offer", map[string]any{"project_id": "client"})
	labelID := func(out map[string]any) (string, string) {
		r := out["results"].([]map[string]any)[0]
		return r["id"].(string), r["status"].(string)
	}
	home, st := labelID(f.mustCall(agent("u1"), "create_label", map[string]any{"name": "Hofer", "client_request_id": "l1"}))
	if st != "created" {
		t.Fatalf("default label status = %s", st)
	}
	if l, _ := f.sync.Get(ctx, "u1", "label", home); l["workspace_id"] != nil && string(l["workspace_id"]) != "null" {
		t.Fatalf("default label workspace_id = %s", l["workspace_id"])
	}
	// The same name in VPC, by the workspace's name: a new label there.
	inVPC, st := labelID(f.mustCall(agent("u1"), "create_label", map[string]any{"name": "hofer", "workspace_id": "vpc", "client_request_id": "l2"}))
	if st != "created" || inVPC == home {
		t.Fatalf("VPC label = %s %s", inVPC, st)
	}
	if l, _ := f.sync.Get(ctx, "u1", "label", inVPC); string(l["workspace_id"]) != `"`+vpc.ID+`"` {
		t.Fatalf("VPC label workspace_id = %s", l["workspace_id"])
	}
	// Again in VPC, by id: the existing one.
	if again, st := labelID(f.mustCall(agent("u1"), "create_label", map[string]any{"name": "HOFER", "workspace_id": vpc.ID, "client_request_id": "l3"})); again != inVPC || st != "exists" {
		t.Fatalf("again = %s %s", again, st)
	}
	// A task of the VPC workspace gets VPC's label for the name, a task of
	// the default workspace the default one.
	f.mustCall(agent("u1"), "update_tasks", map[string]any{"updates": []any{map[string]any{"id": "t-client", "labels": []string{"Hofer"}}}})
	if got := string(f.get("u1", "t-client")["labels"]); got != `["`+inVPC+`"]` {
		t.Fatalf("VPC task labels = %s, want the VPC label", got)
	}
	out := f.mustCall(agent("u1"), "create_tasks", map[string]any{"items": []any{map[string]any{"title": "Home errand", "labels": []string{"hofer"}}}, "client_request_id": "t1"})
	tid := out["results"].([]map[string]any)[0]["id"].(string)
	if got := string(f.get("u1", tid)["labels"]); got != `["`+home+`"]` {
		t.Fatalf("default task labels = %s, want the default label", got)
	}
	// A workspace that is not the user's is refused.
	if _, err := f.call(agent("u1"), "create_label", map[string]any{"name": "X", "workspace_id": "Acme", "client_request_id": "l4"}); !isArgErr(err) {
		t.Fatalf("unknown workspace: %v", err)
	}
}
