package rules

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/agenttools"
	"github.com/OpenTodoApp/opentodo/internal/notify"
	"github.com/OpenTodoApp/opentodo/internal/ruleval"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

type noticeSink struct{ notices []notify.RoutineNotice }

func (n *noticeSink) RoutineNotice(_ context.Context, x notify.RoutineNotice) {
	n.notices = append(n.notices, x)
}

// routineHarness is the rules harness with the agent tool registry as the
// routines' planner and everything available.
func routineHarness(t *testing.T) (*harness, *noticeSink, *ruleval.Env) {
	h := newHarness(t)
	h.e.Tools = agenttools.New(h.sync, agenttools.Options{Now: func() time.Time { return h.clock }})
	env := &ruleval.Env{Automations: true, Energy: true}
	h.e.Env = func(context.Context, string) ruleval.Env { return *env }
	sink := &noticeSink{}
	h.e.Routine = sink
	return h, sink, env
}

func (h *harness) routine(user, id, name, trigger, condition, steps string) {
	h.t.Helper()
	fields := map[string]any{"name": name, "enabled": true, "trigger": json.RawMessage(trigger), "actions": nil, "steps": json.RawMessage(steps),
		"condition": json.RawMessage("null"), "position": 1, "created_at": 1, "deleted_at": nil}
	if condition != "" {
		fields["condition"] = json.RawMessage(condition)
	}
	h.write(user, "laptop", "rule", id, fields)
}

func (h *harness) runNow(user, rule, task string, test bool) Result {
	h.t.Helper()
	h.n++
	res, err := h.e.RunNow(h.ctx, user, RunRequest{RuleID: rule, RunID: fmt.Sprintf("run-%d", h.n), TaskID: task, Test: test})
	if err != nil {
		h.t.Fatalf("run %s: %v", rule, err)
	}
	return res
}

func (h *harness) live(user string, pred func(opsync.Entity) bool) []opsync.Entity {
	h.t.Helper()
	rows, err := h.sync.List(h.ctx, user, "task", false)
	if err != nil {
		h.t.Fatal(err)
	}
	var out []opsync.Entity
	for _, r := range rows {
		if pred(r) {
			out = append(out, r)
		}
	}
	return out
}

func inProject(p string) func(opsync.Entity) bool {
	return func(e opsync.Entity) bool { return strOf(e["project_id"]) == p }
}

func statuses(res Result) []string {
	out := []string{}
	for _, s := range res.Steps {
		x := s.StepID + ":" + s.Status
		if s.Error != "" {
			x += ":" + s.Error
		}
		out = append(out, x)
	}
	return out
}

func (h *harness) project(user, id, name, note string) {
	h.write(user, "laptop", "project", id, map[string]any{"name": name, "description": note, "created_at": 1, "deleted_at": nil})
}

// "Later steps see earlier changes": step 1 creates two tasks in Errands and
// step 2 counts the open tasks of Errands, which held five.
func TestRoutineLaterStepsSeeEarlierChanges(t *testing.T) {
	h, _, _ := routineHarness(t)
	h.project("alice", "errands", "Errands", "")
	for i := range 5 {
		h.task("alice", fmt.Sprintf("e%d", i), map[string]any{"project_id": "errands"})
	}
	h.routine("alice", "r1", "Shop", `{"kind":"manual"}`, "", `[
		{"id":"a","kind":"create_tasks","in":{"text":{"literal":"milk\nbread"},"project":{"literal":{"project":"errands"}}}},
		{"id":"b","kind":"find_tasks","in":{"condition":{"literal":{"project":{"in":["errands"]}}}}},
		{"id":"c","kind":"count","in":{"list":{"ref":"b"}}}]`)
	test := h.runNow("alice", "r1", "", true)
	if test.Steps[2].Preview != float64(7) || test.Writes != 2 || len(h.live("alice", inProject("errands"))) != 5 {
		t.Fatalf("test: preview %v writes %d", test.Steps[2].Preview, test.Writes)
	}
	res := h.runNow("alice", "r1", "", false)
	if res.Run.Outcome != OutcomeApplied || res.Run.Source != SourceManual || res.Run.Writes != 2 || len(res.Run.Steps) != 3 {
		t.Fatalf("run %+v", res.Run)
	}
	if n := len(h.live("alice", inProject("errands"))); n != 7 {
		t.Fatalf("errands holds %d", n)
	}
	var device string
	if err := h.e.db.QueryRow(`SELECT device FROM ops WHERE entity = 'task' AND field = 'title' ORDER BY seq DESC LIMIT 1`).Scan(&device); err != nil || device != "rule:r1" {
		t.Fatalf("device %q %v", device, err)
	}
	if res.Run.Steps[0].Items != 2 || len(res.Run.Steps[0].IDs) != 2 || res.Run.Steps[2].OutType != "number" {
		t.Fatalf("records %+v", res.Run.Steps)
	}
}

