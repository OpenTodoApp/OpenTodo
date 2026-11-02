package agenttools

import (
	"encoding/json"
	"fmt"
	"testing"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// TestRotationTools (OpenSpec change chore-rotation, task 4.3): update_tasks
// sets and clears the people who take turns with the REST API's checks, the
// task view names them, and complete_tasks passes the turn.
func TestRotationTools(t *testing.T) {
	f := newFixture(t)
	c := agent("u1")
	f.put("u1", "project", "house", map[string]any{"name": "House"})
	f.task("u1", "bins", "Bins", map[string]any{"project_id": "house", "recurrence": "every monday", "due": map[string]any{"date": "2026-10-12"}, "assignee_id": "u1"})
	f.task("u1", "lamp", "Lamp", map[string]any{"project_id": "house"})

	// Not shared yet: refused.
	if _, err := f.call(c, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": "bins", "rotation": []string{"u1"}}}}); !isArgErr(err) {
		t.Fatalf("single member: %v", err)
	}
	shareWith(f, "house", opsync.RoleEditor)
	for _, bad := range []map[string]any{
		{"id": "lamp", "rotation": []string{"u1", "u2"}},      // no rule
		{"id": "bins", "rotation": []string{"u1", "u1"}},      // duplicates
		{"id": "bins", "rotation": []string{"u1", "mallory"}}, // not a member
		{"id": "bins", "rotation": "u1"},                      // not a list
	} {
		if _, err := f.call(c, "update_tasks", map[string]any{"updates": []any{bad}}); !isArgErr(err) {
			t.Fatalf("%v: %v", bad, err)
		}
	}
	f.mustCall(c, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": "bins", "rotation": []string{"u1", "u2"}}}})
	if got := string(f.get("u1", "bins")["rotation"]); got != `["u1","u2"]` {
		t.Fatalf("rotation = %s", got)
	}
	detail := f.mustCall(c, "get_task", map[string]any{"id": "bins"})
	raw, _ := json.Marshal(detail)
	var view struct {
		Task struct {
			Rotation  []string `json:"rotation"`
			Untrusted struct {
				Rotation []string `json:"rotation"`
			} `json:"untrusted_text"`
		} `json:"task"`
	}
	_ = json.Unmarshal(raw, &view)
	if fmt.Sprint(view.Task.Rotation) != "[u1 u2]" || fmt.Sprint(view.Task.Untrusted.Rotation) != "[u1@example.com u2@example.com]" {
		t.Fatalf("view = %s", raw)
	}
	// Completing passes the turn.
	f.mustCall(c, "complete_tasks", map[string]any{"ids": []string{"bins"}})
	if got := string(f.get("u1", "bins")["assignee_id"]); got != `"u2"` {
		t.Fatalf("after complete_tasks: assignee %s", got)
	}
	// null stops taking turns.
	f.mustCall(c, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": "bins", "rotation": nil}}})
	if got := string(f.get("u1", "bins")["rotation"]); got != `[]` {
		t.Fatalf("cleared rotation = %s", got)
	}
}
