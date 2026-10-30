package agenttools

import (
	"encoding/json"
	"strings"
	"testing"
)

// TestEnergyTools (OpenSpec change task-energy, task 4.3): create_tasks and
// update_tasks take energy, null clears it, an unknown level is a tool error
// that writes nothing, and get_task returns it.
func TestEnergyTools(t *testing.T) {
	f := newFixture(t)
	c := agent("u1")
	out := f.mustCall(c, "create_tasks", map[string]any{"items": []any{map[string]any{"title": "Draft the plan", "energy": "deep"}}, "client_request_id": "r-energy"})
	id := out["results"].([]map[string]any)[0]["id"].(string)
	if e := f.entity("u1", "task", id); str(e, "energy") != "deep" {
		t.Fatalf("created energy %s", e["energy"])
	}
	got := f.mustCall(c, "get_task", map[string]any{"id": id})
	raw, _ := json.Marshal(got)
	if !strings.Contains(string(raw), `"energy":"deep"`) {
		t.Fatalf("get_task = %s", raw)
	}

	f.mustCall(c, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": id, "energy": "low"}}})
	if e := f.entity("u1", "task", id); str(e, "energy") != "low" {
		t.Fatalf("updated energy %s", e["energy"])
	}

	for _, bad := range []any{"high", "Deep", 3} {
		if _, err := f.call(c, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": id, "energy": bad}}}); !isArgErr(err) || !strings.Contains(err.Error(), "energy") {
			t.Fatalf("energy %v: %v", bad, err)
		}
	}
	if e := f.entity("u1", "task", id); str(e, "energy") != "low" {
		t.Fatal("a refused call wrote")
	}

	f.mustCall(c, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": id, "energy": nil}}})
	if e := f.entity("u1", "task", id); string(e["energy"]) != `""` {
		t.Fatalf("cleared energy %s", e["energy"])
	}
	got = f.mustCall(c, "get_task", map[string]any{"id": id})
	raw, _ = json.Marshal(got)
	if !strings.Contains(string(raw), `"energy":null`) {
		t.Fatalf("get_task after clear = %s", raw)
	}
}
