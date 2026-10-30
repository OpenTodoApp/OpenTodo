package cli

import (
	"context"
	"encoding/json"

	"github.com/OpenTodoApp/opentodo/internal/closedlist"
)

// Today's closed list in `ot today` (OpenSpec change today-closed-list, design
// D7): the same fill rule as the web app (internal/closedlist, shared vectors)
// over the account's rows, its Today limit and today's focus and taken slots
// (GET /api/v1/me closed_list). Nothing is written.

// todaySplit is Today's fill; nil while the limit is off (the JSON stays the API's shape).
type todaySplit struct {
	waiting map[string]bool
	// rank is each counted task's place in fill order.
	rank map[string]int
}

// todayClosedList fills Today's slots from its listed tasks; nil when the limit is off.
func (a *App) todayClosedList(ctx context.Context, c *client, all []task, projects []project, tasks []task, today string) (*todaySplit, error) {
	var me struct {
		ClosedList struct {
			Limit     int    `json:"limit"`
			FocusDate string `json:"focus_date"`
			Focus     string `json:"focus"`
			SlotsDate string `json:"slots_date"`
			Slots     string `json:"slots"`
		} `json:"closed_list"`
	}
	if err := c.getJSON(ctx, "/me", &me); err != nil {
		return nil, err
	}
	cl := me.ClosedList
	if closedlist.ReadLimit(cl.Limit) == 0 {
		return nil, nil
	}
	var sections struct {
		Sections []json.RawMessage `json:"sections"`
	}
	if err := c.getJSON(ctx, "/sections", &sections); err != nil {
		return nil, err
	}
	available := availableRule(all, projects, sections.Sections, today)
	in := closedlist.Input{Limit: cl.Limit, Today: today,
		Review: closedlist.Review{FocusDate: cl.FocusDate, Focus: cl.Focus, SlotsDate: cl.SlotsDate, Slots: cl.Slots}}
	for _, t := range tasks {
		var row struct {
			Habit    bool    `json:"habit"`
			Deadline *string `json:"deadline"`
		}
		_ = json.Unmarshal(t.Raw, &row)
		due := ""
		if t.Due != nil {
			due = t.Due.Date
		} else if row.Deadline != nil {
			due = *row.Deadline
		}
		in.Tasks = append(in.Tasks, closedlist.Task{ID: t.ID, CreatedAt: int64(t.CreatedAt), Earlier: due != "" && due < today, Due: due,
			Habit: row.Habit, Blocked: !available(t)})
	}
	f := closedlist.Compute(in, nil)
	s := &todaySplit{waiting: f.WaitingSet(), rank: map[string]int{}}
	for i, id := range append(append([]string{}, f.Slots...), f.Waiting...) {
		s.rank[id] = i
	}
	return s, nil
}

// ordered keeps Today's order for the tasks in the slots and the others, then
// lists the waiting tasks in fill order (the first comes in next).
func (s *todaySplit) ordered(tasks []task) []task {
	if s == nil || len(s.waiting) == 0 {
		return tasks
	}
	slots, waiting := s.parts(tasks)
	sortByRank(waiting, s.rank)
	return append(slots, waiting...)
}

// parts splits tasks into those listed in Today and those waiting for a slot.
func (s *todaySplit) parts(tasks []task) (listed, waiting []task) {
	for _, t := range tasks {
		if s != nil && s.waiting[t.ID] {
			waiting = append(waiting, t)
		} else {
			listed = append(listed, t)
		}
	}
	return listed, waiting
}

// heading reports whether the table prints a "Waiting for a slot" section.
func (s *todaySplit) heading(all bool) bool { return s != nil && !all && len(s.waiting) > 0 }

// raw is the task's JSON with waiting_for_slot set (ot today --json).
func (s *todaySplit) raw(t task) json.RawMessage {
	if s == nil {
		return t.Raw
	}
	var m map[string]json.RawMessage
	if json.Unmarshal(t.Raw, &m) != nil {
		return t.Raw
	}
	m["waiting_for_slot"] = json.RawMessage("false")
	if s.waiting[t.ID] {
		m["waiting_for_slot"] = json.RawMessage("true")
	}
	out, err := json.Marshal(m)
	if err != nil {
		return t.Raw
	}
	return out
}

func sortByRank(list []task, rank map[string]int) {
	for i := 1; i < len(list); i++ {
		for j := i; j > 0 && rank[list[j].ID] < rank[list[j-1].ID]; j-- {
			list[j], list[j-1] = list[j-1], list[j]
		}
	}
}
