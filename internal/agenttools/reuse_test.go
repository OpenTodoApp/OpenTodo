package agenttools

import (
	"encoding/json"
	"strings"
	"testing"
)

// TestReusableListTools (OpenSpec reusable-lists, task 3.3): update_project
// turns the mode on, list_projects shows it, and create_tasks in a reusable
// list reopens a ticked-off item or reports an open one instead of creating a
// second; new: true creates anyway, and an ordinary project is unchanged.
func TestReusableListTools(t *testing.T) {
	f := newFixture(t)
	c := agent("u1")
	out := f.mustCall(c, "create_project", map[string]any{"name": "Groceries", "client_request_id": "r-groc"})
	pid := out["results"].([]map[string]any)[0]["id"].(string)
	f.mustCall(c, "update_project", map[string]any{"id": pid, "reusable": true, "aisles": true})
	if !boolean(f.entity("u1", "project", pid), "reusable") || !boolean(f.entity("u1", "project", pid), "aisles") {
		t.Fatal("update_project did not set the mode")
	}
	if _, err := f.call(c, "update_project", map[string]any{"id": pid, "reusable": "yes"}); !isArgErr(err) {
		t.Fatalf("reusable yes: %v", err)
	}
	raw, _ := json.Marshal(f.mustCall(Caller{UserID: "u1", Scope: "read"}, "list_projects", nil)["projects"])
	if !strings.Contains(string(raw), `"reusable":true`) || !strings.Contains(string(raw), `"aisles":true`) {
		t.Fatalf("projects = %s", raw)
	}

	out = f.mustCall(c, "create_tasks", map[string]any{"items": []any{map[string]any{"title": "Milk", "project_id": pid}}, "client_request_id": "r-milk"})
	milk := out["results"].([]map[string]any)[0]["id"].(string)
	f.mustCall(c, "complete_tasks", map[string]any{"ids": []string{milk}})

	out = f.mustCall(c, "create_tasks", map[string]any{"items": []any{
		map[string]any{"title": "milk", "project_id": pid},
		map[string]any{"title": "Eggs", "project_id": pid},
	}, "client_request_id": "r-again"})
	res := out["results"].([]map[string]any)
	if res[0]["id"] != milk || res[0]["status"] != "reopened" || res[1]["status"] != "created" {
		t.Fatalf("results = %v", res)
	}
	if string(f.entity("u1", "task", milk)["completed_at"]) != "null" {
		t.Fatal("Milk was not reopened")
	}
	out = f.mustCall(c, "create_tasks", map[string]any{"items": []any{map[string]any{"title": "MILK", "project_id": pid}}, "client_request_id": "r-open"})
	if r := out["results"].([]map[string]any)[0]; r["id"] != milk || r["status"] != "already_on_list" {
		t.Fatalf("open match = %v", r)
	}
	out = f.mustCall(c, "create_tasks", map[string]any{"items": []any{map[string]any{"title": "Milk", "project_id": pid, "new": true}}, "client_request_id": "r-new"})
	if r := out["results"].([]map[string]any)[0]; r["id"] == milk || r["status"] != "created" {
		t.Fatalf("new: true = %v", r)
	}

	out = f.mustCall(c, "create_project", map[string]any{"name": "Work", "client_request_id": "r-work"})
	work := out["results"].([]map[string]any)[0]["id"].(string)
	for i, key := range []string{"r-w1", "r-w2"} {
		out = f.mustCall(c, "create_tasks", map[string]any{"items": []any{map[string]any{"title": "Report", "project_id": work}}, "client_request_id": key})
		if r := out["results"].([]map[string]any)[0]; r["status"] != "created" {
			t.Fatalf("ordinary project %d = %v", i, r)
		}
	}
}
