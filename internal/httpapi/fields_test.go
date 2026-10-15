package httpapi

import (
	"fmt"
	"strings"
	"testing"
)

// Custom fields API (OpenSpec change `custom-fields`, task 3.1/3.2).

func TestFieldsCrud(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("POST", "/api/v1/projects", map[string]any{"name": "Kitchen"})
	e.mustStatus(resp, 201, out)
	pid := out["id"].(string)

	resp, out = e.do("POST", "/api/v1/fields", map[string]any{"name": "Cost", "type": "number", "project_id": pid})
	e.mustStatus(resp, 201, out)
	cost := out["id"].(string)
	if out["position"] == nil || out["created_at"] == nil || out["options"] != "" {
		t.Fatalf("created field = %v", out)
	}
	resp, out = e.do("POST", "/api/v1/fields", map[string]any{"name": "Status", "type": "choice", "project_id": pid, "options": " Quote \n\nOrdered\nDone"})
	e.mustStatus(resp, 201, out)
	status := out["id"].(string)
	if out["options"] != "Quote\nOrdered\nDone" {
		t.Fatalf("options not normalized: %q", out["options"])
	}

	// Refusals on create.
	for _, body := range []map[string]any{
		{"type": "number", "project_id": pid},
		{"name": "X", "project_id": pid},
		{"name": "X", "type": "money", "project_id": pid},
		{"name": "X", "type": "text"},
		{"name": "X", "type": "text", "project_id": "nope"},
		{"name": "cost", "type": "text", "project_id": pid},
		{"name": "X", "type": "text", "project_id": pid, "options": "a"},
		{"name": "X", "type": "choice", "project_id": pid, "options": "a\nA"},
		{"name": strings.Repeat("n", 61), "type": "text", "project_id": pid},
		{"name": "X", "type": "text", "project_id": pid, "color": "red"},
	} {
		resp, out = e.do("POST", "/api/v1/fields", body)
		e.mustStatus(resp, 400, out)
		if errCode(out) != "invalid_input" {
			t.Fatalf("%v: %v", body, out)
		}
	}

	// Immutable type and project; rename keeps uniqueness.
	resp, out = e.do("PATCH", "/api/v1/fields/"+cost, map[string]any{"type": "text"})
	e.mustStatus(resp, 400, out)
	resp, out = e.do("POST", "/api/v1/projects", map[string]any{"name": "Garden"})
	e.mustStatus(resp, 201, out)
	garden := out["id"].(string)
	resp, out = e.do("PATCH", "/api/v1/fields/"+cost, map[string]any{"project_id": garden})
	e.mustStatus(resp, 400, out)
	resp, out = e.do("PATCH", "/api/v1/fields/"+cost, map[string]any{"name": "STATUS"})
	e.mustStatus(resp, 400, out)
	resp, out = e.do("PATCH", "/api/v1/fields/"+cost, map[string]any{"name": "Price", "type": "number"})
	e.mustStatus(resp, 200, out)
	if out["name"] != "Price" {
		t.Fatalf("rename = %v", out)
	}

	resp, out = e.do("GET", "/api/v1/fields", nil)
	e.mustStatus(resp, 200, out)
	if n := len(out["fields"].([]any)); n != 2 {
		t.Fatalf("list has %d fields", n)
	}
	resp, out = e.do("DELETE", "/api/v1/fields/"+status, nil)
	e.mustStatus(resp, 204, out)
	resp, out = e.do("GET", "/api/v1/fields/"+status, nil)
	e.mustStatus(resp, 404, out)
}

func TestFieldsLimit(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("POST", "/api/v1/projects", map[string]any{"name": "Kitchen"})
	e.mustStatus(resp, 201, out)
	pid := out["id"].(string)
	for i := 0; i < 30; i++ {
		resp, out = e.do("POST", "/api/v1/fields", map[string]any{"name": fmt.Sprint("F", i), "type": "text", "project_id": pid})
		e.mustStatus(resp, 201, out)
	}
	resp, out = e.do("POST", "/api/v1/fields", map[string]any{"name": "F30", "type": "text", "project_id": pid})
	e.mustStatus(resp, 400, out)
	if msg := out["error"].(map[string]any)["message"].(string); !strings.Contains(msg, "30") {
		t.Fatalf("limit message = %q", msg)
	}
}