// "Failure at step 4": the run fails, no task is created, steps 1 to 3 are
// planned and step 4 failed.
func TestRoutineFailureAtStep4WritesNothing(t *testing.T) {
	h, _, _ := routineHarness(t)
	h.project("alice", "errands", "Errands", "")
	h.project("alice", "gone", "Gone", "")
	h.write("alice", "laptop", "project", "gone", map[string]any{"deleted_at": 5})
	h.routine("alice", "r1", "Broken", `{"kind":"manual"}`, "", `[
		{"id":"a","kind":"split_lines","in":{"text":{"literal":"a\nb"}}},
		{"id":"b","kind":"create_tasks","in":{"text":{"ref":"a"},"project":{"literal":{"project":"errands"}}}},
		{"id":"c","kind":"count","in":{"list":{"ref":"b"}}},
		{"id":"d","kind":"change_tasks","in":{"tasks":{"ref":"b"},"set":{"literal":{"section":{"project_id":"gone","section_id":null}}}}}]`)
	res := h.runNow("alice", "r1", "", false)
	if res.Run.Outcome != OutcomeFailed || res.Run.FailedStep != 3 {
		t.Fatalf("run %+v", res.Run)
	}
	if got := statuses(res); !slices.Equal(got, []string{"a:ok", "b:ok", "c:ok", "d:failed:not_found"}) {
		t.Fatalf("steps %v", got)
	}
	if n := len(h.live("alice", func(opsync.Entity) bool { return true })); n != 0 {
		t.Fatalf("%d tasks written", n)
	}
}

// "Groceries from a note": three tasks from a note's list.
func TestRoutineGroceriesFromANote(t *testing.T) {
	h, _, _ := routineHarness(t)
	h.project("alice", "groc", "Groceries", "- oat milk\n- [ ] bread tomorrow\n\n- apples")
	h.project("alice", "errands", "Errands", "")
	h.routine("alice", "r1", "Groceries", `{"kind":"schedule","at":"17:00","weekdays":[5]}`, "", `[
		{"id":"p","kind":"find_project","in":{"name":{"literal":"groceries"}}},
		{"id":"a","kind":"note_text","in":{"of":{"ref":"p"}}},
		{"id":"b","kind":"split_lines","in":{"text":{"ref":"a"}}},
		{"id":"c","kind":"create_tasks","in":{"text":{"ref":"b"},"project":{"literal":{"project":"errands"}}}}]`)
	res := h.runNow("alice", "r1", "", false)
	if res.Run.Outcome != OutcomeApplied {
		t.Fatalf("run %+v %v", res.Run, statuses(res))
	}
	var titles []string
	for _, t := range h.live("alice", inProject("errands")) {
		titles = append(titles, strOf(t["title"]))
	}
	slices.Sort(titles)
	if !slices.Equal(titles, []string{"apples", "bread", "oat milk"}) {
		t.Fatalf("titles %v", titles)
	}
	for _, x := range h.live("alice", inProject("errands")) {
		if d := dueOf(x["due"]); strOf(x["title"]) == "bread" && (d == nil || d.Date != "2026-10-22") {
			t.Fatalf("bread due %v", d)
		}
	}
}

// "If and Otherwise": 12 waiting tasks notify, 4 end the run at the If.
func TestRoutineIfOtherwise(t *testing.T) {
	h, sink, _ := routineHarness(t)
	h.write("alice", "laptop", "label", "lw", map[string]any{"name": "waiting", "created_at": 1, "deleted_at": nil})
	h.routine("alice", "r1", "Waiting", `{"kind":"manual"}`, "", `[
		{"id":"a","kind":"find_tasks","in":{"condition":{"literal":{"labels":{"any":["lw"]}}}}},
		{"id":"b","kind":"count","in":{"list":{"ref":"a"}}},
		{"id":"c","kind":"if","in":{"value":{"ref":"b"},"is":{"literal":{">":10}}},
			"then":[{"id":"d","kind":"notify","in":{"text":{"literal":{"format":"Too much waiting: {b}"}}}}],
			"otherwise":[{"id":"e","kind":"stop"}]}]`)
	for i := range 4 {
		h.task("alice", fmt.Sprintf("w%d", i), map[string]any{"labels": []string{"lw"}})
	}
	res := h.runNow("alice", "r1", "", false)
	if res.Run.Outcome != OutcomeEnded || len(sink.notices) != 0 {
		t.Fatalf("4: %+v %v", res.Run, statuses(res))
	}
	for i := 4; i < 12; i++ {
		h.task("alice", fmt.Sprintf("w%d", i), map[string]any{"labels": []string{"lw"}})
	}
	res = h.runNow("alice", "r1", "", false)
	if res.Run.Outcome != OutcomeApplied || len(sink.notices) != 1 || sink.notices[0].Text != "Too much waiting: 12" || sink.notices[0].RunID != res.Run.RunID {
		t.Fatalf("12: %+v %+v", res.Run, sink.notices)
	}
}

