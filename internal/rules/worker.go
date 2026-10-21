package rules

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/e2ee"
	"github.com/pixari/opentodo/internal/ids"
	"github.com/pixari/opentodo/internal/notify"
	"github.com/pixari/opentodo/internal/ruleval"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// Worker pacing.
const (
	drainEvery = 5 * time.Second
	takeBatch  = 200
	pruneEvery = time.Hour
)

// Run drains the queue when woken or every few seconds, runs the scheduler
// every minute and prunes the run log hourly, until ctx ends. It runs on the
// jobs leader only.
func (e *Engine) Run(ctx context.Context) {
	drain := time.NewTicker(drainEvery)
	defer drain.Stop()
	tick := time.NewTicker(TickInterval)
	defer tick.Stop()
	var pruned time.Time
	for {
		select {
		case <-ctx.Done():
			return
		case <-e.wake:
		case <-drain.C:
		case <-tick.C:
			e.Tick(ctx)
		}
		e.Drain(ctx)
		if time.Since(pruned) >= pruneEvery {
			pruned = time.Now()
			if _, err := e.Store.Prune(ctx); err != nil {
				e.Log.Error("rules: prune runs", "err", err)
			}
		}
	}
}

// Drain runs every queued event, oldest first.
func (e *Engine) Drain(ctx context.Context) {
	e.work.Lock()
	defer e.work.Unlock()
	for ctx.Err() == nil {
		events, err := e.Store.Take(ctx, takeBatch)
		if err != nil {
			e.Log.Error("rules: take events", "err", err)
			return
		}
		if len(events) == 0 {
			return
		}
		for _, ev := range events {
			if err := e.process(ctx, ev); err != nil {
				e.Log.Error("rules: run event", "kind", ev.Kind, "err", err)
			}
			if err := e.Store.Done(ctx, ev.ID); err != nil {
				e.Log.Error("rules: mark event done", "err", err)
				return
			}
		}
	}
}

// process runs one event against the rules it triggers.
func (e *Engine) process(ctx context.Context, ev Event) error {
	if !e.on(ctx) {
		return nil
	}
	if paused, err := e.Store.UserPaused(ctx, ev.UserID); err != nil || paused {
		return err
	}
	list, err := e.loadRules(ctx, ev.UserID)
	if err != nil {
		return err
	}
	var w *world
	for i := range list {
		r := &list[i]
		if !r.Enabled || !triggered(r, ev) {
			continue
		}
		if st, _, err := e.Store.State(ctx, r.ID); err != nil || st.PausedReason != "" {
			continue
		}
		if w == nil {
			if w, err = e.load(ctx, ev.UserID); err != nil {
				return err
			}
		}
		if ev.Kind == ruleval.Schedule {
			e.sweep(ctx, w, r, ev)
			continue
		}
		t, ok := w.tasks[ev.TaskID]
		if !ok || !isNull(t["deleted_at"]) {
			continue
		}
		if ev.Kind != ruleval.TaskCompleted && !isNull(t["completed_at"]) {
			continue
		}
		if ev.Kind == ruleval.TaskMoved && !movedInto(r.Trigger, t) {
			continue
		}
		if !e.matches(ctx, w, r, t) {
			continue
		}
		key := ev.Occurrence
		if key == "" {
			key = "evt:" + strconv.FormatInt(ev.ID, 10) + ":" + ev.TaskID
		}
		if err := e.run(ctx, w, r, []map[string]json.RawMessage{t}, key, ev.Depth+1, 0); err != nil {
			e.Log.Error("rules: run", "rule", r.ID, "err", err)
		}
	}
	return nil
}

// triggered reports whether an event is one of the rule's trigger: the kind,
// the named label, and never the rule's own batch.
func triggered(r *rule, ev Event) bool {
	if ev.RuleID != "" {
		return ev.RuleID == r.ID
	}
	if r.Trigger.Kind != ev.Kind || ev.Origin == Device(r.ID) {
		return false
	}
	switch ev.Kind {
	case ruleval.LabelAdded, ruleval.LabelRemoved:
		return r.Trigger.LabelID == ev.LabelID
	}
	return true
}

// movedInto reports whether a task now sits where a task.moved trigger names.
func movedInto(tr ruleval.Trigger, t map[string]json.RawMessage) bool {
	if strOf(t["project_id"]) != tr.ProjectID {
		return false
	}
	return tr.SectionID == nil || strOf(t["section_id"]) == *tr.SectionID
}

// sweep runs a scheduled rule on every open, live task matching its
// condition: one run in the log, one batch per task, at most PerRun tasks;
// more is recorded as a partial run and left for the next firing (spec "Time
// triggers").
func (e *Engine) sweep(ctx context.Context, w *world, r *rule, ev Event) {
	var due []map[string]json.RawMessage
	for _, t := range w.tasks {
		if isNull(t["deleted_at"]) && isNull(t["completed_at"]) && e.matches(ctx, w, r, t) {
			due = append(due, t)
		}
	}
	slices.SortFunc(due, func(a, b map[string]json.RawMessage) int { return strings.Compare(strOf(a["id"]), strOf(b["id"])) })
	left := 0
	if len(due) > PerRun {
		left = len(due) - PerRun
		due = due[:PerRun]
	}
	if err := e.run(ctx, w, r, due, ev.Occurrence, 2, left); err != nil {
		e.Log.Error("rules: sweep", "rule", r.ID, "err", err)
	}
}

