package rules

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/store"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// workspaceHarness: alice with her default workspace (Personal, the projects
// home and inbox target "home") and a created one (Work, project "site").
func workspaceHarness(t *testing.T) (*harness, string, string) {
	h, _, _ := routineHarness(t)
	name := "Work"
	work, err := h.sync.CreateWorkspace(h.ctx, "alice", opsync.WorkspaceInput{Name: &name})
	if err != nil {
		t.Fatal(err)
	}
	h.project("alice", "home", "Home", "")
	h.write("alice", "laptop", "project", "site", map[string]any{"name": "Website", "workspace_id": work.ID, "created_at": 1, "deleted_at": nil})
	h.write("alice", "laptop", "project", "triage", map[string]any{"name": "Triage", "workspace_id": work.ID, "created_at": 1, "deleted_at": nil})
	return h, work.ID, store.DefaultWorkspaceID("alice")
}

func (h *harness) inWorkspace(rule, ws string) {
	h.t.Helper()
	h.write("alice", "laptop", "rule", rule, map[string]any{"workspace_id": ws})
}

// A routine of one workspace fires only for that workspace's tasks: the
// default-project routine of issue #1132 moves Work's new Inbox tasks to
// Triage and leaves the Personal ones alone.
func TestRoutineWorkspaceBoundsTheTrigger(t *testing.T) {
	h, work, _ := workspaceHarness(t)
	h.routine("alice", "r1", "Default project", `{"kind":"task.created"}`, `{"project":"none"}`, `[
		{"id":"a","kind":"change_tasks","in":{"tasks":{"ref":"trigger"},"set":{"literal":{"section":{"project_id":"triage","section_id":null}}}}}]`)
	h.inWorkspace("r1", work)
	h.task("alice", "work-inbox", map[string]any{"workspace_id": work})
	h.task("alice", "personal-inbox", nil)
	h.task("alice", "work-site", map[string]any{"project_id": "site"})
	h.e.Drain(h.ctx)
	if p := strOf(h.get("alice", "work-inbox")["project_id"]); p != "triage" {
		t.Fatalf("Work's Inbox task is in %q", p)
	}
	for _, id := range []string{"personal-inbox", "work-site"} {
		if p := strOf(h.get("alice", id)["project_id"]); p != map[string]string{"personal-inbox": "", "work-site": "site"}[id] {
			t.Fatalf("%s moved to %q", id, p)
		}
	}
	if n := len(h.runs("r1")); n != 1 {
		t.Fatalf("%d runs, want 1 (only Work's Inbox task)", n)
	}
}

// Every workspace (null) stays what a routine made before the field meant.
func TestRoutineWithoutWorkspaceRunsEverywhere(t *testing.T) {
	h, work, _ := workspaceHarness(t)
	h.routine("alice", "r1", "P1", `{"kind":"task.created"}`, "", `[
		{"id":"a","kind":"change_tasks","in":{"tasks":{"ref":"trigger"},"set":{"literal":{"priority":1}}}}]`)
	h.task("alice", "w", map[string]any{"workspace_id": work})
	h.task("alice", "p", nil)
	h.e.Drain(h.ctx)
	for _, id := range []string{"w", "p"} {
		if string(h.get("alice", id)["priority"]) != "1" {
			t.Fatalf("%s not changed", id)
		}
	}
}

// A routine of one workspace never moves a task into another workspace's
// project: the step fails with a reason and nothing is written; the legacy
// actions skip the move ("other workspace").
func TestRoutineWorkspaceRefusesAMoveAcross(t *testing.T) {
	h, work, def := workspaceHarness(t)
	h.task("alice", "t", map[string]any{"workspace_id": work})
	h.routine("alice", "r1", "Move home", `{"kind":"manual"}`, "", `[
		{"id":"a","kind":"change_tasks","in":{"tasks":{"ref":"trigger"},"set":{"literal":{"section":{"project_id":"home","section_id":null}}}}}]`)
	h.inWorkspace("r1", work)
	res := h.runNow("alice", "r1", "t", false)
	if res.Run.Outcome != OutcomeFailed || !strings.Contains(strings.Join(statuses(res), " "), ErrCodeOtherWorkspace) {
		t.Fatalf("run %+v steps %v", res.Run, statuses(res))
	}
	if p := strOf(h.get("alice", "t")["project_id"]); p != "" {
		t.Fatalf("moved to %q", p)
	}
	// The task of another workspace is not even found by Run now.
	h.inWorkspace("r1", def)
	if _, err := h.e.RunNow(h.ctx, "alice", RunRequest{RuleID: "r1", RunID: "other", TaskID: "t"}); err != ErrNotFound {
		t.Fatalf("Run now on another workspace's task: %v", err)
	}
	// Legacy actions: the move is skipped.
	h.rule("alice", "r2", "Legacy", `{"kind":"task.created"}`, "", `{"section":{"project_id":"home","section_id":null},"priority":2}`)
	h.inWorkspace("r2", work)
	h.task("alice", "t2", map[string]any{"workspace_id": work})
	h.e.Drain(h.ctx)
	got := h.get("alice", "t2")
	if strOf(got["project_id"]) != "" || string(got["priority"]) != "2" {
		t.Fatalf("legacy: project %s priority %s", got["project_id"], got["priority"])
	}
	if o := outcomes(h.runs("r2")); len(o) != 1 || o[0] != OutcomeApplied+":"+SkipOtherWorkspace {
		t.Fatalf("legacy outcomes %v", o)
	}
}

