package httpapi

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

// Custom fields API (OpenSpec change `custom-fields`).

func TestFieldsCrud(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("POST", "/api/v1/projects", map[string]any{"name": "Kitchen"})
	e.mustStatus(resp, 201, out)
	pid := out["id"].(string)

	// Scenario "Create a field via the API".
	resp, out = e.do("POST", "/api/v1/fields", map[string]any{"name": "Cost", "type": "number", "project_id": pid})
	e.mustStatus(resp, 201, out)
	cost := out["id"].(string)
	if out["name"] != "Cost" || out["type"] != "number" || out["options"] != "" || out["position"] == nil || out["created_at"] == nil {
		t.Fatalf("created field = %v", out)
	}
	resp, out = e.do("POST", "/api/v1/fields", map[string]any{"name": "Status", "type": "choice", "project_id": pid, "options": "Quote\nOrdered\nDone"})
	e.mustStatus(resp, 201, out)
	status := out["id"].(string)

	for i, bad := range []map[string]any{
		{"type": "number", "project_id": pid},                                   // no name
		{"name": "  ", "type": "number", "project_id": pid},                     // empty name
		{"name": "Price", "type": "money", "project_id": pid},                   // unknown type
		{"name": "Price", "project_id": pid},                                    // no type
		{"name": "Price", "type": "number"},                                     // no project
		{"name": "Price", "type": "number", "project_id": "nope"},               // unknown project
		{"name": "cost", "type": "text", "project_id": pid},                     // duplicate, ignoring case
		{"name": "Note", "type": "text", "project_id": pid, "options": "a"},     // options on a non-choice
		{"name": "Price", "type": "number", "project_id": pid, "color": "#fff"}, // unknown field
	} {
		resp, out = e.do("POST", "/api/v1/fields", bad)
		e.mustStatus(resp, 400, out)
		if errCode(out) != "invalid_input" {
			t.Fatalf("case %d: %v", i, out)
		}
	}

	resp, out = e.do("GET", "/api/v1/fields", nil)
	e.mustStatus(resp, 200, out)
	if n := len(out["fields"].([]any)); n != 2 {
		t.Fatalf("list = %v", out)
	}
	resp, out = e.do("PATCH", "/api/v1/fields/"+cost, map[string]any{"name": "Price"})
	e.mustStatus(resp, 200, out)
	if out["name"] != "Price" {
		t.Fatalf("rename = %v", out)
	}
	resp, out = e.do("PATCH", "/api/v1/fields/"+cost, map[string]any{"type": "text"})
	e.mustStatus(resp, 400, out)
	resp, out = e.do("PATCH", "/api/v1/fields/"+cost, map[string]any{"name": "status"})
	e.mustStatus(resp, 400, out)
	resp, out = e.do("POST", "/api/v1/projects", map[string]any{"name": "Garden"})
	e.mustStatus(resp, 201, out)
	garden := out["id"].(string)
	resp, out = e.do("PATCH", "/api/v1/fields/"+cost, map[string]any{"project_id": garden})
	e.mustStatus(resp, 400, out)

	// Delete is a tombstone, still in the export.
	resp, out = e.do("DELETE", "/api/v1/fields/"+status, nil)
	e.mustStatus(resp, 204, out)
	resp, out = e.do("GET", "/api/v1/fields/"+status, nil)
	e.mustStatus(resp, 404, out)
	resp, out = e.do("GET", "/api/v1/fields?include_deleted=true", nil)
	e.mustStatus(resp, 200, out)
	if n := len(out["fields"].([]any)); n != 2 {
		t.Fatalf("include_deleted lists %d", n)
	}
}

func TestFieldsLimit(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("POST", "/api/v1/projects", map[string]any{"name": "Kitchen"})
	e.mustStatus(resp, 201, out)
	pid := out["id"].(string)
	for i := 0; i < 30; i++ {
		resp, out = e.do("POST", "/api/v1/fields", map[string]any{"name": fmt.Sprintf("F%d", i), "type": "text", "project_id": pid})
		e.mustStatus(resp, 201, out)
	}
	resp, out = e.do("POST", "/api/v1/fields", map[string]any{"name": "One more", "type": "text", "project_id": pid})
	e.mustStatus(resp, 400, out)
	if msg := out["error"].(map[string]any)["message"].(string); !strings.Contains(msg, "30") {
		t.Fatalf("limit message = %q", msg)
	}
}

