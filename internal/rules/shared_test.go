package rules

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/notify"
	"github.com/OpenTodoApp/opentodo/internal/ruleval"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Routines of a shared project (OpenSpec change routines-shared).

type pausedSink struct {
	noticeSink
	paused []notify.RoutinePausedShared
}

func (p *pausedSink) RoutinePausedShared(_ context.Context, e notify.RoutinePausedShared) {
	p.paused = append(p.paused, e)
}

// sharedHarness: alice owns "Household" (p) shared with bob (editor) and
// carol (viewer); alice also has a personal project "mine".
func sharedHarness(t *testing.T) (*harness, *pausedSink) {
	h, _, _ := routineHarness(t)
	if _, err := h.e.db.Exec(`INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES('carol','carol@example.org','carol','x','member',1)`); err != nil {
		t.Fatal(err)
	}
	sink := &pausedSink{}
	h.e.Routine = sink
	h.project("alice", "p", "Household", "")
	h.project("alice", "mine", "Mine", "")
	for _, m := range []struct{ user, role string }{{"bob", opsync.RoleEditor}, {"carol", opsync.RoleViewer}} {
		if _, err := h.sync.AddMember(h.ctx, "alice", "p", m.user, m.role); err != nil {
			t.Fatal(err)
		}
	}
	return h, sink
}

func (h *harness) sharedRoutine(user, id, trigger, steps string) {
	h.t.Helper()
	h.write(user, "laptop", "rule", id, map[string]any{"name": "Weekly chores", "enabled": true, "trigger": json.RawMessage(trigger), "actions": nil,
		"steps": json.RawMessage(steps), "condition": nil, "position": 1, "created_at": 1, "deleted_at": nil, "project_id": "p"})
}

func (h *harness) state(rule string) State {
	h.t.Helper()
	st, _, err := h.e.Store.State(h.ctx, rule)
	if err != nil {
		h.t.Fatal(err)
	}
	return st
}

const dueIn3 = `[{"id":"a","kind":"change_tasks","in":{"tasks":{"ref":"trigger"},"set":{"literal":{"due":{"in_days":3}}}}}]`

// "Anyone's change fires it": Bob adds a task to Household; the routine runs
// as Alice, who turned it on, and writes as her with device rule:<id>.
func TestSharedRoutineFiresOnAnyMembersChange(t *testing.T) {
	h, _ := sharedHarness(t)
	h.sharedRoutine("alice", "r1", `{"kind":"task.created"}`, dueIn3)
	if st := h.state("r1"); st.RunAs != "alice" {
		t.Fatalf("run as %q", st.RunAs)
	}
	h.task("bob", "t1", map[string]any{"project_id": "p"})
	h.task("bob", "t2", map[string]any{})
	h.e.Drain(h.ctx)
	if d := dueOf(h.get("alice", "t1")["due"]); d == nil || d.Date != "2026-10-24" {
		t.Fatalf("t1 due = %s", h.get("alice", "t1")["due"])
	}
	if d := dueOf(h.get("bob", "t2")["due"]); d != nil {
		t.Fatal("a task outside the project got a date")
	}
	runs := h.runs("r1")
	if len(runs) != 1 || runs[0].RunAs != "alice" || runs[0].ProjectID != "p" || runs[0].Source != SourceEvent {
		t.Fatalf("runs %+v", runs)
	}
	var author, device string
	if err := h.e.db.QueryRow(`SELECT user_id, device FROM ops WHERE entity = 'task' AND entity_id = 't1' AND field = 'due' ORDER BY seq DESC LIMIT 1`).Scan(&author, &device); err != nil || author != "alice" || device != "rule:r1" {
		t.Fatalf("written by %q %q %v", author, device, err)
	}
	// Every member sees the run; a stranger does not.
	for _, u := range []string{"alice", "bob", "carol"} {
		if _, err := h.e.Store.RunByID(h.ctx, u, runs[0].RunID); err != nil {
			t.Fatalf("%s cannot see the run: %v", u, err)
		}
	}
	if list, _ := h.e.Store.UserRuns(h.ctx, "carol", RunFilter{}); len(list) != 1 {
		t.Fatalf("carol's runs %d", len(list))
	}
}

