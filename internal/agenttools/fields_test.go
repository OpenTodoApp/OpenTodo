package agenttools

import (
	"encoding/json"
	"strings"
	"testing"
)

// Custom fields in the assistant tools (OpenSpec change custom-fields, task 4.1).

func fieldsFixture(t *testing.T) *fixture {
	f := newFixture(t)
	f.put("u1", "project", "kitchen", map[string]any{"name": "Kitchen", "position": 1, "created_at": 1})
	f.put("u1", "project", "garden", map[string]any{"name": "Garden", "position": 2, "created_at": 1})
	f.put("u1", "field", "cost", map[string]any{"name": "Cost", "project_id": "kitchen", "type": "number", "options": "", "position": 1, "created_at": 1})
	f.put("u1", "field", "client", map[string]any{"name": "Client", "project_id": "kitchen", "type": "choice", "options": "Acme\nGlobex", "position": 2, "created_at": 1})
	f.put("u1", "field", "paid", map[string]any{"name": "Paid", "project_id": "kitchen", "type": "checkbox", "options": "", "position": 3, "created_at": 1})
	f.put("u1", "field", "area", map[string]any{"name": "Area", "project_id": "garden", "type": "number", "options": "", "position": 1, "created_at": 1})
	f.task("u1", "t1", "Oven", map[string]any{"project_id": "kitchen", "fields.cost": 120, "fields.client": "Acme", "fields.area": 9})
	return f
}

func TestFieldsInResults(t *testing.T) {
	f := fieldsFixture(t)
	raw, _ := json.Marshal(f.mustCall(agent("u1"), "list_projects", map[string]any{}))
	var projects struct {
		Projects []struct {
			ID     string `json:"id"`
			Fields []struct {
				ID        string `json:"id"`
				Type      string `json:"type"`
				Untrusted struct {
					Name    string   `json:"name"`
					Options []string `json:"options"`
				} `json:"untrusted_text"`
			} `json:"fields"`
		} `json:"projects"`
	}
	_ = json.Unmarshal(raw, &projects)
	var kitchen = projects.Projects[0]
	if kitchen.ID != "kitchen" || len(kitchen.Fields) != 3 || kitchen.Fields[0].ID != "cost" || kitchen.Fields[0].Type != "number" ||
		kitchen.Fields[1].Untrusted.Name != "Client" || strings.Join(kitchen.Fields[1].Untrusted.Options, ",") != "Acme,Globex" {
		t.Fatalf("projects = %s", raw)
	}
	raw, _ = json.Marshal(f.mustCall(agent("u1"), "get_task", map[string]any{"id": "t1"}))
	var task struct {
		Task struct {
			Fields    map[string]any `json:"fields"`
			Untrusted struct {
				Fields map[string]string `json:"fields"`
			} `json:"untrusted_text"`
		} `json:"task"`
	}
	_ = json.Unmarshal(raw, &task)
	// Area belongs to another project: kept in the data, not shown.
	if task.Task.Fields["cost"] != float64(120) || task.Task.Untrusted.Fields["client"] != "Acme" || task.Task.Fields["area"] != nil || len(task.Task.Fields) != 1 {
		t.Fatalf("task = %s", raw)
	}
}

func TestFieldValuesWritten(t *testing.T) {
	f := fieldsFixture(t)
	before := 0
	_ = f.sync.DB().QueryRow(`SELECT COUNT(*) FROM ops`).Scan(&before)
	f.mustCall(agent("u1"), "update_tasks", map[string]any{"updates": []any{map[string]any{"id": "t1", "fields": []any{map[string]any{"id": "cost", "value": "150.5"}}}}})
	after := 0
	_ = f.sync.DB().QueryRow(`SELECT COUNT(*) FROM ops`).Scan(&after)
	if got := string(f.get("u1", "t1")["fields.cost"]); got != "150.5" || after-before != 1 {
		t.Fatalf("cost = %s, %d ops", got, after-before)
	}
	f.mustCall(agent("u1"), "update_tasks", map[string]any{"updates": []any{map[string]any{"id": "t1", "fields": []any{
		map[string]any{"id": "client", "value": "globex"}, map[string]any{"id": "paid", "value": "true"}, map[string]any{"id": "cost", "value": nil}}}}})
	e := f.get("u1", "t1")
	if string(e["fields.client"]) != `"Globex"` || string(e["fields.paid"]) != "true" || string(e["fields.cost"]) != "null" {
		t.Fatalf("task = %v", e)
	}
	out := f.mustCall(agent("u1"), "create_tasks", map[string]any{"items": []any{map[string]any{"title": "Sink", "project_id": "kitchen", "fields": []any{map[string]any{"id": "cost", "value": "80"}}}}})
	id := out["results"].([]map[string]any)[0]["id"].(string)
	if got := string(f.get("u1", id)["fields.cost"]); got != "80" {
		t.Fatalf("created cost = %s", got)
	}
}

func TestFieldValueRefused(t *testing.T) {
	f := fieldsFixture(t)
	for _, c := range []struct {
		fields []any
		want   string
	}{
		{[]any{map[string]any{"id": "cost", "value": "cheap"}}, `fields.cost: the number field "Cost"`},
		{[]any{map[string]any{"id": "client", "value": "Initech"}}, `fields.client: the choice field "Client"`},
		{[]any{map[string]any{"id": "area", "value": "3"}}, "fields.area: no field"},
		{[]any{map[string]any{"id": "cost", "value": "1"}, map[string]any{"id": "cost", "value": "2"}}, "appears twice"},
	} {
		_, err := f.call(agent("u1"), "update_tasks", map[string]any{"updates": []any{map[string]any{"id": "t1", "fields": c.fields}}})
		if !isArgErr(err) || !strings.Contains(err.Error(), c.want) {
			t.Fatalf("%v: err = %v", c.fields, err)
		}
	}
	if got := string(f.get("u1", "t1")["fields.cost"]); got != "120" {
		t.Fatalf("refused call changed cost to %s", got)
	}
}

func TestFieldTextRefusedWhenEncrypted(t *testing.T) {
	f := fieldsFixture(t)
	c := agent("u1")
	c.Encrypted = true
	_, err := f.call(c, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": "t1", "fields": []any{map[string]any{"id": "client", "value": "Globex"}}}}})
	if toolCode(err) != "encryption_enabled" {
		t.Fatalf("err = %v", err)
	}
	// Numbers and checkboxes are plaintext by design.
	f.mustCall(c, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": "t1", "fields": []any{map[string]any{"id": "cost", "value": "99"}}}}})
}