func TestFieldsRequireAuth(t *testing.T) {
	e := ownerEnv(t)
	anon := newClientFor(e)
	resp, out := anon.do("GET", "/api/v1/fields", nil)
	anon.mustStatus(resp, 401, out)
	resp, out = anon.do("POST", "/api/v1/fields", map[string]any{"name": "Cost", "type": "number", "project_id": "p"})
	anon.mustStatus(resp, 401, out)
	if errCode(out) != "unauthorized" {
		t.Fatalf("anon create = %v", out)
	}
}

func TestTaskFieldValues(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("POST", "/api/v1/projects", map[string]any{"name": "Kitchen"})
	e.mustStatus(resp, 201, out)
	pid := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/projects", map[string]any{"name": "Garden"})
	e.mustStatus(resp, 201, out)
	garden := out["id"].(string)
	def := func(name, typ, project string, extra map[string]any) string {
		body := map[string]any{"name": name, "type": typ, "project_id": project}
		for k, v := range extra {
			body[k] = v
		}
		resp, out := e.do("POST", "/api/v1/fields", body)
		e.mustStatus(resp, 201, out)
		return out["id"].(string)
	}
	cost := def("Cost", "number", pid, nil)
	client := def("Client", "choice", pid, map[string]any{"options": "Acme\nGlobex"})
	quote := def("Quote", "link", pid, nil)
	paid := def("Paid", "checkbox", pid, nil)
	order := def("Order date", "date", pid, nil)
	note := def("Note", "text", pid, nil)
	area := def("Area", "number", garden, nil)

	// Scenario "Create a task via the API": an empty fields object.
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Buy milk"})
	e.mustStatus(resp, 201, out)
	if f, ok := out["fields"].(map[string]any); !ok || len(f) != 0 {
		t.Fatalf("new task fields = %v", out["fields"])
	}

	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Tiles", "project_id": pid, "fields": map[string]any{cost: 120, client: "Acme"}})
	e.mustStatus(resp, 201, out)
	tid := out["id"].(string)
	fields := out["fields"].(map[string]any)
	if fields[cost] != float64(120) || fields[client] != "Acme" {
		t.Fatalf("created fields = %v", fields)
	}
	for k := range out {
		if strings.HasPrefix(k, "fields.") {
			t.Fatalf("raw key %s in response", k)
		}
	}

	// Scenario "Patch a custom field value": merged, one op for that field only.
	before := countEntityOps(t, e, tid)
	resp, out = e.do("PATCH", "/api/v1/tasks/"+tid, map[string]any{"fields": map[string]any{cost: 150}})
	e.mustStatus(resp, 200, out)
	fields = out["fields"].(map[string]any)
	if fields[cost] != float64(150) || fields[client] != "Acme" {
		t.Fatalf("patched fields = %v", fields)
	}
	if n := countEntityOps(t, e, tid); n != before+1 {
		t.Fatalf("ops %d -> %d, want one more", before, n)
	}
	resp, out = e.do("PATCH", "/api/v1/tasks/"+tid, map[string]any{"fields": map[string]any{
		quote: "https://example.com/quote.pdf", paid: true, order: "2026-10-16", note: "Ask for samples"}})
	e.mustStatus(resp, 200, out)

	// Type mismatches, foreign and unknown ids, raw keys: 400 naming the field, nothing changes.
	for i, bad := range []map[string]any{
		{"fields": map[string]any{client: "Initech"}},
		{"fields": map[string]any{cost: "cheap"}},
		{"fields": map[string]any{paid: "yes"}},
		{"fields": map[string]any{order: "16/10/2026"}},
		{"fields": map[string]any{quote: "ftp://example.com"}},
		{"fields": map[string]any{note: strings.Repeat("x", 2001)}},
		{"fields": map[string]any{area: 12}},
		{"fields": map[string]any{"nope": 1}},
		{"fields": map[string]any{cost: map[string]any{"a": 1}}},
		{"fields": []any{1}},
		{"fields." + cost: 1},
	} {
		resp, out = e.do("PATCH", "/api/v1/tasks/"+tid, bad)
		e.mustStatus(resp, 400, out)
		if errCode(out) != "invalid_input" {
			t.Fatalf("case %d: %v", i, out)
		}
		msg := out["error"].(map[string]any)["message"].(string)
		if i < 9 && !strings.Contains(msg, "fields") {
			t.Fatalf("case %d message = %q", i, msg)
		}
	}
	resp, out = e.do("GET", "/api/v1/tasks/"+tid, nil)
	e.mustStatus(resp, 200, out)
	fields = out["fields"].(map[string]any)
	if fields[cost] != float64(150) || fields[client] != "Acme" || fields[paid] != true || len(fields) != 6 {
		t.Fatalf("after refused patches = %v", fields)
	}

	// Clearing a value is null; the export shows null for it.
	resp, out = e.do("PATCH", "/api/v1/tasks/"+tid, map[string]any{"fields": map[string]any{client: nil}})
	e.mustStatus(resp, 200, out)
	if v, has := out["fields"].(map[string]any)[client]; !has || v != nil {
		t.Fatalf("cleared = %v", out["fields"])
	}

	// Moving to another project keeps the values in the data; the new project's
	// fields are what the task accepts in the same body.
	resp, out = e.do("PATCH", "/api/v1/tasks/"+tid, map[string]any{"project_id": garden, "fields": map[string]any{area: 12}})
	e.mustStatus(resp, 200, out)
	fields = out["fields"].(map[string]any)
	if fields[cost] != float64(150) || fields[area] != float64(12) {
		t.Fatalf("moved fields = %v", fields)
	}
	resp, out = e.do("GET", "/api/v1/tasks", nil)
	e.mustStatus(resp, 200, out)
	for _, raw := range out["tasks"].([]any) {
		task := raw.(map[string]any)
		if _, ok := task["fields"].(map[string]any); !ok {
			t.Fatalf("listed task without fields: %v", task)
		}
	}
}

