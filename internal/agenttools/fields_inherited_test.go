package agenttools

import (
	"encoding/json"
	"testing"
)

// Inherited fields (OpenSpec change inherited-custom-fields): list_projects
// shows a sub-project's inherited fields first, each with the project that
// defines it, and a sub-project's task reads and writes them like its own.
func TestInheritedFieldsInTools(t *testing.T) {
	f := newFixture(t)
	f.kitchen("u1")
	f.put("u1", "project", "tiles", map[string]any{"name": "Tiles", "color": "#64748b", "archived": false, "position": 2, "parent_id": "kitchen"})
	f.put("u1", "field", "grout", map[string]any{"name": "Grout", "project_id": "tiles", "type": "text", "options": "", "position": 1})
	f.task("u1", "t1", "Wall", map[string]any{"project_id": "tiles", "fields.cost": 40})
	c := agent("u1")

	out := f.mustCall(c, "list_projects", map[string]any{})
	raw, _ := json.Marshal(out["projects"])
	var ps []struct {
		ID     string `json:"id"`
		Fields []struct {
			ID            string `json:"id"`
			InheritedFrom string `json:"inherited_from"`
		} `json:"fields"`
	}
	_ = json.Unmarshal(raw, &ps)
	var tiles []string
	for _, p := range ps {
		if p.ID != "tiles" {
			continue
		}
		for _, fd := range p.Fields {
			tiles = append(tiles, fd.ID+"<"+fd.InheritedFrom)
		}
	}
	want := []string{"cost<kitchen", "client<kitchen", "paid<kitchen", "grout<"}
	if len(tiles) != len(want) {
		t.Fatalf("tiles fields = %v (projects %s)", tiles, raw)
	}
	for i := range want {
		if tiles[i] != want[i] {
			t.Fatalf("tiles fields = %v, want %v", tiles, want)
		}
	}

	got := f.mustCall(c, "get_task", map[string]any{"id": "t1"})
	raw, _ = json.Marshal(got)
	var task struct {
		Task struct {
			Fields map[string]any `json:"fields"`
		} `json:"task"`
	}
	_ = json.Unmarshal(raw, &task)
	if task.Task.Fields["cost"] != float64(40) {
		t.Fatalf("inherited value not shown: %s", raw)
	}
	f.mustCall(c, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": "t1", "fields": map[string]any{"cost": 55, "grout": "white"}}}})
	if v := string(f.get("u1", "t1")["fields.cost"]); v != "55" {
		t.Fatalf("inherited write = %s", v)
	}
}
