package rules

import (
	"github.com/OpenTodoApp/opentodo/internal/habits"
	"github.com/OpenTodoApp/opentodo/internal/ruleval"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// The Habits steps (OpenSpec change habits-assistant, design D6): Find habits
// reads the numbers every device computes (internal/habits) over the run's
// rows; Log a habit plans log_habit through the registry, as MCP does.

func (st *runState) findHabits(s *ruleval.Step) (ruleval.Value, string, error) {
	tasks := make([]opsync.Entity, 0, len(st.tasks))
	for _, t := range st.tasks {
		tasks = append(tasks, t)
	}
	only, _ := lit[string](s, "only")
	streak, _ := lit[float64](s, "streak")
	var ids []string
	opts := habits.Options{}
	if tallies, err := st.e.Sync.List(st.ctx, st.w.uid, "habit_tally", false); err == nil {
		opts.Tallies = tallies
	}
	if prefs, err := st.e.Sync.Get(st.ctx, st.w.uid, "user_prefs", "me"); err == nil && prefs != nil {
		ws := habits.WeekStart(prefs)
		opts.WeekStart = &ws
	}
	for _, h := range habits.List(tasks, st.w.today, false, nil, nil, opts) {
		switch {
		case only == "at_risk" && !h.AtRisk, only == "back_on_track" && !h.BackOnTrack, streak > 0 && float64(h.Streak) < streak:
			continue
		}
		ids = append(ids, h.ID)
	}
	return tasksVal(ids), "", nil
}

func (st *runState) logHabit(s *ruleval.Step, in map[string]ruleval.Value) (ruleval.Value, string, error) {
	habit, _ := st.entityIn(s, in, "habit")
	date := st.w.today
	if v, ok := in["date"]; ok && v.Date != "" {
		date = v.Date
	} else if a, ok := s.In["date"]; ok {
		if d, ok := ruleval.DateLiteral(a.Lit); ok {
			date = d.Resolve(st.w.today)
		}
	}
	state, _ := lit[string](s, "state")
	args := map[string]any{"id": habit.ID, "date": date, "state": state}
	if note, _ := st.textIn(s, in, "note"); note != "" {
		args["note"] = note
	}
	p, err := st.tool("log_habit", args)
	if err == nil && len(p.Changes) == 0 {
		return none(), StepSkipped, nil
	}
	return none(), "", err
}