func TestExportIncludesFields(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("POST", "/api/v1/projects", map[string]any{"name": "Kitchen"})
	e.mustStatus(resp, 201, out)
	pid := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/fields", map[string]any{"name": "Cost", "type": "number", "project_id": pid})
	e.mustStatus(resp, 201, out)
	cost := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/fields", map[string]any{"name": "Client", "type": "text", "project_id": pid})
	e.mustStatus(resp, 201, out)
	client := out["id"].(string)
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Tiles", "project_id": pid, "fields": map[string]any{cost: 120, client: "Acme"}})
	e.mustStatus(resp, 201, out)
	resp, out = e.do("DELETE", "/api/v1/fields/"+client, nil)
	e.mustStatus(resp, 204, out)

	resp, out = e.do("GET", "/api/v1/export", nil)
	e.mustStatus(resp, 200, out)
	if out["format"] != "opentodo-export" || out["version"] != float64(1) {
		t.Fatalf("export header = %v %v", out["format"], out["version"])
	}
	defs := out["fields"].([]any)
	deleted := 0
	for _, d := range defs {
		if d.(map[string]any)["deleted_at"] != nil {
			deleted++
		}
	}
	if len(defs) != 2 || deleted != 1 {
		t.Fatalf("export fields = %v", defs)
	}
	task := out["tasks"].([]any)[0].(map[string]any)
	values := task["fields"].(map[string]any)
	// A value of a deleted definition stays in the data.
	if values[cost] != float64(120) || values[client] != "Acme" {
		t.Fatalf("export values = %v", values)
	}
}

// The history reader shows a value change under its op field name.
func TestHistoryShowsFieldValues(t *testing.T) {
	e := ownerEnv(t)
	e.syncOps("laptop", map[string]any{"id": "o1", "entity": "task", "entityId": "t1", "field": "title", "value": "Tiles", "ts": 100, "device": "laptop"})
	e.syncOps("laptop", map[string]any{"id": "o2", "entity": "task", "entityId": "t1", "field": "fields.f1", "value": 120, "ts": 200, "device": "laptop"})
	e.syncOps("phone", map[string]any{"id": "o3", "entity": "task", "entityId": "t1", "field": "fields.f1", "value": 150, "ts": 300, "device": "phone"})
	resp, out := e.do("GET", "/api/v1/tasks/t1/history", nil)
	e.mustStatus(resp, 200, out)
	sets := out["changeSets"].([]any)
	last := sets[len(sets)-1].(map[string]any)["changes"].([]any)[0].(map[string]any)
	if last["field"] != "fields.f1" || last["from"] != float64(120) || last["to"] != float64(150) {
		t.Fatalf("history change = %v", last)
	}
}

func countEntityOps(t *testing.T, e *env, entityID string) int {
	t.Helper()
	var n int
	if err := e.sync.DB().QueryRow(`SELECT COUNT(*) FROM ops WHERE entity_id = ?`, entityID).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

var _ = json.Marshal
