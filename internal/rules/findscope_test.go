package rules

import (
	"encoding/json"
	"slices"
	"strings"
	"testing"
	"time"
)

// OpenSpec change routines-find-scope: the tasks a routine gathers leave out
// tasks in the Trash, tasks of projects in the Trash and, unless asked, tasks
// of archived projects.

// scopeSeed writes a live, an archived and a deleted project with one open
// task each, a task in the Trash and an Inbox task, all overdue.
func scopeSeed(h *harness) {
	h.project("alice", "live", "Live", "")
	h.project("alice", "old", "Old", "")
	h.write("alice", "laptop", "project", "old", map[string]any{"archived": true})
	h.project("alice", "gone", "Gone", "")
	h.write("alice", "laptop", "project", "gone", map[string]any{"deleted_at": 5})
	late := map[string]string{"date": "2026-10-19"}
	h.task("alice", "t-live", map[string]any{"project_id": "live", "due": late, "position": 1})
	h.task("alice", "t-old", map[string]any{"project_id": "old", "due": late, "position": 2})
	h.task("alice", "t-gone", map[string]any{"project_id": "gone", "due": late, "position": 3})
	h.task("alice", "t-trash", map[string]any{"deleted_at": 5, "due": late, "position": 4})
	h.task("alice", "t-inbox", map[string]any{"due": late, "position": 5})
	h.write("alice", "laptop", "view", "v1", map[string]any{"name": "Late", "query": "overdue", "created_at": 1, "deleted_at": nil})
}

func foundIDs(t *testing.T, res Result) []string {
	t.Helper()
	if len(res.Steps) == 0 {
		t.Fatalf("no steps: %+v", res)
	}
	var rows []struct{ ID string }
	b, _ := json.Marshal(res.Steps[0].Preview)
	_ = json.Unmarshal(b, &rows)
	out := []string{}
	for _, r := range rows {
		out = append(out, r.ID)
	}
	return out
}

func TestFindTasksScope(t *testing.T) {
	h, _, _ := routineHarness(t)
	scopeSeed(h)
	for _, source := range []string{`"condition":{"literal":{"due":"overdue"}}`, `"query":{"literal":"overdue"}`, `"view":{"literal":"v1"}`} {
		for _, c := range []struct {
			extra string
			want  []string
		}{
			{"", []string{"t-live", "t-inbox"}},
			{`,"archived":{"literal":false}`, []string{"t-live", "t-inbox"}},
			{`,"archived":{"literal":true}`, []string{"t-live", "t-old", "t-inbox"}},
		} {
			h.routine("alice", "r1", "Find", `{"kind":"manual"}`, "", `[{"id":"a","kind":"find_tasks","in":{`+source+c.extra+`}}]`)
			if got := foundIDs(t, h.runNow("alice", "r1", "", true)); !slices.Equal(got, c.want) {
				t.Errorf("%s%s: found %v, want %v", source, c.extra, got, c.want)
			}
		}
	}
}

// A project archived by an earlier step of the same run is left out.
func TestFindTasksScopeSeesTheRun(t *testing.T) {
	h, _, _ := routineHarness(t)
	scopeSeed(h)
	h.routine("alice", "r1", "Archive then count", `{"kind":"manual"}`, "", `[
		{"id":"a","kind":"update_project","in":{"project":{"literal":{"project":"live"}},"archived":{"literal":true}}},
		{"id":"b","kind":"find_tasks","in":{"condition":{"literal":{}}}},
		{"id":"c","kind":"count","in":{"list":{"ref":"b"}}}]`)
	res := h.runNow("alice", "r1", "", true)
	if len(res.Steps) != 3 || res.Steps[2].Preview != float64(1) {
		t.Fatalf("steps %v %+v", statuses(res), res.Steps)
	}
}

// The matching tasks of a scheduled routine and the sweep of a one-card
// scheduled rule follow the same scope.
func TestScheduledScope(t *testing.T) {
	h, _, _ := routineHarness(t)
	scopeSeed(h)
	h.routine("alice", "r1", "Monday", `{"kind":"schedule","at":"09:00","weekdays":[1]}`, `{"due":"overdue"}`, `[
		{"id":"a","kind":"count","in":{"list":{"ref":"trigger"}}}]`)
	if res := h.runNow("alice", "r1", "", true); len(res.Steps) != 1 || res.Steps[0].Preview != float64(2) {
		t.Fatalf("trigger: %v %+v", statuses(res), res.Steps)
	}
	h.rule("alice", "r2", "Wednesday sweep", `{"kind":"schedule","at":"13:00","weekdays":[3]}`, `{"due":"overdue"}`, `{"priority":1}`)
	h.e.Drain(h.ctx)
	h.e.Tick(h.ctx)
	h.clock = time.Date(2026, 10, 21, 13, 30, 0, 0, time.UTC)
	h.e.Tick(h.ctx)
	h.e.Drain(h.ctx)
	for id, want := range map[string]string{"t-live": "1", "t-inbox": "1", "t-old": "4", "t-gone": "4"} {
		if got := strings.TrimSpace(string(h.get("alice", id)["priority"])); got != want {
			t.Errorf("%s priority %s, want %s", id, got, want)
		}
	}
}
