package agenttools

import (
	"encoding/json"
	"strings"
	"testing"
)

// TestDayPartTools (OpenSpec change day-parts, task 4.4): create_tasks and
// update_tasks take day_part and write it paired with the evening flag; an
// unknown part is a tool error that writes nothing; get_task returns it.
func TestDayPartTools(t *testing.T) {
	f := newFixture(t)
	c := agent("u1")
	out := f.mustCall(c, "create_tasks", map[string]any{"items": []any{map[string]any{"title": "Read", "evening": true}}, "client_request_id": "r-part"})
	id := out["results"].([]map[string]any)[0]["id"].(string)

	f.mustCall(c, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": id, "day_part": "morning"}}})
	e := f.entity("u1", "task", id)
	if str(e, "day_part") != "morning" || string(e["evening"]) != "false" {
		t.Fatalf("day_part %s, evening %s", e["day_part"], e["evening"])
	}
	got := f.mustCall(c, "get_task", map[string]any{"id": id})
	raw, _ := json.Marshal(got)
	if !strings.Contains(string(raw), `"day_part":"morning"`) || !strings.Contains(string(raw), `"evening":false`) {
		t.Fatalf("get_task = %s", raw)
	}

	f.mustCall(c, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": id, "day_part": "evening"}}})
	e = f.entity("u1", "task", id)
	if string(e["day_part"]) != "null" || string(e["evening"]) != "true" {
		t.Fatalf("evening: day_part %s, evening %s", e["day_part"], e["evening"])
	}

	for _, bad := range []any{"night", "", 3} {
		if _, err := f.call(c, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": id, "day_part": bad}}}); !isArgErr(err) || !strings.Contains(err.Error(), "day_part") {
			t.Fatalf("day_part %v: %v", bad, err)
		}
	}
	if string(f.entity("u1", "task", id)["evening"]) != "true" {
		t.Fatal("a refused call wrote")
	}
}