// "Find stays in the project": a scheduled Find of every open task finds only
// Household's, never Alice's personal ones; a step that would write outside
// fails before writing.
func TestSharedRoutineSeesOnlyItsProject(t *testing.T) {
	h, _ := sharedHarness(t)
	h.task("alice", "home1", map[string]any{"project_id": "p"})
	h.task("alice", "home2", map[string]any{"project_id": "p"})
	h.task("alice", "private", map[string]any{"project_id": "mine"})
	h.task("alice", "inbox", map[string]any{})
	h.sharedRoutine("alice", "r1", `{"kind":"manual"}`, `[
		{"id":"a","kind":"find_tasks","in":{"condition":{"literal":{}}}},
		{"id":"b","kind":"count","in":{"list":{"ref":"a"}}}]`)
	res := h.runNow("alice", "r1", "", true)
	if res.Steps[1].Preview != float64(2) {
		t.Fatalf("found %v", res.Steps[1].Preview)
	}
	// Create tasks lands in the project even when a line names another one.
	h.sharedRoutine("bob", "r2", `{"kind":"manual"}`, `[{"id":"a","kind":"create_tasks","in":{"text":{"literal":"Buy milk"}}}]`)
	if res := h.runNow("bob", "r2", "", false); res.Run.Outcome != OutcomeApplied {
		t.Fatalf("create %+v", res.Run)
	}
	if n := len(h.live("bob", inProject("p"))); n != 3 {
		t.Fatalf("household holds %d", n)
	}
	// A move out of the project fails the run before anything is written.
	h.sharedRoutine("alice", "r3", `{"kind":"manual"}`, `[
		{"id":"a","kind":"find_tasks","in":{"condition":{"literal":{}}}},
		{"id":"b","kind":"change_tasks","in":{"tasks":{"ref":"a"},"set":{"literal":{"section":{"project_id":"mine"}}}}}]`)
	res = h.runNow("alice", "r3", "", false)
	if res.Run.Outcome != OutcomeFailed {
		t.Fatalf("move out %+v", res.Run)
	}
	if n := len(h.live("alice", inProject("mine"))); n != 1 {
		t.Fatalf("mine holds %d", n)
	}
}

// Steps that act on personal things are not available in a shared routine.
func TestSharedRoutinePersonalStepsUnavailable(t *testing.T) {
	h, _ := sharedHarness(t)
	h.task("alice", "home1", map[string]any{"project_id": "p"})
	h.sharedRoutine("alice", "r1", `{"kind":"manual"}`, `[
		{"id":"a","kind":"find_tasks","in":{"condition":{"literal":{}}}},
		{"id":"b","kind":"set_focus","in":{"tasks":{"ref":"a"}}}]`)
	res := h.runNow("alice", "r1", "", false)
	if res.Run.Outcome != OutcomeFailed || res.Steps[1].Status != StepUnavailable {
		t.Fatalf("focus %+v %v", res.Run, statuses(res))
	}
}

// "Turned on again by Bob"; edits by another member pause the routine; a
// rename does not.
func TestSharedRoutineRunAsAndEditPause(t *testing.T) {
	h, _ := sharedHarness(t)
	h.sharedRoutine("alice", "r1", `{"kind":"task.created"}`, dueIn3)
	h.write("bob", "b", "rule", "r1", map[string]any{"name": "Chores"})
	if st := h.state("r1"); st.PausedReason != "" || st.RunAs != "alice" {
		t.Fatalf("rename paused: %+v", st)
	}
	h.write("bob", "b", "rule", "r1", map[string]any{"steps": json.RawMessage(strings.Replace(dueIn3, "3", "4", 1))})
	st := h.state("r1")
	if st.PausedReason != PausedEditedByOther || st.PausedBy != "bob" || st.RunAs != "alice" {
		t.Fatalf("after bob's edit: %+v", st)
	}
	h.task("alice", "t1", map[string]any{"project_id": "p"})
	h.e.Drain(h.ctx)
	if len(h.runs("r1")) != 0 {
		t.Fatal("a paused routine ran")
	}
	h.write("bob", "b", "rule", "r1", map[string]any{"enabled": false})
	h.write("bob", "b", "rule", "r1", map[string]any{"enabled": true})
	if st := h.state("r1"); st.PausedReason != "" || st.RunAs != "bob" {
		t.Fatalf("turned on by bob: %+v", st)
	}
	h.task("alice", "t2", map[string]any{"project_id": "p"})
	h.e.Drain(h.ctx)
	runs := h.runs("r1")
	if len(runs) != 1 || runs[0].RunAs != "bob" {
		t.Fatalf("runs %+v", runs)
	}
}