// "Repeat for each": a comment and tomorrow's date on each task due today.
func TestRoutineRepeatForEach(t *testing.T) {
	h, _, _ := routineHarness(t)
	for _, id := range []string{"t1", "t2"} {
		h.task("alice", id, map[string]any{"due": map[string]string{"date": "2026-10-21"}})
	}
	h.routine("alice", "r1", "Carry", `{"kind":"manual"}`, "", `[
		{"id":"a","kind":"find_tasks","in":{"condition":{"literal":{"due":"today"}}}},
		{"id":"b","kind":"repeat","in":{"list":{"ref":"a"}},"do":[
			{"id":"c","kind":"add_comment","in":{"task":{"ref":"item"},"text":{"literal":"Carried over"}}},
			{"id":"d","kind":"change_tasks","in":{"tasks":{"ref":"item"},"set":{"literal":{"due":"tomorrow"}}}}]}]`)
	res := h.runNow("alice", "r1", "", false)
	if res.Run.Outcome != OutcomeApplied || res.Run.Writes != 4 {
		t.Fatalf("run %+v %v", res.Run, statuses(res))
	}
	for _, id := range []string{"t1", "t2"} {
		if d := dueOf(h.get("alice", id)["due"]); d == nil || d.Date != "2026-10-22" {
			t.Fatalf("%s due %v", id, d)
		}
		cs, _ := h.sync.TaskComments(h.ctx, "alice", id)
		if len(cs) != 1 || strOf(cs[0]["body"]) != "Carried over" {
			t.Fatalf("%s comments %d", id, len(cs))
		}
	}
}

// Unavailable steps fail the run at that step, nothing written (2.7).
func TestRoutineUnavailableAtRunTime(t *testing.T) {
	h, _, env := routineHarness(t)
	h.task("alice", "t1", nil)
	h.routine("alice", "r1", "Energy", `{"kind":"manual"}`, "", `[
		{"id":"a","kind":"change_tasks","in":{"tasks":{"ref":"trigger"},"set":{"literal":{"priority":1}}}},
		{"id":"b","kind":"change_tasks","in":{"tasks":{"ref":"trigger"},"set":{"literal":{"energy":"low"}}}}]`)
	env.Energy = false
	res := h.runNow("alice", "r1", "t1", false)
	if res.Run.Outcome != OutcomeFailed || !strings.Contains(res.Run.Reason, "Energy levels") {
		t.Fatalf("energy off: %+v %v", res.Run, statuses(res))
	}
	if got := statuses(res); got[len(got)-1] != "b:unavailable:unavailable:energy_off" {
		t.Fatalf("steps %v", got)
	}
	if p := string(h.get("alice", "t1")["priority"]); p != "4" {
		t.Fatalf("priority written: %s", p)
	}
	h.routine("alice", "r2", "Hook", `{"kind":"manual"}`, "", `[{"id":"a","kind":"webhook","in":{"webhook_id":{"literal":"w1"}}}]`)
	if got := statuses(h.runNow("alice", "r2", "", false)); !slices.Equal(got, []string{"a:unavailable:unavailable:no_webhook"}) {
		t.Fatalf("webhook deleted: %v", got)
	}
	// "SMTP removed later": Find tasks, Format text, Email me fails at Email me.
	h.routine("alice", "r3", "Friday digest", `{"kind":"manual"}`, "", `[
		{"id":"a","kind":"find_tasks","in":{"condition":{"literal":{"due":"today"}}}},
		{"id":"b","kind":"format","in":{"template":{"literal":"{a}"}}},
		{"id":"c","kind":"email_me","in":{"subject":{"literal":"Week"},"text":{"ref":"b"}}}]`)
	if got := statuses(h.runNow("alice", "r3", "", false)); !slices.Equal(got, []string{"a:ok", "b:ok", "c:unavailable:unavailable:email_not_configured"}) {
		t.Fatalf("SMTP removed: %v", got)
	}
	env.Automations = false
	if _, err := h.e.RunNow(h.ctx, "alice", RunRequest{RuleID: "r2", RunID: "x"}); err != nil {
		// Automations off on the owner switch is refused before running; the
		// environment's own flag makes every step unavailable.
		t.Fatal(err)
	}
}