// change is one task's field changes in a run's log.
type change struct {
	TaskID string                     `json:"task_id"`
	Fields map[string]json.RawMessage `json:"fields"`
}

// run is one run of a rule under its key over tasks (one for an event, the
// matching tasks for a schedule): claimed first, refused past the chain depth
// or a limit, then one batch per task, then the outcome.
func (e *Engine) run(ctx context.Context, w *world, r *rule, tasks []map[string]json.RawMessage, key string, depth, left int) error {
	taskID := ""
	if len(tasks) == 1 && !strings.HasPrefix(key, "sched:") {
		taskID = strOf(tasks[0]["id"])
	}
	id, fresh, err := e.Store.Claim(ctx, w.uid, Run{RuleID: r.ID, OccurrenceKey: key, TaskID: taskID, Depth: depth})
	if err != nil || !fresh {
		return err
	}
	finish := func(outcome, reason string, changes any) error {
		return e.Store.Finish(ctx, id, outcome, reason, changes)
	}
	if depth > MaxChainDepth {
		return finish(OutcomeStopped, "too many rules in a row", nil)
	}
	now := e.now()
	if limit := e.limits.check(w.uid, now); limit != "" {
		if limit == limitMinute {
			e.refused(ctx, w.uid, r, now)
		}
		return finish(OutcomeSkipped, limit, nil)
	}
	var changes []change
	var skipped []string
	failed := ""
	for _, t := range tasks {
		ch, sk, err := e.applyTask(ctx, w, r, t, key, depth)
		if err != nil {
			failed = err.Error()
			break
		}
		changes, skipped = append(changes, ch...), append(skipped, sk...)
	}
	reason := ""
	if len(skipped) > 0 {
		reason = skipped[0]
	}
	switch {
	case failed != "" && len(changes) == 0:
		return finish(OutcomeFailed, failed, nil)
	case len(changes) == 0 && left == 0:
		if reason != "" {
			return finish(OutcomeSkipped, reason, nil)
		}
		return finish(OutcomeAlreadyMatched, "", nil)
	}
	e.limits.take(w.uid, now)
	if left > 0 {
		return finish(OutcomePartial, fmt.Sprintf("%d tasks left for the next firing", left), changes)
	}
	return finish(OutcomeApplied, reason, changes)
}

func sideActions(r *rule) bool {
	return r.Actions.Comment != nil || r.Actions.Notify || r.Actions.WebhookID != ""
}

// applyTask writes a rule's actions on one task as one batch and sends its
// notification and webhook. It returns the field changes (none when the task
// already matched) and the actions it had to skip.
func (e *Engine) applyTask(ctx context.Context, w *world, r *rule, t map[string]json.RawMessage, key string, depth int) ([]change, []string, error) {
	now := e.now()
	planned := Plan(r.Actions, t, w.planContext(now.UnixMilli()))
	if len(planned.Patch) == 0 && !sideActions(r) {
		return nil, planned.Skipped, nil
	}
	ops, changes, skipped, err := e.buildOps(ctx, w, r, t, planned, key)
	if err != nil {
		return nil, nil, err
	}
	if len(ops) > 0 {
		res, err := e.Sync.ApplyStrict(withDepth(ctx, depth), w.uid, ops)
		if err != nil {
			var rej *opsync.RejectedError
			if errors.As(err, &rej) {
				return nil, nil, errors.New(rej.Reason)
			}
			return nil, nil, errors.New("write failed")
		}
		if res.Applied > 0 {
			e.Sync.NotifyApplied(res, Device(r.ID))
		}
	}
	fired := map[string]opsync.FieldChange{}
	for f, v := range planned.Patch {
		from := t[f]
		if from == nil {
			from = nullJSON
		}
		fired[f] = opsync.FieldChange{From: from, To: v}
		t[f] = v
	}
	skipped = append(skipped, e.after(ctx, w, r, strOf(t["id"]), fired, now)...)
	if len(changes) == 0 {
		changes = []change{{TaskID: strOf(t["id"]), Fields: map[string]json.RawMessage{}}}
	}
	return changes, skipped, nil
}

// refused counts a per-minute refusal and pauses a runaway rule once.
func (e *Engine) refused(ctx context.Context, uid string, r *rule, now time.Time) {
	st, _, err := e.Store.State(ctx, r.ID)
	if err != nil {
		return
	}
	st.Refusals = refusalsWithin(st.Refusals, now)
	paused := false
	if len(st.Refusals) >= RunawayRefusals && st.PausedReason == "" {
		st.PausedReason, paused = PausedRunaway, true
	}
	if err := e.Store.SaveState(ctx, r.ID, uid, st); err != nil {
		e.Log.Error("rules: save state", "err", err)
		return
	}
	if paused && e.Notify != nil {
		e.Notify.RulePaused(ctx, notify.RuleEvent{UserID: uid, RuleID: r.ID, RuleName: e2ee.Display(r.Name), At: now.UnixMilli()})
	}
}