func TestFieldsUnauthenticated(t *testing.T) {
	e := newEnv(t, false)
	resp, out := e.do("GET", "/api/v1/fields", nil)
	e.mustStatus(resp, 401, out)
	resp, out = e.do("POST", "/api/v1/fields", map[string]any{"name": "Cost", "type": "number", "project_id": "p"})
	e.mustStatus(resp, 401, out)
	if errCode(out) != "unauthorized" {
		t.Fatalf("code = %v", out)
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
	field := func(project, name, typ, options string) string {
		resp, out := e.do("POST", "/api/v1/fields", map[string]any{"name": name, "type": typ, "project_id": project, "options": options})
		e.mustStatus(resp, 201, out)
		return out["id"].(string)
	}
	cost := field(pid, "Cost", "number", "")
	client := field(pid, "Client", "text", "")
	status := field(pid, "Status", "choice", "Quote\nOrdered")
	quote := field(pid, "Quote", "link", "")
	due := field(pid, "Delivery", "date", "")
	paid := field(pid, "Paid", "checkbox", "")
	area := field(garden, "Area", "number", "")

	// A plain create carries an empty object.
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Buy milk"})
	e.mustStatus(resp, 201, out)
	if f, ok := out["fields"].(map[string]any); !ok || len(f) != 0 {
		t.Fatalf("fields on a plain task = %v", out["fields"])
	}

	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Oven", "project_id": pid, "fields": map[string]any{cost: 120, status: "ordered"}})
	e.mustStatus(resp, 201, out)
	tid := out["id"].(string)
	f := out["fields"].(map[string]any)
	if f[cost] != float64(120) || f[status] != "Ordered" {
		t.Fatalf("create fields = %v", f)
	}
	for k := range out {
		if strings.HasPrefix(k, "fields.") {
			t.Fatalf("read carries %q", k)
		}
	}

	// A patch merges one entry and records one op for it.
	before := e.opCount()
	resp, out = e.do("PATCH", "/api/v1/tasks/"+tid, map[string]any{"fields": map[string]any{client: "Acme"}})
	e.mustStatus(resp, 200, out)
	f = out["fields"].(map[string]any)
	if f[cost] != float64(120) || f[client] != "Acme" || len(f) != 3 {
		t.Fatalf("patched fields = %v", f)
	}
	if n := e.opCount() - before; n != 1 {
		t.Fatalf("patch recorded %d ops, want 1", n)
	}
	resp, out = e.do("PATCH", "/api/v1/tasks/"+tid, map[string]any{"fields": map[string]any{quote: "https://example.com/q.pdf", due: "2026-11-02", paid: true, client: nil}})
	e.mustStatus(resp, 200, out)
	if f = out["fields"].(map[string]any); f[paid] != true || f[client] != nil || f[due] != "2026-11-02" {
		t.Fatalf("patched fields = %v", f)
	}

	// Refusals name the field and change nothing.
	for _, patch := range []map[string]any{
		{"fields": map[string]any{cost: "abc"}},
		{"fields": map[string]any{status: "Done"}},
		{"fields": map[string]any{quote: "javascript:alert(1)"}},
		{"fields": map[string]any{due: "2026-02-30"}},
		{"fields": map[string]any{paid: "yes"}},
		{"fields": map[string]any{client: strings.Repeat("x", 2001)}},
		{"fields": map[string]any{client: map[string]any{}}},
		{"fields": map[string]any{area: 3}},
		{"fields": map[string]any{"nope": 3}},
		{"fields": []any{1}},
		{"fields." + cost: 3},
	} {
		resp, out = e.do("PATCH", "/api/v1/tasks/"+tid, patch)
		e.mustStatus(resp, 400, out)
		msg := out["error"].(map[string]any)["message"].(string)
		if errCode(out) != "invalid_input" || !strings.Contains(msg, "fields") {
			t.Fatalf("%v: %v", patch, out)
		}
	}
	resp, out = e.do("PATCH", "/api/v1/tasks/"+tid, map[string]any{"fields": map[string]any{area: 3}})
	if msg := out["error"].(map[string]any)["message"].(string); !strings.Contains(msg, area) {
		t.Fatalf("foreign field message = %q", msg)
	}
	resp, out = e.do("GET", "/api/v1/tasks/"+tid, nil)
	e.mustStatus(resp, 200, out)
	if f = out["fields"].(map[string]any); f[cost] != float64(120) || f[status] != "Ordered" {
		t.Fatalf("refused patch changed values: %v", f)
	}

	// Moving the task keeps its values; the target project's fields apply.
	resp, out = e.do("PATCH", "/api/v1/tasks/"+tid, map[string]any{"project_id": garden, "fields": map[string]any{area: 12}})
	e.mustStatus(resp, 200, out)
	if f = out["fields"].(map[string]any); f[cost] != float64(120) || f[area] != float64(12) {
		t.Fatalf("moved task fields = %v", f)
	}

	// The list folds too; a deleted definition's value stays in the data.
	resp, out = e.do("DELETE", "/api/v1/fields/"+cost, nil)
	e.mustStatus(resp, 204, out)
	resp, out = e.do("GET", "/api/v1/tasks", nil)
	e.mustStatus(resp, 200, out)
	for _, it := range out["tasks"].([]any) {
		task := it.(map[string]any)
		if task["id"] == tid && task["fields"].(map[string]any)[cost] != float64(120) {
			t.Fatalf("listed task = %v", task)
		}
	}

	// Export: every definition (deleted included) and folded task values.
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
	if len(defs) != 7 || deleted != 1 {
		t.Fatalf("export fields = %d (%d deleted)", len(defs), deleted)
	}
	for _, it := range out["tasks"].([]any) {
		task := it.(map[string]any)
		if task["id"] == tid {
			f := task["fields"].(map[string]any)
			if f[cost] != float64(120) || f[client] != nil {
				t.Fatalf("exported fields = %v", f)
			}
			if _, has := f[client]; !has {
				t.Fatalf("cleared value missing from the export: %v", f)
			}
		}
	}
}

// opCount counts the op log rows.
func (e *env) opCount() int {
	e.t.Helper()
	var n int
	if err := e.db.QueryRow(`SELECT COUNT(*) FROM ops`).Scan(&n); err != nil {
		e.t.Fatal(err)
	}
	return n
}