// Encrypted accounts: content routines are skipped, content-free ones run (2.8).
func TestRoutineEncryptedAccount(t *testing.T) {
	h, _, _ := routineHarness(t)
	if _, err := h.e.db.Exec(`INSERT INTO encryption_keys(user_id, version, kdf, salt, iterations, wrapped_passphrase, wrapped_recovery, created_at, updated_at)
		VALUES ('alice', 1, 1, 's', 600000, 'p', 'r', 1, 1)`); err != nil {
		t.Fatal(err)
	}
	for i := range 6 {
		h.task("alice", fmt.Sprintf("o%d", i), map[string]any{"due": map[string]string{"date": "2026-10-01"}})
	}
	h.routine("alice", "free", "Overdue", `{"kind":"manual"}`, "", `[
		{"id":"a","kind":"find_tasks","in":{"condition":{"literal":{"due":"overdue"}}}},
		{"id":"b","kind":"count","in":{"list":{"ref":"a"}}},
		{"id":"c","kind":"if","in":{"value":{"ref":"b"},"is":{"literal":{">":5}}},"then":[
			{"id":"d","kind":"change_tasks","in":{"tasks":{"ref":"a"},"set":{"literal":{"due":"tomorrow"}}}}]}]`)
	if res := h.runNow("alice", "free", "", false); res.Run.Outcome != OutcomeApplied || res.Run.Writes != 6 {
		t.Fatalf("content-free: %+v %v", res.Run, statuses(res))
	}
	h.routine("alice", "notes", "Notes", `{"kind":"manual"}`, "", `[{"id":"p","kind":"find_project","in":{"name":{"literal":"x"}}},{"id":"a","kind":"note_text","in":{"of":{"ref":"p"}}}]`)
	if res := h.runNow("alice", "notes", "", false); res.Run.Outcome != OutcomeSkipped || res.Run.Reason != ErrCodeEncrypted {
		t.Fatalf("content: %+v", res.Run)
	}
}

// Limits (2.6): 500 writes, the time limit with a stepped clock, a run counts once.
func TestRoutineLimits(t *testing.T) {
	h, _, _ := routineHarness(t)
	for i := range 300 {
		h.write("alice", "phone", "task", fmt.Sprintf("x%03d", i), map[string]any{"title": "x", "labels": []string{}, "priority": 4, "created_at": 1, "deleted_at": nil, "completed_at": nil, "position": i})
	}
	// "Too many writes": 300 changes and a comment on each.
	h.routine("alice", "r1", "Many", `{"kind":"manual"}`, "", `[
		{"id":"a","kind":"find_tasks","in":{"condition":{"literal":{"priority":{"in":[4]}}}}},
		{"id":"b","kind":"change_tasks","in":{"tasks":{"ref":"a"},"set":{"literal":{"priority":2}}}},
		{"id":"c","kind":"repeat","in":{"list":{"ref":"a"}},"do":[{"id":"d","kind":"add_comment","in":{"task":{"ref":"item"},"text":{"literal":"seen"}}}]}]`)
	res := h.runNow("alice", "r1", "", false)
	if res.Run.Outcome != OutcomeFailed || !slices.Contains(statuses(res), "d:failed:write_limit") || len(res.Steps) != 4 {
		t.Fatalf("write limit: %+v %v", res.Run, statuses(res))
	}
	if n := len(h.live("alice", func(e opsync.Entity) bool { return string(e["priority"]) != "4" })); n != 0 {
		t.Fatalf("%d written", n)
	}
	// Time limit: the filter query takes 61 seconds of the stepped clock.
	h.e.Query = func(context.Context, string, string, map[string]opsync.Entity) (func(opsync.Entity) bool, error) {
		h.clock = h.clock.Add(61 * time.Second)
		return func(opsync.Entity) bool { return false }, nil
	}
	h.routine("alice", "r2", "Slow", `{"kind":"manual"}`, "", `[
		{"id":"a","kind":"find_tasks","in":{"query":{"literal":"today"}}},
		{"id":"b","kind":"count","in":{"list":{"ref":"a"}}}]`)
	res = h.runNow("alice", "r2", "", false)
	if got := statuses(res); !slices.Equal(got, []string{"a:ok", "b:failed:time_limit"}) {
		t.Fatalf("time limit: %v", got)
	}
	// A run of three steps counts once.
	h.e.limits = newLimiter()
	h.routine("alice", "r3", "Small", `{"kind":"manual"}`, "", `[
		{"id":"a","kind":"get_task","in":{"task":{"literal":{"task":"x000"}}}},
		{"id":"b","kind":"change_tasks","in":{"tasks":{"ref":"a"},"set":{"literal":{"priority":1}}}},
		{"id":"c","kind":"stop"}]`)
	h.runNow("alice", "r3", "", false)
	if c := h.e.limits.users["alice"]; c == nil || c.inMinute != 1 {
		t.Fatalf("counted %+v", c)
	}
}

