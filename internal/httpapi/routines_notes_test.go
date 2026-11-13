package httpapi

import (
	"strings"
	"testing"
)

// notes-in-routines 2.1 and 3.1: note triggers through the API and runs on a note.
func TestRoutineNoteRoutes(t *testing.T) {
	e := rulesEnv(t, nil)
	label := e.create("/api/v1/labels", map[string]any{"name": "todo"})
	// "Note trigger with a task condition" and "Note trigger with actions".
	resp, out := e.do("POST", "/api/v1/rules", map[string]any{"name": "x", "trigger": map[string]any{"kind": "note.created"}, "condition": map[string]any{"priority": map[string]any{"in": []int{1}}},
		"steps": []any{map[string]any{"id": "a", "kind": "notify", "in": map[string]any{"text": map[string]any{"literal": "n"}}}}})
	e.mustStatus(resp, 400, out)
	if msg := out["error"].(map[string]any)["message"].(string); !strings.Contains(msg, "condition.priority") {
		t.Fatalf("task condition %v", out)
	}
	resp, out = e.do("POST", "/api/v1/rules", map[string]any{"name": "x", "trigger": map[string]any{"kind": "note.label.added", "label_id": label}, "actions": map[string]any{"priority": 1}, "steps": nil})
	e.mustStatus(resp, 400, out)
	if msg := out["error"].(map[string]any)["message"].(string); !strings.Contains(msg, "needs steps") {
		t.Fatalf("actions %v", out)
	}
	// "Manual on a note": saved; run on a note.
	note := e.create("/api/v1/notes", map[string]any{"title": "Planning meeting", "description": "- [ ] book room\n- [ ] send agenda"})
	id := e.create("/api/v1/rules", map[string]any{"name": "Checkboxes", "trigger": map[string]any{"kind": "manual", "on": "note"}, "steps": []any{
		map[string]any{"id": "a", "kind": "note_text", "in": map[string]any{"of": map[string]any{"ref": "trigger"}}},
		map[string]any{"id": "b", "kind": "split_lines", "in": map[string]any{"text": map[string]any{"ref": "a"}, "only": map[string]any{"literal": "open_checkboxes"}}},
		map[string]any{"id": "c", "kind": "create_tasks", "in": map[string]any{"text": map[string]any{"ref": "b"}}}}})
	// "Note needed" and "Task and note together".
	resp, out = e.do("POST", "/api/v1/rules/"+id+"/run", map[string]any{"run_id": "n-1"})
	e.mustStatus(resp, 400, out)
	if errCode(out) != "note_required" {
		t.Fatalf("note_required %v", out)
	}
	task := e.create("/api/v1/tasks", map[string]any{"title": "x"})
	resp, out = e.do("POST", "/api/v1/rules/"+id+"/run", map[string]any{"run_id": "n-2", "task_id": task})
	e.mustStatus(resp, 400, out)
	if errCode(out) != "note_required" {
		t.Fatalf("with a task %v", out)
	}
	resp, out = e.do("POST", "/api/v1/rules/"+id+"/run", map[string]any{"run_id": "n-3", "task_id": task, "note_id": note})
	e.mustStatus(resp, 400, out)
	if errCode(out) != "invalid_input" {
		t.Fatalf("both %v", out)
	}
	resp, out = e.do("POST", "/api/v1/rules/"+id+"/run", map[string]any{"run_id": "n-4", "note_id": note})
	e.mustStatus(resp, 200, out)
	if run := out["run"].(map[string]any); run["outcome"] != "applied" || run["note_id"] != note || run["source"] != "manual" || run["writes"] != float64(2) {
		t.Fatalf("run %v", out)
	}
	// A note step names a note that does not exist.
	resp, out = e.do("POST", "/api/v1/rules", map[string]any{"name": "x", "trigger": map[string]any{"kind": "manual"}, "steps": []any{
		map[string]any{"id": "a", "kind": "get_note", "in": map[string]any{"note": map[string]any{"literal": map[string]any{"note": "nope"}}}}}})
	e.mustStatus(resp, 400, out)
	// A read token is refused on the run route.
	c := e.bearerClient()
	resp, out = c.do("POST", "/api/v1/rules/"+id+"/run", map[string]any{"run_id": "n-5", "note_id": note}, bearer(e.token("read"))...)
	if resp.StatusCode != 403 || errCode(out) != "insufficient_scope" {
		t.Fatalf("read token: %d %v", resp.StatusCode, out)
	}
}
