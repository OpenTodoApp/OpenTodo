package agenttools

import (
	"encoding/json"
	"slices"
	"strings"
	"testing"
	"time"
)

// Flows through the agent tools (OpenSpec change project-flow-modes, task 6.2).

func taskIDsOf(t *testing.T, out map[string]any) []string {
	t.Helper()
	raw, _ := json.Marshal(out["tasks"])
	var list []struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(raw, &list); err != nil {
		t.Fatal(err)
	}
	var ids []string
	for _, x := range list {
		ids = append(ids, x.ID)
	}
	slices.Sort(ids)
	return ids
}

// TestListTasksAvailable: "An assistant asks what can be done now" — only the
// current step of a sequential project, the same tasks the web app shows undimmed.
func TestListTasksAvailable(t *testing.T) {
	f := newFixture(t)
	reader := Caller{UserID: "u1", Scope: "read"}
	f.put("u1", "project", "move", map[string]any{"name": "Move house", "color": "#64748b", "archived": false, "parent_id": nil, "flow_mode": "sequential"})
	f.put("u1", "section", "pack", map[string]any{"name": "Pack", "project_id": "move", "position": 1, "flow_mode": "parallel"})
	for i, id := range []string{"van", "kitchen", "bathroom", "keys"} {
		fields := map[string]any{"title": id, "project_id": "move", "parent_id": nil, "position": i, "completed_at": nil}
		if id == "kitchen" || id == "bathroom" {
			fields["section_id"] = "pack"
		}
		if id == "keys" {
			fields["position"] = 0.5
		}
		f.put("u1", "task", id, fields)
	}
	f.put("u1", "task", "loose", map[string]any{"title": "Loose", "project_id": nil, "parent_id": nil, "position": 1, "completed_at": nil})

	got := taskIDsOf(t, f.mustCall(reader, "list_tasks", map[string]any{"available": true}))
	if !slices.Equal(got, []string{"loose", "van"}) {
		t.Fatalf("available = %v", got)
	}
	got = taskIDsOf(t, f.mustCall(reader, "list_tasks", map[string]any{"available": false, "project_id": "move"}))
	if !slices.Equal(got, []string{"bathroom", "keys", "kitchen"}) {
		t.Fatalf("not available = %v", got)
	}
	// Completing the steps before the section offers the whole parallel section.
	f.put("u1", "task", "van", map[string]any{"completed_at": 1})
	f.put("u1", "task", "keys", map[string]any{"completed_at": 1})
	got = taskIDsOf(t, f.mustCall(reader, "list_tasks", map[string]any{"available": true, "project_id": "move"}))
	if !slices.Equal(got, []string{"bathroom", "kitchen"}) {
		t.Fatalf("available after two steps = %v", got)
	}
	if _, err := f.call(reader, "list_tasks", map[string]any{"available": "yes"}); !isArgErr(err) {
		t.Fatalf("non-boolean available: %v", err)
	}

	// Project output and the project resource carry the flows.
	raw, _ := json.Marshal(f.mustCall(reader, "list_projects", nil)["projects"])
	if !strings.Contains(string(raw), `"flow_mode":"sequential"`) {
		t.Fatalf("projects = %s", raw)
	}
	res, ok, err := f.reg.ProjectResource(t.Context(), "u1", "move", time.UTC)
	if err != nil || !ok {
		t.Fatal(ok, err)
	}
	raw, _ = json.Marshal(res["sections"])
	if !strings.Contains(string(raw), `"flow_mode":"parallel"`) {
		t.Fatalf("sections = %s", raw)
	}
}

// TestFlowModeWrites: the project and section tools take flow_mode from the
// closed sets and refuse anything else naming the argument.
func TestFlowModeWrites(t *testing.T) {
	f := newFixture(t)
	c := agent("u1")
	out := f.mustCall(c, "create_project", map[string]any{"name": "Finances", "flow_mode": "area", "client_request_id": "r-flow"})
	pid := out["results"].([]map[string]any)[0]["id"].(string)
	if str(f.entity("u1", "project", pid), "flow_mode") != "area" {
		t.Fatal("create_project did not set the flow")
	}
	f.mustCall(c, "update_project", map[string]any{"id": pid, "flow_mode": "sequential"})
	if str(f.entity("u1", "project", pid), "flow_mode") != "sequential" {
		t.Fatal("update_project did not set the flow")
	}
	out = f.mustCall(c, "create_sections", map[string]any{"project_id": pid, "items": []map[string]any{{"name": "Taxes", "flow_mode": "sequential"}}})
	sid := out["results"].([]map[string]any)[0]["id"].(string)
	if str(f.entity("u1", "section", sid), "flow_mode") != "sequential" {
		t.Fatal("create_sections did not set the flow")
	}
	f.mustCall(c, "update_sections", map[string]any{"updates": []map[string]any{{"id": sid, "flow_mode": ""}}})
	if str(f.entity("u1", "section", sid), "flow_mode") != "" {
		t.Fatal("update_sections did not clear the flow")
	}
	for _, bad := range []struct {
		tool string
		args map[string]any
	}{
		{"update_project", map[string]any{"id": pid, "flow_mode": "serial"}},
		{"update_project", map[string]any{"id": pid, "flow_mode": ""}},
		{"create_project", map[string]any{"name": "X", "flow_mode": 1}},
		{"update_sections", map[string]any{"updates": []map[string]any{{"id": sid, "flow_mode": "area"}}}},
	} {
		if _, err := f.call(c, bad.tool, bad.args); !isArgErr(err) || !strings.Contains(err.Error(), "flow_mode") {
			t.Fatalf("%s %v: %v", bad.tool, bad.args, err)
		}
	}
}