// after sends the notification and the webhook of an applied run.
func (e *Engine) after(ctx context.Context, w *world, r *rule, taskID string, changes map[string]opsync.FieldChange, now time.Time) []string {
	if r.Actions.Notify && e.Notify != nil {
		e.Notify.RuleFired(ctx, notify.RuleEvent{UserID: w.uid, RuleID: r.ID, RuleName: e2ee.Display(r.Name), TaskID: taskID,
			TaskTitle: e2ee.Display(strOf(w.tasks[taskID]["title"])), At: now.UnixMilli()})
	}
	if r.Actions.WebhookID != "" && e.Webhook != nil {
		f := Fired{RuleID: r.ID, RuleName: r.Name, TaskID: taskID, Changes: changes, At: now.UnixMilli()}
		if err := e.Webhook(ctx, w.uid, r.Actions.WebhookID, f); errors.Is(err, ErrWebhookMissing) {
			return []string{"skipped: webhook missing"}
		} else if err != nil {
			e.Log.Warn("rules: queue webhook", "rule", r.ID, "err", err)
		}
	}
	return nil
}

// opID derives an op id from the rule, the run key, the entity and the field,
// so a retried run writes duplicates, not new versions.
func opID(ruleID, key, entityID, field string) string {
	return ids.NameID("rule-op", ruleID+"\x00"+key+"\x00"+entityID+"\x00"+field)
}

// buildOps turns a plan into one batch: the task's fields (a recurring
// completion records the occurrence and moves the series; a plain one
// completes the open subtasks), the reminders that follow a moved date, and
// the comment.
func (e *Engine) buildOps(ctx context.Context, w *world, r *rule, t map[string]json.RawMessage, p Planned, key string) ([]opsync.Op, []change, []string, error) {
	device := Device(r.ID)
	ts := e.Sync.ServerTSAt(e.now().UnixMilli())
	taskID := strOf(t["id"])
	skipped := p.Skipped
	var ops []opsync.Op
	add := func(entity, id string, body map[string]json.RawMessage) {
		for f, v := range body {
			ops = append(ops, opsync.Op{ID: opID(r.ID, key, id, f), Entity: entity, EntityID: id, Field: f, Value: v, TS: ts, Device: device})
		}
	}
	body := map[string]json.RawMessage{}
	for f, v := range p.Patch {
		body[f] = v
	}
	var changes []change
	if p.Completing {
		recID, record, ok, err := e.Sync.RecurringCompletion(ctx, w.uid, taskID, body, t, w.today)
		if err != nil {
			return nil, nil, nil, err
		}
		if ok {
			add("task", recID, record)
			changes = append(changes, change{TaskID: recID, Fields: record})
		} else {
			for _, sub := range w.openDescendants(taskID) {
				done := map[string]json.RawMessage{"completed_at": body["completed_at"]}
				add("task", sub, done)
				changes = append(changes, change{TaskID: sub, Fields: done})
			}
		}
	}
	add("task", taskID, body)
	if len(body) > 0 {
		changes = append([]change{{TaskID: taskID, Fields: body}}, changes...)
	}
	if e.Reminder != nil && len(body) > 0 {
		rem, err := e.Reminder(ctx, w.uid, taskID, body, ts, device)
		if err != nil {
			return nil, nil, nil, err
		}
		ops = append(ops, rem...)
	}
	if r.Actions.Comment != nil {
		if w.encrypted {
			skipped = append(skipped, "comment: encrypted account")
		} else {
			cid := ids.NameID("rule-comment", r.ID+"\x00"+key+"\x00"+taskID)
			add("comment", cid, map[string]json.RawMessage{"task_id": raw(taskID), "body": raw(*r.Actions.Comment), "author_id": raw(w.uid),
				"mentions": raw([]string{}), "created_at": raw(e.now().UnixMilli()), "deleted_at": nullJSON, "parent_id": nullJSON, "edited_at": nullJSON})
		}
	}
	return ops, changes, skipped, nil
}

// openDescendants lists the open, live subtasks under a task, depth first.
func (w *world) openDescendants(id string) []string {
	children := map[string][]string{}
	for tid, t := range w.tasks {
		if p := strOf(t["parent_id"]); p != "" {
			children[p] = append(children[p], tid)
		}
	}
	var out []string
	seen := map[string]bool{id: true}
	var walk func(string)
	walk = func(p string) {
		for _, c := range children[p] {
			if seen[c] {
				continue
			}
			seen[c] = true
			if w.open(c) {
				out = append(out, c)
			}
			walk(c)
		}
	}
	walk(id)
	return out
}