// Manual runs: a retried request answers the same run; task_required.
func TestRoutineManualRuns(t *testing.T) {
	h, _, _ := routineHarness(t)
	h.task("alice", "t1", nil)
	h.routine("alice", "r1", "Follow up", `{"kind":"label.added","label_id":"lw"}`, "", `[
		{"id":"a","kind":"change_tasks","in":{"tasks":{"ref":"trigger"},"set":{"literal":{"priority":1}}}}]`)
	if _, err := h.e.RunNow(h.ctx, "alice", RunRequest{RuleID: "r1", RunID: "u1"}); !errors.Is(err, ErrTaskRequired) {
		t.Fatalf("no task: %v", err)
	}
	a, err := h.e.RunNow(h.ctx, "alice", RunRequest{RuleID: "r1", RunID: "u2", TaskID: "t1"})
	if err != nil {
		t.Fatal(err)
	}
	b, err := h.e.RunNow(h.ctx, "alice", RunRequest{RuleID: "r1", RunID: "u2", TaskID: "t1"})
	if err != nil || a.Run.RunID != b.Run.RunID || len(h.runs("r1")) != 1 {
		t.Fatalf("retried: %v %s %s %d", err, a.Run.RunID, b.Run.RunID, len(h.runs("r1")))
	}
	if _, err := h.e.RunNow(h.ctx, "bob", RunRequest{RuleID: "r1", RunID: "u3", TaskID: "t1"}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("bob: %v", err)
	}
	// An event still fires the routine like a rule.
	h.write("alice", "laptop", "label", "lw", map[string]any{"name": "waiting", "created_at": 1, "deleted_at": nil})
	h.task("alice", "t2", nil)
	h.e.Drain(h.ctx)
	h.write("alice", "phone", "task", "t2", map[string]any{"labels": []string{"lw"}})
	h.e.Drain(h.ctx)
	if p := string(h.get("alice", "t2")["priority"]); p != "1" {
		t.Fatalf("event run: priority %s", p)
	}
}

// Undo (2.10): "Undo a sweep", "Created tasks", "Twice".
func TestRoutineUndo(t *testing.T) {
	h, _, _ := routineHarness(t)
	for i := range 11 {
		h.task("alice", fmt.Sprintf("o%02d", i), map[string]any{"due": map[string]string{"date": "2026-10-19"}})
	}
	h.routine("alice", "r1", "Sweep", `{"kind":"manual"}`, "", `[
		{"id":"a","kind":"find_tasks","in":{"condition":{"literal":{"due":"overdue"}}}},
		{"id":"b","kind":"change_tasks","in":{"tasks":{"ref":"a"},"set":{"literal":{"due":{"in_days":5}}}}}]`)
	res := h.runNow("alice", "r1", "", false)
	if res.Run.Writes != 11 {
		t.Fatalf("run %+v %v", res.Run, statuses(res))
	}
	h.clock = h.clock.Add(time.Minute)
	h.write("alice", "phone", "task", "o03", map[string]any{"due": map[string]string{"date": "2026-10-23"}})
	u, err := h.e.Undo(h.ctx, "alice", "r1", res.Run.RunID)
	if err != nil || u.Restored != 10 || u.Kept != 1 {
		t.Fatalf("undo %+v %v", u, err)
	}
	if d := dueOf(h.get("alice", "o00")["due"]); d == nil || d.Date != "2026-10-19" {
		t.Fatalf("o00 due %v", d)
	}
	if d := dueOf(h.get("alice", "o03")["due"]); d == nil || d.Date != "2026-10-23" {
		t.Fatalf("o03 due %v", d)
	}
	if _, err := h.e.Undo(h.ctx, "alice", "r1", res.Run.RunID); !errors.Is(err, ErrAlreadyUndone) {
		t.Fatalf("twice: %v", err)
	}
	if n, _ := h.e.Store.Pending(h.ctx); n != 0 {
		t.Fatalf("the undo queued %d rule events", n)
	}
	h.routine("alice", "r2", "Make", `{"kind":"manual"}`, "", `[{"id":"a","kind":"create_tasks","in":{"text":{"literal":"one\ntwo\nthree"}}}]`)
	made := h.runNow("alice", "r2", "", false)
	u, err = h.e.Undo(h.ctx, "alice", "r2", made.Run.RunID)
	if err != nil || u.Restored != 3 {
		t.Fatalf("created: %+v %v", u, err)
	}
	for _, id := range made.Run.Steps[0].IDs {
		if e, _ := h.sync.Get(h.ctx, "alice", "task", id); e == nil || !e.Deleted() {
			t.Fatalf("%s not in the Trash", id)
		}
	}
	if !h.e.Store.IsUndo(h.ctx, "r2", h.sync.ServerTSAt(h.clock.UnixMilli())) {
		// The undo's batch is labelled by its timestamp.
		var ts int64
		_ = h.e.db.QueryRow(`SELECT undo_ts FROM rule_runs WHERE run_id = ?`, made.Run.RunID).Scan(&ts)
		if !h.e.Store.IsUndo(h.ctx, "r2", ts) {
			t.Fatal("undo batch not recorded")
		}
	}
}

