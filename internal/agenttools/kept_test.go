package agenttools

import (
	"encoding/json"
	"slices"
	"testing"
)

// TestKeptSubtasks (OpenSpec change keep-open-subtasks, design D5): an open
// subtask of a completed parent is left out of list_tasks, search_tasks,
// today_summary and the counts, is listed among the parent's subtasks by
// get_task and can still be written, and comes back when the parent reopens.
func TestKeptSubtasks(t *testing.T) {
	f := newFixture(t)
	c := agent("u1")
	day := "2026-10-12"
	f.put("u1", "project", "p1", map[string]any{"name": "Trip"})
	f.task("u1", "trip", "Plan trip", map[string]any{"project_id": "p1", "completed_at": 1})
	f.task("u1", "hotel", "Book hotel", map[string]any{"project_id": "p1", "parent_id": "trip", "due": map[string]any{"date": day}})
	f.task("u1", "prices", "Compare hotel prices", map[string]any{"project_id": "p1", "parent_id": "hotel"})
	f.task("u1", "bags", "Pack bags", map[string]any{"project_id": "p1", "due": map[string]any{"date": day}})

	listed := func(tool string, args map[string]any) []string {
		return taskIDsOf(t, f.mustCall(c, tool, args))
	}
	if got := listed("list_tasks", map[string]any{"view": "today", "timezone": "UTC"}); !slices.Equal(got, []string{"bags"}) {
		t.Fatalf("today = %v", got)
	}
	if got := listed("list_tasks", map[string]any{"project_id": "p1", "include_completed": true}); slices.Contains(got, "hotel") || slices.Contains(got, "prices") || !slices.Contains(got, "trip") {
		t.Fatalf("project = %v", got)
	}
	if got := listed("search_tasks", map[string]any{"query": "hotel"}); len(got) != 0 {
		t.Fatalf("search = %v", got)
	}
	summary := f.mustCall(c, "today_summary", map[string]any{"timezone": "UTC"})
	raw, _ := json.Marshal(summary)
	var res struct {
		DueToday []struct {
			ID string `json:"id"`
		} `json:"due_today"`
	}
	_ = json.Unmarshal(raw, &res)
	if len(res.DueToday) != 1 || res.DueToday[0].ID != "bags" {
		t.Fatalf("today_summary due_today = %s", raw)
	}
	if n := openCount(t, f.mustCall(c, "list_projects", map[string]any{})); n != 1 {
		t.Fatalf("open_count = %d", n)
	}

	got := f.mustCall(c, "get_task", map[string]any{"id": "trip"})
	raw, _ = json.Marshal(got["subtasks"])
	var subs []struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(raw, &subs)
	if len(subs) != 1 || subs[0].ID != "hotel" {
		t.Fatalf("subtasks = %s", raw)
	}
	f.mustCall(c, "update_tasks", map[string]any{"updates": []any{map[string]any{"id": "hotel", "title": "Book a hotel"}}})

	f.mustCall(c, "reopen_tasks", map[string]any{"ids": []string{"trip"}})
	if got := listed("list_tasks", map[string]any{"view": "today", "timezone": "UTC"}); !slices.Contains(got, "hotel") {
		t.Fatalf("today after reopen = %v", got)
	}
	if got := listed("search_tasks", map[string]any{"query": "hotel"}); !slices.Contains(got, "hotel") || !slices.Contains(got, "prices") {
		t.Fatalf("search after reopen = %v", got)
	}
}

func openCount(t *testing.T, out map[string]any) int {
	t.Helper()
	raw, _ := json.Marshal(out["projects"])
	var list []struct {
		ID        string `json:"id"`
		OpenCount int    `json:"open_count"`
	}
	if err := json.Unmarshal(raw, &list); err != nil {
		t.Fatal(err)
	}
	for _, p := range list {
		if p.ID == "p1" {
			return p.OpenCount
		}
	}
	return -1
}
