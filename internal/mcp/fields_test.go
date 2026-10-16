package mcp

import (
	"encoding/json"
	"testing"
)

// Custom fields (OpenSpec custom-fields): list_projects and the project
// resource carry the definitions, tasks their values.
func TestFieldsInToolsAndResources(t *testing.T) {
	f := newFixture(t)
	f.put("u1", "project", "p1", map[string]any{"name": "Kitchen", "position": 1, "archived": false, "created_at": 1})
	f.put("u1", "field", "cost", map[string]any{"name": "Cost", "project_id": "p1", "type": "number", "options": "", "position": 1, "created_at": 1})
	f.put("u1", "field", "client", map[string]any{"name": "Client", "project_id": "p1", "type": "choice", "options": "Acme\nGlobex", "position": 2, "created_at": 1})
	f.task("u1", "t1", "Tiles", map[string]any{"project_id": "p1", "fields.cost": 120, "fields.client": "Acme"})

	projects := f.tool("u1", "list_projects", map[string]any{})["projects"].([]any)
	defs := projects[0].(map[string]any)["fields"].([]any)
	if len(defs) != 2 || defs[0].(map[string]any)["type"] != "number" || ut(defs[1].(map[string]any))["name"] != "Client" {
		t.Fatalf("fields = %v", defs)
	}
	task := f.tool("u1", "get_task", map[string]any{"id": "t1"})["task"].(map[string]any)
	if task["fields"].(map[string]any)["cost"] != float64(120) || ut(task)["fields"].(map[string]any)["client"] != "Acme" {
		t.Fatalf("task = %v", task)
	}

	r := f.call("u1", "resources/read", map[string]any{"uri": "opentodo://projects/p1"})
	c := r["result"].(map[string]any)["contents"].([]any)[0].(map[string]any)
	var payload map[string]any
	_ = json.Unmarshal([]byte(c["text"].(string)), &payload)
	if n := len(payload["project"].(map[string]any)["fields"].([]any)); n != 2 {
		t.Fatalf("project resource fields = %v", payload["project"])
	}
}