// Run records (2.9): old rows read with defaults; no text is stored; the
// all-runs list and one run with its steps.
func TestRoutineRunRecords(t *testing.T) {
	h, _, _ := routineHarness(t)
	if _, err := h.e.db.Exec(`INSERT INTO rule_runs (rule_id, user_id, occurrence_key, task_id, at, outcome, reason, changes_json, depth, run_id)
		VALUES ('old', 'alice', 'sched:2026-10-01T08:00', '', 5, 'applied', '', '[]', 2, 'rold')`); err != nil {
		t.Fatal(err)
	}
	old, err := h.e.Store.RunByID(h.ctx, "alice", "rold")
	if err != nil || old.StepsCount != 1 || old.FailedStep != -1 || old.UndoneAt != nil {
		t.Fatalf("old row %+v %v", old, err)
	}
	h.routine("alice", "r1", "Secret", `{"kind":"manual"}`, "", `[
		{"id":"a","kind":"create_tasks","in":{"title":{"literal":"top secret title"}}},
		{"id":"b","kind":"notify","in":{"text":{"literal":"secret notice"}}}]`)
	res := h.runNow("alice", "r1", "", false)
	var dump string
	_ = h.e.db.QueryRow(`SELECT group_concat(occurrence_key || reason || changes_json || batches_json, '|') FROM rule_runs`).Scan(&dump)
	var steps string
	_ = h.e.db.QueryRow(`SELECT group_concat(step_id || kind || status || ids_json || error, '|') FROM rule_step_runs`).Scan(&steps)
	if strings.Contains(dump+steps, "secret") {
		t.Fatalf("text stored: %s %s", dump, steps)
	}
	all, err := h.e.Store.UserRuns(h.ctx, "alice", RunFilter{})
	if err != nil || len(all) != 2 || all[0].RunID != res.Run.RunID {
		t.Fatalf("all runs %v %+v", err, all)
	}
	if _, err := h.e.Store.RunByID(h.ctx, "bob", res.Run.RunID); !errors.Is(err, ErrRunNotFound) {
		t.Fatalf("bob reads alice's run: %v", err)
	}
	failed, _ := h.e.Store.UserRuns(h.ctx, "alice", RunFilter{Outcome: OutcomeFailed})
	if len(failed) != 0 {
		t.Fatalf("failed %d", len(failed))
	}
}

// A legacy rule still runs exactly as before; the dry run of a draft writes nothing.
func TestRoutineDraftTest(t *testing.T) {
	h, _, _ := routineHarness(t)
	h.task("alice", "t1", nil)
	res, err := h.e.TestDraft(h.ctx, "alice", Draft{Trigger: json.RawMessage(`{"kind":"manual"}`),
		Steps: json.RawMessage(`[{"id":"a","kind":"split_lines","in":{"text":{"literal":"one\ntwo\nthree"}}},{"id":"b","kind":"create_tasks","in":{"text":{"ref":"a"}}}]`)})
	if err != nil || res.Writes != 3 || len(res.Steps) != 2 || len(h.runs("draft")) != 0 {
		t.Fatalf("draft %+v %v", res, err)
	}
	if n := len(h.live("alice", func(opsync.Entity) bool { return true })); n != 1 {
		t.Fatalf("%d tasks after a test", n)
	}
	if _, err := h.e.TestDraft(h.ctx, "alice", Draft{Trigger: json.RawMessage(`{"kind":"manual"}`), Steps: json.RawMessage(`[{"id":"a","kind":"nope"}]`)}); !errors.Is(err, ErrInvalidDraft) {
		t.Fatalf("invalid: %v", err)
	}
	// The legacy reading of a rule as one Change tasks step.
	h.rule("alice", "legacy", "P1", `{"kind":"task.created"}`, "", `{"priority":1}`)
	lres, err := h.e.TestRule(h.ctx, "alice", "legacy", "")
	if err == nil {
		t.Fatalf("a legacy rule needs its task: %+v", lres)
	}
	lres, err = h.e.TestRule(h.ctx, "alice", "legacy", "t1")
	if err != nil || lres.Writes != 1 || lres.Steps[0].Kind != "change_tasks" {
		t.Fatalf("legacy %+v %v", lres, err)
	}
}

// filter-queries "Evaluation on the server for routines": a saved view's
// query, and an invalid query failing the step with the parser's error.
func TestRoutineFindTasksByQueryAndView(t *testing.T) {
	h, _, _ := routineHarness(t)
	h.project("alice", "errands", "Errands", "")
	h.task("alice", "t1", map[string]any{"project_id": "errands"})
	h.task("alice", "t2", map[string]any{"project_id": "errands", "priority": 1})
	h.task("alice", "t3", nil)
	h.write("alice", "laptop", "view", "v1", map[string]any{"name": "Errands", "query": "#Errands", "created_at": 1, "deleted_at": nil})
	h.routine("alice", "r1", "Count", `{"kind":"manual"}`, "", `[
		{"id":"a","kind":"find_tasks","in":{"view":{"literal":"v1"}}},
		{"id":"b","kind":"count","in":{"list":{"ref":"a"}}}]`)
	res := h.runNow("alice", "r1", "", true)
	if res.Steps[1].Preview != float64(2) {
		t.Fatalf("view: %+v %v", res.Steps, statuses(res))
	}
	h.write("alice", "laptop", "view", "v1", map[string]any{"query": "due before:"})
	res = h.runNow("alice", "r1", "", false)
	if got := statuses(res); !slices.Equal(got, []string{"a:failed:invalid_argument"}) || !strings.Contains(res.Run.Reason, "Expected a comparison") {
		t.Fatalf("invalid query: %v %q", got, res.Run.Reason)
	}
}

