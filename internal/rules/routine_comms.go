package rules

import (
	"context"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	"github.com/OpenTodoApp/opentodo/internal/notify"
	"github.com/OpenTodoApp/opentodo/internal/ruleval"
	"github.com/OpenTodoApp/opentodo/internal/textutil"
	"github.com/OpenTodoApp/opentodo/internal/timetrack"
)

// Steps that read tracked time and steps that reach the user (design D4,
// "Time and focus" and "Communication"). Side effects are queued after the
// run's batches committed and are never undone.

func (st *runState) trackedTime(s *ruleval.Step, in map[string]ruleval.Value) (ruleval.Value, string, error) {
	p, err := ruleval.ParsePeriod(s.In["period"].Lit)
	if err != nil {
		return none(), "", failf(ErrCodeInvalid, "%s", err)
	}
	from, to := p.Range(st.w.today, st.w.weekStart)
	project := ""
	if v, ok := st.entityIn(s, in, "project"); ok {
		project = v.ID
	}
	rows, err := st.e.Sync.List(st.ctx, st.w.uid, "time_entry", false)
	if err != nil {
		return none(), "", err
	}
	zone := time.FixedZone("", st.w.offset*60)
	start := ruleval.DayStartMinutes(st.w.dayStart)
	minutes := 0
	for _, r := range rows {
		e := timetrack.FromRow(r)
		if !e.Live() || e.UserID != st.w.uid {
			continue
		}
		if day := timetrack.DayOf(e.StartedAt, zone, start); day < from || day > to {
			continue
		}
		if project != "" && !st.w.inProject(strOf(st.tasks[e.TaskID]["project_id"]), project) {
			continue
		}
		minutes += timetrack.MinutesOf(e, st.nowMs)
	}
	return ruleval.Value{Type: ruleval.TNumber, Number: float64(minutes)}, "", nil
}

// inProject reports whether a project is pid or one of its sub-projects.
func (w *world) inProject(id, pid string) bool {
	for i := 0; id != "" && i < 64; i++ {
		if id == pid {
			return true
		}
		id = w.parent[id]
	}
	return false
}

func (st *runState) ruleName() string { return e2ee.Display(st.r.Name) }

// notifyStep queues a Notify me: always in app; the user's delivery channels
// add to it while the owner switch is on (internal/channels decides).
func (st *runState) notifyStep(s *ruleval.Step, in map[string]ruleval.Value) (ruleval.Value, string, error) {
	text, _ := st.textIn(s, in, "text")
	text = textutil.Truncate(text, 4*ruleval.MaxNotifyText)
	if r := []rune(text); len(r) > ruleval.MaxNotifyText {
		text = string(r[:ruleval.MaxNotifyText])
	}
	task := ""
	if v, ok := st.entityIn(s, in, "task"); ok {
		task = v.ID
	}
	n := notify.RoutineNotice{UserID: st.w.uid, RuleID: st.r.ID, RuleName: st.ruleName(), RunID: st.runID, StepID: s.ID, Text: text, TaskID: task, At: st.nowMs}
	st.sides = append(st.sides, sideEffect{kind: "notify", run: func(ctx context.Context) error {
		if st.e.Routine != nil {
			st.e.Routine.RoutineNotice(ctx, n)
		}
		return nil
	}})
	return none(), "", nil
}

// ruleFiredNotice is a Change tasks step's notify action: the rule_fired notice.
func (st *runState) ruleFiredNotice(taskID string) sideEffect {
	ev := notify.RuleEvent{UserID: st.w.uid, RuleID: st.r.ID, RuleName: st.ruleName(), TaskID: taskID,
		TaskTitle: e2ee.Display(str(st.tasks[taskID], "title")), At: st.nowMs}
	return sideEffect{kind: "notify", run: func(ctx context.Context) error {
		if st.e.Notify != nil {
			st.e.Notify.RuleFired(ctx, ev)
		}
		return nil
	}}
}
