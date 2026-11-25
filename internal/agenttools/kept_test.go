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

// TestCompleteTasksCascade (keep-open-subtasks D4): complete_tasks completes a
// task's open subtasks at every depth by default, and only the task while the
// user keeps open subtasks.
func TestCompleteTasksCascade(t *testing.T) {
	f := newFixture(t)
	c := agent("u1")
	f.task("u1", "trip", "Plan trip", nil)
	f.task("u1", "hotel", "Book hotel", map[string]any{"parent_id": "trip"})
	f.task("u1", "prices", "Compare prices", map[string]any{"parent_id": "hotel"})
	f.task("u1", "visa", "Visa", map[string]any{"parent_id": "trip", "completed_at": 5})
	f.mustCall(c, "complete_tasks", map[string]any{"ids": []string{"trip"}})
	for _, id := range []string{"trip", "hotel", "prices"} {
		if num(f.entity("u1", "task", id), "completed_at") == 0 {
			t.Fatalf("%s not completed", id)
		}
	}
	if num(f.entity("u1", "task", "visa"), "completed_at") != 5 {
		t.Fatal("a completed subtask was written again")
	}

	f.mustCall(c, "reopen_tasks", map[string]any{"ids": []string{"trip", "hotel", "prices"}})
	f.put("u1", "user_prefs", "me", map[string]any{"complete_subtasks": "keep"})
	f.mustCall(c, "complete_tasks", map[string]any{"ids": []string{"trip"}})
	if num(f.entity("u1", "task", "trip"), "completed_at") == 0 || num(f.entity("u1", "task", "hotel"), "completed_at") != 0 {
		t.Fatal("keep: only the parent should be completed")
	}
}