// "From a template": the library's weekly review, its sections and tasks, with
// the dates its own instantiation gives for the start day.
func TestRoutineProjectFromTemplate(t *testing.T) {
	h, _, _ := routineHarness(t)
	h.routine("alice", "r1", "Monthly", `{"kind":"manual"}`, "", `[
		{"id":"a","kind":"project_from_template","in":{"template":{"literal":"weekly-review"},"start":{"literal":"today"}}}]`)
	res := h.runNow("alice", "r1", "", false)
	if res.Run.Outcome != OutcomeApplied {
		t.Fatalf("run %+v %v", res.Run, statuses(res))
	}
	pid := res.Run.Steps[0].IDs[0]
	tasks := h.live("alice", inProject(pid))
	sections, _ := h.sync.List(h.ctx, "alice", "section", false)
	labels, _ := h.sync.List(h.ctx, "alice", "label", false)
	if len(tasks) != 9 || len(sections) != 3 || len(labels) != 1 {
		t.Fatalf("%d tasks %d sections %d labels", len(tasks), len(sections), len(labels))
	}
	for _, x := range tasks {
		if strOf(x["title"]) == "Empty the inbox" {
			if d := dueOf(x["due"]); d == nil || d.Date != "2026-10-21" || d.Time == nil || *d.Time != "16:00" {
				t.Fatalf("due %v", d)
			}
		}
	}
	h.routine("alice", "r2", "Nope", `{"kind":"manual"}`, "", `[{"id":"a","kind":"project_from_template","in":{"template":{"literal":"nope"},"start":{"literal":"today"}}}]`)
	if got := statuses(h.runNow("alice", "r2", "", false)); !slices.Equal(got, []string{"a:failed:not_found"}) {
		t.Fatalf("unknown template %v", got)
	}
}

// "Today's focus": three highest-priority tasks; a fourth is left out.
func TestRoutineSetFocus(t *testing.T) {
	h, _, _ := routineHarness(t)
	for i, p := range []int{1, 1, 2, 3} {
		h.task("alice", fmt.Sprintf("f%d", i), map[string]any{"priority": p, "due": map[string]string{"date": "2026-10-21"}})
	}
	h.routine("alice", "r1", "Focus", `{"kind":"manual"}`, "", `[
		{"id":"a","kind":"find_tasks","in":{"condition":{"literal":{"due":"today"}}}},
		{"id":"b","kind":"sort","in":{"list":{"ref":"a"},"by":{"literal":"priority"}}},
		{"id":"c","kind":"set_focus","in":{"tasks":{"ref":"b"}}}]`)
	res := h.runNow("alice", "r1", "", false)
	if got := statuses(res); !slices.Equal(got, []string{"a:ok", "b:ok", "c:truncated"}) {
		t.Fatalf("steps %v", got)
	}
	review, _ := h.sync.Get(h.ctx, "alice", "review", "me")
	if review == nil || strOf(review["focus"]) != "f0,f1,f2" || strOf(review["focus_date"]) != "2026-10-21" {
		t.Fatalf("review %v", review)
	}
}

// Clear note: the projection and the document are emptied; an older copy from
// another device does not bring the note back.
func TestRoutineClearNoteTwoDevices(t *testing.T) {
	h, _, _ := routineHarness(t)
	h.task("alice", "t1", map[string]any{"description": "old note", "notes_doc": ""})
	old := h.sync.ServerTSAt(h.clock.UnixMilli()) // device B's copy, written before the clear
	h.clock = h.clock.Add(time.Minute)
	h.routine("alice", "r1", "Clear", `{"kind":"manual"}`, "", `[
		{"id":"a","kind":"get_task","in":{"task":{"literal":{"task":"t1"}}}},
		{"id":"b","kind":"clear_note","in":{"of":{"ref":"a"}}}]`)
	if res := h.runNow("alice", "r1", "", false); res.Run.Outcome != OutcomeApplied {
		t.Fatalf("run %+v %v", res.Run, statuses(res))
	}
	stale := opsync.Op{ID: "stale", Entity: "task", EntityID: "t1", Field: "description", Value: json.RawMessage(`"old note, edited offline"`), TS: old + 1, Device: "phone-b"}
	if _, err := h.sync.Apply(h.ctx, "alice", []opsync.Op{stale}); err != nil {
		t.Fatal(err)
	}
	if d := strOf(h.get("alice", "t1")["description"]); d != "" {
		t.Fatalf("description %q", d)
	}
}

