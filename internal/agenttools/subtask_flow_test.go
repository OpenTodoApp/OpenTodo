package agenttools

import (
	"strings"
	"testing"
)

// TestSubtaskFlowTools (OpenSpec change subtask-flow, GitHub issue 1046):
// update_tasks sets how a task's subtasks flow, an unknown value is a tool error
// that writes nothing, and list_tasks with available leaves out the later
// subtasks of a parent whose subtasks go one at a time.
func TestSubtaskFlowTools(t *testing.T) {
	f := newFixture(t)
	c := agent("u1")
	out := f.mustCall(c, "create_tasks", map[string]any{"items": []any{map[string]any{"title": "Paint the doghouse"}}, "client_request_id": "r-flow-parent"})
	parent := out["results"].([]map[string]any)[0]["id"].(string)
	out = f.mustCall(c, "create_tasks", map[string]any{"items": []any{
		map[string]any{"title": "Buy paint", "parent_id": parent},
		map[string]any{"title": "Paint it", "parent_id": parent},
	}, "client_request_id": "r-flow-children"})
	results := out["results"].([]map[string]any)
	first, second := results[0]["id"].(string), results[1]["id"].(string)

	f.mustCall(c, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": parent, "flow_mode": "sequential"}}})
	if e := f.entity("u1", "task", parent); str(e, "flow_mode") != "sequential" {
		t.Fatalf("flow_mode %s", e["flow_mode"])
	}
	for _, bad := range []any{"area", "Sequential", 1} {
		if _, err := f.call(c, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": parent, "flow_mode": bad}}}); !isArgErr(err) || !strings.Contains(err.Error(), "flow_mode") {
			t.Fatalf("flow_mode %v: %v", bad, err)
		}
	}

	ids := map[string]bool{}
	for _, id := range taskIDsOf(t, f.mustCall(c, "list_tasks", map[string]any{"available": true})) {
		ids[id] = true
	}
	if !ids[parent] || !ids[first] || ids[second] {
		t.Fatalf("available tasks = %v (parent %s, first %s, second %s)", ids, parent, first, second)
	}

	f.mustCall(c, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": parent, "flow_mode": ""}}})
	if e := f.entity("u1", "task", parent); str(e, "flow_mode") != "" {
		t.Fatalf("cleared flow_mode %s", e["flow_mode"])
	}
}