// Find tasks and a schedule's matching tasks see only the routine's
// workspace, and what it creates without a project lands in that
// workspace's Inbox.
func TestRoutineWorkspaceBoundsStepsAndCreates(t *testing.T) {
	h, work, _ := workspaceHarness(t)
	h.task("alice", "w1", map[string]any{"project_id": "site", "priority": 1})
	h.task("alice", "p1", map[string]any{"project_id": "home", "priority": 1})
	h.routine("alice", "r1", "Count", `{"kind":"manual"}`, "", `[
		{"id":"a","kind":"find_tasks","in":{"condition":{"literal":{"priority":{"not_in":[2,3,4]}}}}},
		{"id":"b","kind":"create_tasks","in":{"title":{"literal":"Follow up"}}}]`)
	h.inWorkspace("r1", work)
	res := h.runNow("alice", "r1", "", false)
	if res.Run.Outcome != OutcomeApplied || len(res.Run.Steps[0].IDs) != 1 || res.Run.Steps[0].IDs[0] != "w1" {
		t.Fatalf("run %+v", res.Run)
	}
	created := h.live("alice", func(e opsync.Entity) bool { return strOf(e["title"]) == "Follow up" })
	if len(created) != 1 || strOf(created[0]["workspace_id"]) != work {
		t.Fatalf("created %v", created)
	}
}

// A device of an older release plans beyond the routine's workspace: the
// commit fails the run with the reason and writes nothing (D4).
func TestRoutineWorkspaceGuardsADeviceCommit(t *testing.T) {
	h, work, _ := workspaceHarness(t)
	h.task("alice", "p1", map[string]any{"project_id": "home"})
	h.task("alice", "w1", map[string]any{"project_id": "site"})
	h.routine("alice", "r1", "P1", `{"kind":"manual"}`, "", `[
		{"id":"a","kind":"change_tasks","in":{"tasks":{"ref":"trigger"},"set":{"literal":{"priority":1}}}}]`)
	h.inWorkspace("r1", work)
	r, err := h.e.findRule(h.ctx, "alice", "r1")
	if err != nil {
		t.Fatal(err)
	}
	w, err := h.e.load(h.ctx, "alice")
	if err != nil {
		t.Fatal(err)
	}
	b := w.inWorkspace(r.WorkspaceID)
	st := h.e.newRun(h.ctx, b, r, "k", "run", false)
	if err := st.layDevice(DeviceCommit{Changes: []DeviceChange{{Entity: "task", ID: "w1", Fields: map[string]json.RawMessage{"priority": json.RawMessage("1")}}}}); err != nil {
		t.Fatal(err)
	}
	if where := st.outsideWorkspace(); where != "" {
		t.Fatalf("a change inside the workspace is outside: %s", where)
	}
	st = h.e.newRun(h.ctx, b, r, "k", "run", false)
	if err := st.layDevice(DeviceCommit{Changes: []DeviceChange{{Entity: "task", ID: "p1", Fields: map[string]json.RawMessage{"priority": json.RawMessage("1")}}}}); err != nil {
		t.Fatal(err)
	}
	if where := st.outsideWorkspace(); where != "task" {
		t.Fatalf("a change to another workspace's task: %q", where)
	}
	if !strings.Contains(st.workspaceFailure("task"), "Work") {
		t.Fatal(st.workspaceFailure("task"))
	}
}

// A routine whose workspace is gone does not run.
func TestRoutineWorkspaceGone(t *testing.T) {
	h, _, _ := workspaceHarness(t)
	h.routine("alice", "r1", "P1", `{"kind":"task.created"}`, "", `[
		{"id":"a","kind":"change_tasks","in":{"tasks":{"ref":"trigger"},"set":{"literal":{"priority":1}}}}]`)
	h.inWorkspace("r1", "not-mine")
	h.task("alice", "t", nil)
	h.e.Drain(h.ctx)
	if string(h.get("alice", "t")["priority"]) != "4" || len(h.runs("r1")) != 0 {
		t.Fatal("ran without its workspace")
	}
	if _, err := h.e.RunNow(h.ctx, "alice", RunRequest{RuleID: "r1", RunID: "x"}); err != ErrWorkspaceGone {
		t.Fatalf("Run now: %v", err)
	}
}
