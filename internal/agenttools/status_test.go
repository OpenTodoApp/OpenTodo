package agenttools

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

// TestProjectStatusTools (OpenSpec change project-review-cadence, task 4.2):
// update_project takes status from the closed set and refuses anything else
// naming the argument; project output and the project resource carry it, an
// empty or unknown stored value reading as active.
func TestProjectStatusTools(t *testing.T) {
	f := newFixture(t)
	c := agent("u1")
	out := f.mustCall(c, "create_project", map[string]any{"name": "Garden", "client_request_id": "r-status"})
	pid := out["results"].([]map[string]any)[0]["id"].(string)
	f.mustCall(c, "update_project", map[string]any{"id": pid, "status": "maintenance"})
	if str(f.entity("u1", "project", pid), "status") != "maintenance" {
		t.Fatal("update_project did not set the status")
	}
	for _, bad := range []any{"paused", "", 1, nil} {
		if _, err := f.call(c, "update_project", map[string]any{"id": pid, "status": bad}); !isArgErr(err) || !strings.Contains(err.Error(), "status") {
			t.Fatalf("status %v: %v", bad, err)
		}
	}

	reader := Caller{UserID: "u1", Scope: "read"}
	f.put("u1", "project", "car", map[string]any{"name": "Car", "color": "#64748b", "archived": false, "parent_id": nil, "status": "on-hold"})
	raw, _ := json.Marshal(f.mustCall(reader, "list_projects", nil)["projects"])
	if !strings.Contains(string(raw), `"status":"maintenance"`) || !strings.Contains(string(raw), `"status":"active"`) {
		t.Fatalf("projects = %s", raw)
	}
	res, ok, err := f.reg.ProjectResource(t.Context(), "u1", pid, time.UTC)
	if err != nil || !ok {
		t.Fatal(ok, err)
	}
	raw, _ = json.Marshal(res["project"])
	if !strings.Contains(string(raw), `"status":"maintenance"`) {
		t.Fatalf("project resource = %s", raw)
	}
}
