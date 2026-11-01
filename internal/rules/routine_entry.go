package rules

import (
	"context"
	"encoding/json"
	"slices"
	"strings"

	"github.com/OpenTodoApp/opentodo/internal/ruleval"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// How a routine run starts: an event or a time trigger through the worker,
// Run now (REST, the palette, the CLI, MCP), a test of a saved routine, a test
// of an unsaved draft (design D7, D8).

// readRule decodes a rule row; ok is false for a rule this server cannot read
// (made by a newer version).
func readRule(row opsync.Entity) (rule, bool) {
	r := rule{ID: str(row, "id"), Name: str(row, "name"), Enabled: boolOf(row, "enabled"), AIApply: str(row, "ai_apply"), AIBudget: AIBudget(num(row, "ai_budget"))}
	var err error
	if r.Trigger, err = ruleval.ParseTrigger(row["trigger"]); err != nil {
		return r, false
	}
	if !opsync.IsNull(row["condition"]) {
		if r.Condition, err = ruleval.ParseCondition(row["condition"]); err != nil {
			return r, false
		}
		r.HasCondition = true
	}
	steps, legacy, err := ruleval.ReadRoutine(row["actions"], row["steps"])
	if err != nil {
		return r, false
	}
	if legacy {
		if r.Actions, err = ruleval.ParseActions(row["actions"]); err != nil {
			return r, false
		}
		return r, true
	}
	if _, err := ruleval.Check(steps, r.triggerType()); err != nil {
		return r, false
	}
	r.Steps = steps
	return r, true
}

// triggerValue is the trigger's output for an occurrence: the task, or for a
// schedule the matching open tasks (with a condition; not of archived projects
// or projects in the Trash, routines-find-scope D2) or the firing day.
func (e *Engine) triggerValue(ctx context.Context, w *world, r *rule, taskID string) ruleval.Value {
	if r.Trigger.Kind == ruleval.Schedule {
		if !r.HasCondition {
			return ruleval.Value{Type: ruleval.TDate, Date: w.today}
		}
		var ids []string
		scope := projectScope(w.projectRows)
		for id, t := range w.tasks {
			if opsync.IsNull(t["deleted_at"]) && opsync.IsNull(t["completed_at"]) && ruleval.InFindScope(false, str(t, "project_id"), scope, false) && e.matches(ctx, w, r, t) {
				ids = append(ids, id)
			}
		}
		slices.Sort(ids)
		if len(ids) > ruleval.MaxListItems {
			ids = ids[:ruleval.MaxListItems]
		}
		return tasksVal(ids)
	}
	if taskID == "" {
		return ruleval.Value{Type: ruleval.TTask}
	}
	return taskVal(taskID)
}

// findRule returns one of the user's live rules this server can read.
func (e *Engine) findRule(ctx context.Context, uid, ruleID string) (*rule, error) {
	row, err := e.Sync.Get(ctx, uid, "rule", ruleID)
	if err != nil {
		return nil, err
	}
	if row == nil || row.Deleted() {
		return nil, ErrNotFound
	}
	r, ok := readRule(row)
	if !ok {
		return nil, ErrInvalidDraft
	}
	return &r, nil
}

// asSteps is the rule read as steps: a legacy rule is its one Change tasks step.
func (r *rule) asSteps(actions json.RawMessage) {
	if r.isRoutine() {
		return
	}
	steps, _, err := ruleval.ReadRoutine(actions, nil)
	if err == nil {
		r.Steps = steps
	}
}

// RunNow runs a routine by hand (POST /api/v1/rules/{id}/run, design D7). A
// disabled routine can be run; one the server paused cannot. A routine whose
// steps read the trigger's task needs TaskID. The same RunID answers the
// first run again.
func (e *Engine) RunNow(ctx context.Context, uid string, req RunRequest) (Result, error) {
	if !e.on(ctx) {
		return Result{}, ErrOff
	}
	e.work.Lock()
	defer e.work.Unlock()
	r, err := e.findRule(ctx, uid, req.RuleID)
	if err != nil {
		return Result{}, err
	}
	if st, _, err := e.Store.State(ctx, r.ID); err != nil {
		return Result{}, err
	} else if st.PausedReason != "" {
		return Result{}, ErrPausedRule
	}
	key := "manual:" + req.RunID
	if prev, err := e.Store.runByKey(ctx, r.ID, key); err != nil {
		return Result{}, err
	} else if prev != "" {
		return e.resultOf(ctx, uid, prev)
	}
	row, _ := e.Sync.Get(ctx, uid, "rule", r.ID)
	r.asSteps(row["actions"])
	w, err := e.load(ctx, uid)
	if err != nil {
		return Result{}, err
	}
	if req.TaskID != "" {
		if t, ok := w.tasks[req.TaskID]; !ok || !opsync.IsNull(t["deleted_at"]) {
			return Result{}, ErrNotFound
		}
	} else if readsTrigger(r.Steps) && r.triggerType() == ruleval.TTask {
		return Result{}, ErrTaskRequired
	}
	if !req.Test {
		if limit := e.limits.check(uid, e.now()); limit == limitMinute || limit == limitDay {
			return Result{}, ErrRateLimited
		}
	}
	source := req.Source
	if source == "" {
		source = SourceManual
	}
	if req.Test {
		source = SourceTest
	}
	return e.runRoutine(ctx, w, r, runOpts{key: key, runID: req.RunID, source: source, depth: 2, test: req.Test,
		trigger: e.triggerValue(ctx, w, r, req.TaskID), taskID: req.TaskID, callAI: req.CallAI, device: req.Device, session: req.Session})
}

// Draft is an unsaved routine (POST /api/v1/rules/test).
type Draft struct {
	Trigger   json.RawMessage `json:"trigger"`
	Condition json.RawMessage `json:"condition"`
	Actions   json.RawMessage `json:"actions"`
	Steps     json.RawMessage `json:"steps"`
	TaskID    string          `json:"task_id"`
	// CallAI runs the AI steps for real (Test after the estimate,
	// routines-ai-step D11); the live preview never does.
	CallAI bool `json:"call_ai"`
}

// TestRule plans a saved rule's steps on a task (when its steps read one) and
// writes nothing: no run is logged (design D8).
func (e *Engine) TestRule(ctx context.Context, uid, ruleID, taskID string) (Result, error) {
	r, err := e.findRule(ctx, uid, ruleID)
	if err != nil {
		return Result{}, err
	}
	row, _ := e.Sync.Get(ctx, uid, "rule", r.ID)
	r.asSteps(row["actions"])
	return e.testRule(ctx, uid, r, taskID, false)
}

// TestDraft plans an unsaved routine and writes nothing.
func (e *Engine) TestDraft(ctx context.Context, uid string, d Draft) (Result, error) {
	row := opsync.Entity{"id": raw(draftID), "name": raw(""), "trigger": d.Trigger, "condition": orNull(d.Condition), "actions": orNull(d.Actions), "steps": orNull(d.Steps)}
	r, ok := readRule(row)
	if !ok {
		return Result{}, ErrInvalidDraft
	}
	r.asSteps(d.Actions)
	return e.testRule(ctx, uid, &r, d.TaskID, d.CallAI)
}

func (e *Engine) testRule(ctx context.Context, uid string, r *rule, taskID string, callAI bool) (Result, error) {
	w, err := e.load(ctx, uid)
	if err != nil {
		return Result{}, err
	}
	if taskID != "" {
		if _, ok := w.tasks[taskID]; !ok {
			return Result{}, ErrNotFound
		}
	} else if readsTrigger(r.Steps) && r.triggerType() == ruleval.TTask {
		return Result{}, ErrTaskRequired
	}
	return e.runRoutine(ctx, w, r, runOpts{key: "test", runID: "test", source: SourceTest, depth: 2, dry: true,
		trigger: e.triggerValue(ctx, w, r, taskID), taskID: taskID, callAI: callAI})
}

func orNull(v json.RawMessage) json.RawMessage {
	if len(strings.TrimSpace(string(v))) == 0 {
		return nullJSON
	}
	return v
}
