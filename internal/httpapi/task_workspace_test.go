package httpapi

import "testing"

// workspaces "Moving a task out of its project keeps its workspace" (#508):
// the REST path the CLI and scripts use.
func TestTaskToInboxKeepsWorkspace(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("POST", "/api/v1/workspaces", map[string]any{"name": "Work"})
	e.mustStatus(resp, 201, out)
	work := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/projects", map[string]any{"name": "Unsorted", "workspace_id": work})
	e.mustStatus(resp, 201, out)
	unsorted := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Report", "project_id": unsorted})
	e.mustStatus(resp, 201, out)
	task := out["id"].(string)
	resp, out = e.do("PATCH", "/api/v1/tasks/"+task, map[string]any{"project_id": nil})
	e.mustStatus(resp, 200, out)
	if out["workspace_id"] != work || out["project_id"] != nil {
		t.Fatalf("moved task = %v", out)
	}
	// A task of the default workspace keeps null.
	resp, out = e.do("POST", "/api/v1/projects", map[string]any{"name": "Garden"})
	e.mustStatus(resp, 201, out)
	garden := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Water", "project_id": garden})
	e.mustStatus(resp, 201, out)
	home := out["id"].(string)
	resp, out = e.do("PATCH", "/api/v1/tasks/"+home, map[string]any{"project_id": nil})
	e.mustStatus(resp, 200, out)
	if v, ok := out["workspace_id"]; ok && v != nil {
		t.Fatalf("default task workspace_id = %v", v)
	}
}

// workspaces: a sub-project moved to the top level keeps its workspace (issue 544).
func TestProjectToTopLevelKeepsWorkspace(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("POST", "/api/v1/workspaces", map[string]any{"name": "Work"})
	e.mustStatus(resp, 201, out)
	work := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/projects", map[string]any{"name": "Clients", "workspace_id": work})
	e.mustStatus(resp, 201, out)
	clients := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/projects", map[string]any{"name": "Acme", "parent_id": clients})
	e.mustStatus(resp, 201, out)
	acme := out["id"].(string)
	resp, out = e.do("PATCH", "/api/v1/projects/"+acme, map[string]any{"parent_id": nil})
	e.mustStatus(resp, 200, out)
	if out["workspace_id"] != work || out["parent_id"] != nil {
		t.Fatalf("moved project = %v", out)
	}
	// A project of the default workspace keeps null.
	resp, out = e.do("POST", "/api/v1/projects", map[string]any{"name": "Home"})
	e.mustStatus(resp, 201, out)
	home := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/projects", map[string]any{"name": "Shed", "parent_id": home})
	e.mustStatus(resp, 201, out)
	shed := out["id"].(string)
	resp, out = e.do("PATCH", "/api/v1/projects/"+shed, map[string]any{"parent_id": nil})
	e.mustStatus(resp, 200, out)
	if v, ok := out["workspace_id"]; ok && v != nil {
		t.Fatalf("default project workspace_id = %v", v)
	}
}
