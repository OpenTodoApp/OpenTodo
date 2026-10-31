package agenttools

import (
	"encoding/json"
	"strings"
	"testing"
)

// TestSpanTools (OpenSpec change multi-day-tasks, task 6.6): create_tasks and
// update_tasks take span as a boolean, a task result carries span: true only
// for a span, and a non-boolean is a tool error that writes nothing.
func TestSpanTools(t *testing.T) {
	f := newFixture(t)
	c := agent("u1")
	out := f.mustCall(c, "create_tasks", map[string]any{"items": []any{map[string]any{"title": "Lisbon trip", "start": "2026-11-03", "due": map[string]any{"date": "2026-11-05"}, "span": true}}, "client_request_id": "r-span"})
	id := out["results"].([]map[string]any)[0]["id"].(string)
	if e := f.entity("u1", "task", id); string(e["span"]) != "true" || str(e, "start") != "2026-11-03" {
		t.Fatalf("span %s, start %s", e["span"], e["start"])
	}
	got := f.mustCall(c, "get_task", map[string]any{"id": id})
	raw, _ := json.Marshal(got)
	if !strings.Contains(string(raw), `"span":true`) {
		t.Fatalf("get_task = %s", raw)
	}

	f.mustCall(c, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": id, "span": false}}})
	if e := f.entity("u1", "task", id); string(e["span"]) != "false" {
		t.Fatalf("span %s", e["span"])
	}
	got = f.mustCall(c, "get_task", map[string]any{"id": id})
	if raw, _ = json.Marshal(got); strings.Contains(string(raw), `"span"`) {
		t.Fatalf("plain task carries span: %s", raw)
	}

	for _, bad := range []any{"yes", 1} {
		if _, err := f.call(c, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": id, "span": bad}}}); !isArgErr(err) || !strings.Contains(err.Error(), "span") {
			t.Fatalf("span %v: %v", bad, err)
		}
	}
	if string(f.entity("u1", "task", id)["span"]) != "false" {
		t.Fatal("a refused call wrote")
	}
}
