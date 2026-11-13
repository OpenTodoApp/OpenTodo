package agenttools

import (
	"encoding/json"
	"slices"
	"testing"
)

// The read tools answer from the caller's own data only (GitHub issue 1317): another
// user's project and tasks never reach list_tasks, search_tasks, get_task or
// list_projects, even when the caller names the other user's ids.
func TestReadToolsStayInTheCallersData(t *testing.T) {
	f := newFixture(t)
	f.put("u1", "project", "general-u1", map[string]any{"name": "Allgemein", "position": 1, "created_at": 1})
	f.task("u1", "mine", "Water the plants", map[string]any{"project_id": "general-u1"})
	f.put("u2", "project", "general-u2", map[string]any{"name": "General", "position": 1, "created_at": 1})
	f.task("u2", "theirs", "Gathering ideas for new training sessions", map[string]any{"project_id": "general-u2"})
	c := agent("u1")

	if got := taskIDsOf(t, f.mustCall(c, "list_tasks", map[string]any{})); !slices.Equal(got, []string{"mine"}) {
		t.Fatalf("list_tasks = %v, want only the caller's task", got)
	}
	// Another user's project is refused as unknown ("no such project").
	if out, err := f.call(c, "list_tasks", map[string]any{"project_id": "general-u2"}); err == nil {
		t.Fatalf("list_tasks with another user's project answered %v", out)
	}
	if got := taskIDsOf(t, f.mustCall(c, "search_tasks", map[string]any{"query": "training"})); len(got) != 0 {
		t.Fatalf("search_tasks found another user's task: %v", got)
	}
	if out, err := f.call(c, "get_task", map[string]any{"id": "theirs"}); err == nil {
		t.Fatalf("get_task on another user's task answered %v", out)
	}
	raw, _ := json.Marshal(f.mustCall(c, "list_projects", map[string]any{})["projects"])
	var projects []struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(raw, &projects); err != nil {
		t.Fatal(err)
	}
	for _, p := range projects {
		if p.ID == "general-u2" {
			t.Fatalf("list_projects lists another user's project: %s", raw)
		}
	}
}
