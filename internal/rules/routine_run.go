package rules

import (
	"context"
	"encoding/json"
	"errors"
	"slices"
	"sort"
	"strconv"

	"github.com/OpenTodoApp/opentodo/internal/agenttools"
	"github.com/OpenTodoApp/opentodo/internal/ruleval"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// runOpts are the parts of a routine run that differ by how it started.
type runOpts struct {
	key     string
	runID   string
	source  string
	depth   int
	test    bool
	dry     bool // POST …/test: nothing is logged
	trigger ruleval.Value
	taskID  string
	// callAI lets a test or dry run call the model (routines-ai-step D11).
	callAI bool
}

// runRoutine runs one routine occurrence: claimed under its key (so a replay
// never runs it twice), refused past the chain depth or a rate, skipped for an
// encrypted account when it has a content step, then planned and, when the
// whole plan succeeded and it is not a test, written (design D5).
func (e *Engine) runRoutine(ctx context.Context, w *world, r *rule, o runOpts) (Result, error) {
	var claimID int64
	if !o.dry {
		id, fresh, err := e.Store.Claim(ctx, w.uid, Run{RuleID: r.ID, OccurrenceKey: o.key, TaskID: o.taskID, Depth: o.depth, RunID: o.runID, Source: o.source, Test: o.test})
		if err != nil {
			return Result{}, err
		}
		runID, err := e.Store.runByKey(ctx, r.ID, o.key)
		if err != nil {
			return Result{}, err
		}
		if !fresh {
			return e.resultOf(ctx, w.uid, runID)
		}
		claimID, o.runID = id, runID
	}
	st := e.newRun(ctx, w, r, o.key, o.runID, o.test || o.dry)
	st.trigger = o.trigger
	st.callAI = st.callAI || o.callAI
	proposed := -1
	finish := func(f routineFinish) (Result, error) {
		f.DurationMs = e.now().Sub(st.start).Milliseconds()
		f.Tokens = st.aiTokens
		f.Steps = make([]StepRecord, len(st.records))
		for i := range st.records {
			f.Steps[i] = st.records[i].StepRecord
		}
		res := Result{Steps: st.records, Writes: f.Writes, Test: st.test}
		if res.Steps == nil {
			res.Steps = []StepPreview{}
		}
		if o.dry {
			res.Run = Run{RuleID: r.ID, Outcome: f.Outcome, Reason: f.Reason, Test: true, Source: SourceTest, RunAs: w.uid, StepsCount: len(f.Steps), FailedStep: f.FailedStep, Changes: json.RawMessage("[]")}
			return res, nil
		}
		if err := e.Store.finishRoutine(ctx, claimID, o.runID, f); err != nil {
			return Result{}, err
		}
		run, err := e.Store.RunByID(ctx, w.uid, o.runID)
		if err == nil {
			e.alertFailure(ctx, w.uid, r, run)
			if proposed >= 0 {
				e.alertProposal(ctx, w.uid, r, run, proposed)
				if ps, perr := e.Store.proposalsByRun(ctx, []string{run.RunID}); perr == nil {
					if p, ok := ps[run.RunID]; ok {
						run.Proposal = &p
					}
				}
			}
			e.afterAIRun(ctx, w.uid, r, run)
		}
		res.Run = run
		return res, err
	}
	if o.depth > MaxChainDepth {
		return finish(routineFinish{Outcome: OutcomeStopped, Reason: "too many rules in a row", FailedStep: -1})
	}
	now := e.now()
	if !st.test {
		if limit := e.limits.check(w.uid, now); limit != "" {
			if limit == limitMinute {
				e.refused(ctx, w.uid, r, now)
			}
			return finish(routineFinish{Outcome: OutcomeSkipped, Reason: limit, FailedStep: -1})
		}
	}
	if w.encrypted {
		types, _ := ruleval.Check(r.Steps, r.triggerType())
		if ruleval.ContentStep(r.Steps, r.triggerType(), types) != "" {
			return finish(routineFinish{Outcome: OutcomeSkipped, Reason: ErrCodeEncrypted, FailedStep: -1})
		}
	}
	failed, err := st.plan()
	var f *stepFail
	switch {
	case errors.As(err, &f):
		return finish(routineFinish{Outcome: OutcomeFailed, Reason: f.msg, FailedStep: failed})
	case err != nil && !errors.Is(err, errEnded):
		return Result{}, err
	}
	outcome := OutcomeApplied
	if errors.Is(err, errEnded) {
		outcome = OutcomeEnded
	}
	planned := st.writesPlanned()
	if st.test {
		for i := range st.records {
			st.records[i].Changes = nil
		}
		st.attachChanges()
		return finish(routineFinish{Outcome: outcome, Writes: planned, FailedStep: -1})
	}
	if planned == 0 {
		if outcome == OutcomeApplied {
			outcome = OutcomeAlreadyMatched
		}
		return finish(routineFinish{Outcome: outcome, FailedStep: -1})
	}
	auto := false
	if ruleval.HasAI(r.Steps) {
		// A routine with AI steps writes only in effective auto mode, within
		// its limits; otherwise (and on a fallback) the run is a proposal
		// (routines-ai-step D2, D4, D5).
		mode, err := e.AIMode(ctx, w.uid, r.ID)
		if err != nil {
			return Result{}, err
		}
		auto = mode.Auto
		if auto {
			if reason := st.autoCheck(); reason != "" {
				if err := e.Store.setFallback(ctx, w.uid, r.ID, reason); err != nil {
					return Result{}, err
				}
				auto = false
			}
		}
		if !auto {
			n, err := st.propose()
			if err != nil {
				return Result{}, err
			}
			proposed = n
			return finish(routineFinish{Outcome: OutcomeProposal, FailedStep: -1})
		}
	}
	wrote, n, refused, err := st.commit(o.depth)
	if err != nil {
		return finish(routineFinish{Outcome: OutcomeFailed, Reason: err.Error(), FailedStep: -1, Written: wrote, Writes: n})
	}
	e.limits.take(w.uid, now)
	reason := ""
	if refused > 0 {
		outcome, reason = OutcomePartial, refusedReason(refused)
	}
	return finish(routineFinish{Outcome: outcome, Reason: reason, Writes: n, FailedStep: -1, Written: wrote, AIAuto: auto})
}

func refusedReason(n int) string {
	if n == 1 {
		return "1 item was refused when writing"
	}
	return strconv.Itoa(n) + " items were refused when writing"
}

// attachChanges hands each planned change to the test answer (the last step
// that touched an entity carries it).
func (st *runState) attachChanges() {
	if len(st.records) == 0 {
		return
	}
	last := &st.records[len(st.records)-1]
	last.Changes = append(last.Changes, st.overlay...)
}

// resultOf answers a repeated request with the run it already made.
func (e *Engine) resultOf(ctx context.Context, uid, runID string) (Result, error) {
	run, err := e.Store.RunByID(ctx, uid, runID)
	if err != nil {
		return Result{}, err
	}
	res := Result{Run: run, Writes: run.Writes, Test: run.Test, Steps: []StepPreview{}}
	for _, s := range run.Steps {
		res.Steps = append(res.Steps, StepPreview{StepRecord: s})
	}
	return res, nil
}

// merged is one entity's planned changes, merged in plan order.
type merged struct {
	entity, id string
	create     bool
	patch      map[string]json.RawMessage
}

func mergeChanges(cs agenttools.ChangeSet) []merged {
	idx := map[string]int{}
	var out []merged
	for _, c := range cs {
		k := c.Entity + "\x00" + c.EntityID
		i, ok := idx[k]
		if !ok {
			i = len(out)
			idx[k] = i
			out = append(out, merged{entity: c.Entity, id: c.EntityID, patch: map[string]json.RawMessage{}})
		}
		out[i].create = out[i].create || c.Create
		for f, v := range c.Patch {
			out[i].patch[f] = v
		}
	}
	return out
}

// commit writes the plan as one batch per entity with device rule:<rule-id>
// and the run-as user as author, wakes devices, then runs the side effects.
// A batch refused by ApplyStrict is counted; the others are written.
func (st *runState) commit(depth int) ([]written, int, int, error) {
	e, r := st.e, st.r
	device := Device(r.ID)
	ts := e.Sync.ServerTSAt(st.nowMs)
	var wrote []written
	writes, refused := 0, 0
	for _, m := range mergeChanges(st.overlay) {
		var ops []opsync.Op
		add := func(entity, id string, body map[string]json.RawMessage) {
			keys := make([]string, 0, len(body))
			for f := range body {
				keys = append(keys, f)
			}
			sort.Strings(keys)
			for _, f := range keys {
				ops = append(ops, opsync.Op{ID: opID(r.ID, st.key, id, f), Entity: entity, EntityID: id, Field: f, Value: body[f], TS: ts, Device: device})
			}
		}
		extra := []written{}
		if m.entity == "task" && st.completing[m.id] {
			rec, err := st.completion(m, add)
			if err != nil {
				return wrote, writes, refused, err
			}
			extra = append(extra, rec...)
		}
		add(m.entity, m.id, m.patch)
		if m.entity == "task" && !m.create && e.Reminder != nil {
			rem, err := e.Reminder(st.ctx, st.w.uid, m.id, m.patch, ts, device)
			if err != nil {
				return wrote, writes, refused, err
			}
			ops = append(ops, rem...)
		}
		res, err := e.Sync.ApplyStrict(withDepth(st.ctx, depth), st.w.uid, ops)
		if err != nil {
			var rej *opsync.RejectedError
			if errors.As(err, &rej) && opsync.IsLimitReason(rej.Reason) {
				// A hosted tenant over its limits (design D13): stop here.
				return wrote, writes, refused, errors.New(ErrCodeTenantLimit)
			}
			if errors.As(err, &rej) {
				refused++
				continue
			}
			if errors.Is(err, opsync.ErrWriteLimit) {
				return wrote, writes, refused, errors.New(ErrCodeTenantLimit)
			}
			return wrote, writes, refused, err
		}
		if res.Applied > 0 {
			e.Sync.NotifyApplied(res, device)
		}
		writes++
		wrote = append(wrote, written{Entity: m.entity, ID: m.id, Fields: fieldsOf(m.patch), Created: m.create})
		wrote = append(wrote, extra...)
	}
	for _, s := range st.sides {
		if err := s.run(context.WithoutCancel(st.ctx)); err != nil {
			e.Log.Warn("routines: side effect", "rule", r.ID, "kind", s.kind, "err", err)
		}
		writes++
	}
	return wrote, writes, refused, nil
}

func fieldsOf(patch map[string]json.RawMessage) []string {
	out := make([]string, 0, len(patch))
	for f := range patch {
		out = append(out, f)
	}
	slices.Sort(out)
	return out
}

// completion adds a planned completion's companions: a recurring task's
// occurrence record (the series moves on), or the open subtasks.
func (st *runState) completion(m merged, add func(string, string, map[string]json.RawMessage)) ([]written, error) {
	base := st.w.tasks[m.id]
	recID, record, ok, err := st.e.Sync.RecurringCompletion(st.ctx, st.w.uid, m.id, m.patch, base, st.w.today)
	if err != nil {
		return nil, err
	}
	if ok {
		add("task", recID, record)
		return []written{{Entity: "task", ID: recID, Fields: fieldsOf(record), Created: true}}, nil
	}
	var out []written
	for _, sub := range st.w.openDescendants(m.id) {
		done := map[string]json.RawMessage{"completed_at": m.patch["completed_at"]}
		add("task", sub, done)
		out = append(out, written{Entity: "task", ID: sub, Fields: []string{"completed_at"}})
	}
	return out, nil
}