type fakeMailer struct {
	sent    []RoutineMail
	refused []string
}

func (f *fakeMailer) SendRoutine(_ context.Context, _ string, m RoutineMail) error {
	f.sent = append(f.sent, m)
	return nil
}

func (f *fakeMailer) RefuseRoutine(_ context.Context, _ string, _ RoutineMail, reason string) {
	f.refused = append(f.refused, reason)
}

// 2.5: Send a webhook queues one delivery after commit; Email me sends to the
// account within 10 per routine a day, then fails with rate_limited.
func TestRoutineWebhookAndEmail(t *testing.T) {
	h, _, env := routineHarness(t)
	env.Webhooks, env.EmailConfigured, env.EmailVerified = []string{"w1"}, true, true
	var deliveries []RoutineDelivery
	h.e.RoutineHook = func(_ context.Context, uid, hook string, d RoutineDelivery) error {
		if uid != "alice" || hook != "w1" {
			t.Errorf("delivery to %s %s", uid, hook)
		}
		deliveries = append(deliveries, d)
		return nil
	}
	mailer := &fakeMailer{}
	h.e.Mail = mailer
	for i := range 3 {
		h.task("alice", fmt.Sprintf("t%d", i), map[string]any{"due": map[string]string{"date": "2026-10-21"}})
	}
	h.routine("alice", "r1", "Morning", `{"kind":"manual"}`, "", `[
		{"id":"a","kind":"find_tasks","in":{"condition":{"literal":{"due":"today"}}}},
		{"id":"b","kind":"count","in":{"list":{"ref":"a"}}},
		{"id":"c","kind":"webhook","in":{"webhook_id":{"literal":"w1"},"text":{"literal":{"format":"{b} tasks today"}},"tasks":{"ref":"a"}}},
		{"id":"d","kind":"email_me","in":{"subject":{"literal":"Today"},"text":{"literal":{"format":"{a}"}}}}]`)
	test := h.runNow("alice", "r1", "", true)
	if len(deliveries) != 0 || len(mailer.sent) != 0 || test.Writes != 2 {
		t.Fatalf("a test sent something: %d %d %d", len(deliveries), len(mailer.sent), test.Writes)
	}
	res := h.runNow("alice", "r1", "", false)
	if res.Run.Outcome != OutcomeApplied || len(deliveries) != 1 || len(mailer.sent) != 1 {
		t.Fatalf("run %+v %v: %d deliveries %d mails", res.Run, statuses(res), len(deliveries), len(mailer.sent))
	}
	if d := deliveries[0]; *d.Text != "3 tasks today" || len(d.TaskIDs) != 3 || d.RunID != res.Run.RunID || d.StepID != "c" {
		t.Fatalf("delivery %+v", d)
	}
	if m := mailer.sent[0]; m.Subject != "Today" || !strings.Contains(m.Text, "t0") && !strings.Contains(m.Text, "t1") {
		t.Fatalf("mail %+v", m)
	}
	for range 9 {
		h.runNow("alice", "r1", "", false)
	}
	if len(mailer.sent) != 10 {
		t.Fatalf("%d mails", len(mailer.sent))
	}
	res = h.runNow("alice", "r1", "", false)
	if got := statuses(res); got[len(got)-1] != "d:failed:rate_limited" || len(mailer.sent) != 10 || !slices.Equal(mailer.refused, []string{"rate_limited"}) {
		t.Fatalf("limit: %v %d %v", got, len(mailer.sent), mailer.refused)
	}
}

type fullQuota struct{}

func (fullQuota) Admit(context.Context, *sql.Tx) (func(opsync.Op) string, error) {
	return func(opsync.Op) string { return opsync.ReasonLimitOpsHour }, nil
}
func (fullQuota) Stored(int) {}

// Host mode (3.7): a tenant over its write allowance fails the run with
// tenant_limit and nothing is written.
func TestRoutineTenantLimit(t *testing.T) {
	h, _, _ := routineHarness(t)
	h.routine("alice", "r1", "Make", `{"kind":"manual"}`, "", `[{"id":"a","kind":"create_tasks","in":{"text":{"literal":"one\ntwo"}}}]`)
	h.sync.SetQuota(fullQuota{})
	res := h.runNow("alice", "r1", "", false)
	h.sync.SetQuota(nil)
	if res.Run.Outcome != OutcomeFailed || res.Run.Reason != ErrCodeTenantLimit {
		t.Fatalf("run %+v", res.Run)
	}
	if n := len(h.live("alice", func(opsync.Entity) bool { return true })); n != 0 {
		t.Fatalf("%d tasks written", n)
	}
}