// "Alice leaves" and "Demoted to viewer": the routine pauses and the others
// are told; a viewer cannot run or undo.
func TestSharedRoutineLosesRunAs(t *testing.T) {
	h, sink := sharedHarness(t)
	h.sharedRoutine("bob", "r1", `{"kind":"task.created"}`, dueIn3)
	if _, err := h.sync.SetMemberRole(h.ctx, "alice", "p", "bob", opsync.RoleViewer); err != nil {
		t.Fatal(err)
	}
	h.e.CheckProject(h.ctx, "p")
	if st := h.state("r1"); st.PausedReason != PausedRunAsViewer {
		t.Fatalf("state %+v", st)
	}
	if len(sink.paused) != 1 || sink.paused[0].UserID != "alice" || sink.paused[0].RunAsName != "bob" || sink.paused[0].ProjectName != "Household" {
		t.Fatalf("notified %+v", sink.paused)
	}
	// A viewer's Run now is refused.
	if _, err := h.e.RunNow(h.ctx, "carol", RunRequest{RuleID: "r1", RunID: "x"}); !errors.Is(err, ErrForbidden) {
		t.Fatalf("viewer run: %v", err)
	}
	// Bob is an editor again and turns it on; then the owner removes him (the
	// owner cannot leave her own project).
	if _, err := h.sync.SetMemberRole(h.ctx, "alice", "p", "bob", opsync.RoleEditor); err != nil {
		t.Fatal(err)
	}
	h.write("bob", "b", "rule", "r1", map[string]any{"enabled": false})
	h.write("bob", "b", "rule", "r1", map[string]any{"enabled": true})
	if _, err := h.sync.RemoveMember(h.ctx, "alice", "p", "bob"); err != nil {
		t.Fatal(err)
	}
	// No CheckProject: the run itself finds out (group changes, deleted accounts).
	h.task("alice", "t1", map[string]any{"project_id": "p"})
	h.e.Drain(h.ctx)
	if st := h.state("r1"); st.PausedReason != PausedRunAsLeft {
		t.Fatalf("after removal %+v", st)
	}
	if len(h.runs("r1")) != 0 {
		t.Fatal("ran as a former member")
	}
}

// AI auto mode counts only when the run-as person turned it on.
func TestSharedRoutineAIModeNotRunAs(t *testing.T) {
	h, _ := sharedHarness(t)
	h.sharedRoutine("alice", "r1", `{"kind":"manual"}`, `[{"id":"a","kind":"ask_ai","in":{"instruction":{"literal":"x"}}}]`)
	h.write("alice", "laptop", "rule", "r1", map[string]any{"ai_apply": "auto"})
	if m, err := h.e.AIMode(h.ctx, "alice", "r1"); err != nil || !m.Auto {
		t.Fatalf("alice's own auto: %+v %v", m, err)
	}
	h.write("bob", "b", "rule", "r1", map[string]any{"ai_apply": ""})
	h.write("bob", "b", "rule", "r1", map[string]any{"ai_apply": "auto"})
	if m, _ := h.e.AIMode(h.ctx, "alice", "r1"); m.Auto || m.Reason != FallbackNotRunAs {
		t.Fatalf("bob's auto for alice: %+v", m)
	}
}

// A shared routine runs on the server for an encrypted run-as person, and
// one with encrypted text fails with a reason (D10).
func TestSharedRoutineEncryption(t *testing.T) {
	h, _ := sharedHarness(t)
	if _, err := h.e.db.Exec(`INSERT INTO encryption_keys(user_id, version, kdf, salt, iterations, wrapped_passphrase, wrapped_recovery, created_at, updated_at)
		VALUES ('bob', 1, 1, 's', 600000, 'p', 'r', 1, 1)`); err != nil {
		t.Fatal(err)
	}
	h.task("alice", "home1", map[string]any{"project_id": "p"})
	h.sharedRoutine("bob", "r1", `{"kind":"manual"}`, `[
		{"id":"a","kind":"find_tasks","in":{"condition":{"literal":{}}}},
		{"id":"b","kind":"add_comment","in":{"task":{"ref":"a"},"text":{"literal":"Done?"}}}]`)
	if res := h.runNow("bob", "r1", "", false); res.Run.Outcome != OutcomeApplied {
		t.Fatalf("encrypted run-as %+v %v", res.Run, statuses(res))
	}
	h.write("bob", "laptop", "rule", "r1", map[string]any{"name": "enc:v1:abc"})
	if res := h.runNow("bob", "r1", "", false); res.Run.Outcome != OutcomeFailed || !strings.Contains(res.Run.Reason, "encrypted") {
		t.Fatalf("encrypted text %+v", res.Run)
	}
}

var _ = ruleval.Schedule
