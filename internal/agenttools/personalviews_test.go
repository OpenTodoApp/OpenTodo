package agenttools

import (
	"encoding/json"
	"fmt"
	"testing"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// TestTodaySummaryLeavesOutOthersTasks (OpenSpec change personal-views-assignee):
// a task assigned to someone else is neither listed nor counted as overdue or
// due today; the user's own and unassigned tasks are, and the project's open
// count still holds every task.
func TestTodaySummaryLeavesOutOthersTasks(t *testing.T) {
	f := newFixture(t)
	c := agent("u1")
	day := "2026-10-12"
	f.put("u1", "project", "p", map[string]any{"name": "House", "created_at": 1})
	shareWith(f, "p", opsync.RoleEditor)
	f.task("u1", "mine", "Mine", map[string]any{"project_id": "p", "assignee_id": "u1", "due": map[string]any{"date": day}})
	f.task("u1", "anyone", "Anyone", map[string]any{"project_id": "p", "due": map[string]any{"date": "2026-10-01"}})
	f.task("u1", "theirs", "Theirs", map[string]any{"project_id": "p", "assignee_id": "u2", "due": map[string]any{"date": day}})
	f.task("u1", "late", "Theirs late", map[string]any{"project_id": "p", "assignee_id": "u2", "due": map[string]any{"date": "2026-10-01"}})

	out := f.mustCall(c, "today_summary", map[string]any{"timezone": "UTC"})
	raw, _ := json.Marshal(out)
	var res struct {
		Overdue  []struct{ ID string } `json:"overdue"`
		DueToday []struct{ ID string } `json:"due_today"`
		Counts   struct {
			Overdue    int `json:"overdue"`
			DueToday   int `json:"due_today"`
			PerProject []struct {
				ID   string `json:"id"`
				Open int    `json:"open"`
			} `json:"per_project"`
		} `json:"counts"`
	}
	if err := json.Unmarshal(raw, &res); err != nil {
		t.Fatal(err)
	}
	if fmt.Sprint(res.Overdue) != "[{anyone}]" || fmt.Sprint(res.DueToday) != "[{mine}]" {
		t.Fatalf("overdue %v, due_today %v", res.Overdue, res.DueToday)
	}
	if res.Counts.Overdue != 1 || res.Counts.DueToday != 1 {
		t.Fatalf("counts %+v", res.Counts)
	}
	if len(res.Counts.PerProject) != 1 || res.Counts.PerProject[0].Open != 4 {
		t.Fatalf("per_project %+v", res.Counts.PerProject)
	}
}
