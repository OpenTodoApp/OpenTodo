package agenttools

import (
	"errors"
	"testing"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// TestAssigneeTools (OpenSpec change mcp-assignee): create_tasks and
// update_tasks assign, reassign and unassign with the REST API's membership
// and role checks.
func TestAssigneeTools(t *testing.T) {
	f := newFixture(t)
	c := agent("u1")
	f.put("u1", "project", "house", map[string]any{"name": "House"})
	shareWith(f, "house", opsync.RoleEditor)
	if _, err := f.db.Exec(`UPDATE users SET name = ? WHERE id = ?`, "Sam Rivera", "u2"); err != nil {
		t.Fatal(err)
	}
	assignee := func(id string) string { return string(f.get("u1", id)["assignee_id"]) }

	// Assign on create, by email.
	out := f.mustCall(c, "create_tasks", map[string]any{"items": []any{map[string]any{"title": "Bins", "project_id": "house", "assignee": "U2@example.com"}}})
	bins := out["results"].([]map[string]any)[0]["id"].(string)
	if got := assignee(bins); got != `"u2"` {
		t.Fatalf("created assignee = %s", got)
	}
	// Change it, by name and by id, and to me.
	for _, tc := range []struct{ who, want string }{{"sam rivera", `"u2"`}, {"u1", `"u1"`}, {"u2", `"u2"`}, {"me", `"u1"`}} {
		f.mustCall(c, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": bins, "assignee": tc.who}}})
		if got := assignee(bins); got != tc.want {
			t.Fatalf("assignee %q = %s, want %s", tc.who, got, tc.want)
		}
	}
	// null unassigns.
	f.mustCall(c, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": bins, "assignee": nil}}})
	if got := assignee(bins); got != `null` {
		t.Fatalf("unassigned = %s", got)
	}

	// Someone outside the project is refused, whichever way they are named, and nothing is written.
	for _, who := range []string{"mallory", "mallory@example.com", ""} {
		if _, err := f.call(c, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": bins, "assignee": who}}}); !isArgErr(err) {
			t.Fatalf("update to %q: %v", who, err)
		}
		if _, err := f.call(c, "create_tasks", map[string]any{"items": []any{map[string]any{"title": "Lamp", "project_id": "house", "assignee": who}}}); !isArgErr(err) {
			t.Fatalf("create for %q: %v", who, err)
		}
	}
	// A personal task can only be assigned to the user.
	f.task("u1", "mine", "Mine", nil)
	if _, err := f.call(c, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": "mine", "assignee": "u2"}}}); !isArgErr(err) {
		t.Fatalf("personal task to u2: %v", err)
	}
	f.mustCall(c, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": "mine", "assignee": "me"}}})
	if got := assignee("mine"); got != `"u1"` {
		t.Fatalf("personal self-assign = %s", got)
	}
	if got := assignee(bins); got != `null` {
		t.Fatalf("refused calls changed the assignee: %s", got)
	}
}

// TestAssigneeViewerRefused: a viewer cannot assign, as on REST.
func TestAssigneeViewerRefused(t *testing.T) {
	f := newFixture(t)
	f.put("u1", "project", "house", map[string]any{"name": "House"})
	f.task("u1", "bins", "Bins", map[string]any{"project_id": "house"})
	shareWith(f, "house", opsync.RoleViewer)
	viewer := agent("u2")
	var te *ToolError
	if _, err := f.call(viewer, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": "bins", "assignee": "u2"}}}); !errors.As(err, &te) || te.Code != "forbidden" {
		t.Fatalf("viewer update: %v", err)
	}
	if _, err := f.call(viewer, "create_tasks", map[string]any{"items": []any{map[string]any{"title": "Lamp", "project_id": "house", "assignee": "u2"}}}); !errors.As(err, &te) || te.Code != "forbidden" {
		t.Fatalf("viewer create: %v", err)
	}
	if got := string(f.get("u1", "bins")["assignee_id"]); got != "" && got != `null` {
		t.Fatalf("assignee = %s", got)
	}
}
