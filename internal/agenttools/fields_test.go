package agenttools

import (
	"encoding/json"
	"strings"
	"testing"
)

// Custom fields (OpenSpec change custom-fields, design D6).

func (f *fixture) kitchen(uid string) {
	f.put(uid, "project", "kitchen", map[string]any{"name": "Kitchen", "color": "#64748b", "archived": false, "position": 1})
	f.put(uid, "field", "cost", map[string]any{"name": "Cost", "project_id": "kitchen", "type": "number", "options": "", "position": 1})
	f.put(uid, "field", "client", map[string]any{"name": "Client", "project_id": "kitchen", "type": "choice", "options": "Acme\nGlobex", "position": 2})
	f.put(uid, "field", "paid", map[string]any{"name": "Paid", "project_id": "kitchen", "type": "checkbox", "options": "", "position": 3})
}

// Scenario "Fields in results".
func TestFieldsInResults(t *testing.T) {
	f := newFixture(t)
	f.kitchen("u1")
	f.task("u1", "t1", "Tiles", map[string]any{"project_id": "kitchen", "fields.cost": 120, "fields.client": "Acme", "fields.other": "hidden"})
	c := agent("u1")
	out := f.mustCall(c, "list_projects", map[string]any{})
	raw, _ := json.Marshal(out["projects"])
	var ps []struct {
		ID     string `json:"id"`
		Fields []struct {
			ID        string `json:"id"`
			Type      string `json:"type"`
			Untrusted struct {
				Name    string   `json:"name"`
				Options []string `json:"options"`
			} `json:"untrusted_text"`
		} `json:"fields"`
	}
	_ = json.Unmarshal(raw, &ps)
	if len(ps) != 1 || len(ps[0].Fields) != 3 {
		t.Fatalf("projects = %s", raw)
	}
	cl := ps[0].Fields[1]
	if ps[0].Fields[0].ID != "cost" || ps[0].Fields[0].Type != "number" || cl.Untrusted.Name != "Client" || strings.Join(cl.Untrusted.Options, ",") != "Acme,Globex" {
		t.Fatalf("fields = %+v", ps[0].Fields)
	}
	got := f.mustCall(c, "get_task", map[string]any{"id": "t1"})
	raw, _ = json.Marshal(got)
	var task struct {
		Task struct {
			Fields    map[string]any `json:"fields"`
			Untrusted struct {
				Fields map[string]string `json:"fields"`
			} `json:"untrusted_text"`
		} `json:"task"`
	}
	_ = json.Unmarshal(raw, &task)
	if task.Task.Fields["cost"] != float64(120) || task.Task.Untrusted.Fields["client"] != "Acme" {
		t.Fatalf("task = %s", raw)
	}
	if strings.Contains(string(raw), "hidden") {
		t.Fatalf("value of a foreign definition shown: %s", raw)
	}
}

// Scenarios "Set a field value" and "Value of the wrong type".
func TestUpdateTasksSetsFieldValues(t *testing.T) {
	f := newFixture(t)
	f.kitchen("u1")
	f.task("u1", "t1", "Tiles", map[string]any{"project_id": "kitchen"})
	c := agent("u1")
	out := f.mustCall(c, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": "t1", "fields": map[string]any{"cost": 120}}}})
	if out["changed"] != 1 {
		t.Fatalf("result = %v", out)
	}
	if v := string(f.get("u1", "t1")["fields.cost"]); v != "120" {
		t.Fatalf("cost = %s", v)
	}
	// The advertised list spelling reads text by the field's type.
	f.mustCall(c, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": "t1", "fields": []any{
		map[string]any{"id": "cost", "value": "99.5"}, map[string]any{"id": "paid", "value": "true"}, map[string]any{"id": "client", "value": "Globex"}}}}})
	task := f.get("u1", "t1")
	if string(task["fields.cost"]) != "99.5" || string(task["fields.paid"]) != "true" || string(task["fields.client"]) != `"Globex"` {
		t.Fatalf("task = %v", task)
	}
	for _, bad := range []any{
		map[string]any{"cost": "cheap"},
		map[string]any{"client": "Initech"},
		map[string]any{"nope": 1},
		[]any{map[string]any{"id": "cost", "value": "cheap"}},
		[]any{map[string]any{"id": "paid", "value": "maybe"}},
		"cost=1",
	} {
		_, err := f.call(c, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": "t1", "fields": bad}}})
		if !isArgErr(err) {
			t.Fatalf("%v: %v", bad, err)
		}
		if m, ok := bad.(map[string]any); ok && m["cost"] == "cheap" && (!strings.Contains(err.Error(), "cost") || !strings.Contains(err.Error(), "number")) {
			t.Fatalf("message names neither the field nor its type: %v", err)
		}
	}
	if v := string(f.get("u1", "t1")["fields.cost"]); v != "99.5" {
		t.Fatalf("refused call changed cost: %s", v)
	}
	// create_tasks takes values for the target project.
	res := f.mustCall(c, "create_tasks", map[string]any{"items": []any{map[string]any{"title": "Grout", "project_id": "kitchen", "fields": map[string]any{"cost": 15}}}})
	id := res["results"].([]map[string]any)[0]["id"].(string)
	if v := string(f.get("u1", id)["fields.cost"]); v != "15" {
		t.Fatalf("created cost = %s", v)
	}
	if _, err := f.call(c, "create_tasks", map[string]any{"items": []any{map[string]any{"title": "Inbox", "fields": map[string]any{"cost": 15}}}}); !isArgErr(err) {
		t.Fatalf("inbox task with a value: %v", err)
	}
	// An encrypted account cannot have text values written by an assistant.
	enc := agent("u1")
	enc.Encrypted = true
	if _, err := f.call(enc, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": "t1", "fields": map[string]any{"client": "Acme"}}}}); toolCode(err) != "encryption_enabled" {
		t.Fatalf("encrypted text value: %v", err)
	}
	f.mustCall(enc, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": "t1", "fields": map[string]any{"cost": 1}}}})
}
