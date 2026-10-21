// Package rules is the automation rules engine (OpenSpec change
// automation-rules, design D4 to D8): the planner, the event observer, the
// durable queue, the worker, the scheduler, the limits and the run log. The
// rule values and the condition matcher live in internal/ruleval, a leaf
// package internal/sync also uses.
package rules

import (
	"encoding/json"
	"time"

	"github.com/pixari/opentodo/internal/ruleval"
)

// PlanContext is what planning one task needs besides the task row.
type PlanContext struct {
	// Today is the author's logical today; NowMs stamps a completion.
	Today string
	NowMs int64
	// UserID is the rule's author (assignee: me).
	UserID string
	// WeekStart is the author's first day of the week ("next-week" lands on it).
	WeekStart time.Weekday
	// LabelLive reports a live label of the author; deleted labels are skipped.
	LabelLive func(id string) bool
	// SectionProject maps a live section to its project ("" when unknown).
	SectionProject func(id string) string
	// ProjectShared reports a project shared with other accounts; a project
	// action into it is skipped (design D2).
	ProjectShared func(id string) bool
	// ProjectLive reports a live project of the author.
	ProjectLive func(id string) bool
}

// Planned is the field changes a rule's actions make on one task, in the order
// of the spec (labels removed then added, priority, due, start, deadline,
// assignee, state, project and section), with the changes the task already has
// left out. Skipped names an action that could not apply.
type Planned struct {
	Patch   map[string]json.RawMessage
	Skipped []string
	// Completing is true when the patch completes the task: the worker then
	// rolls a recurring task forward and completes its open subtasks.
	Completing bool
}

func raw(v any) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}

var nullJSON = json.RawMessage("null")

func isNull(r json.RawMessage) bool { return len(r) == 0 || string(r) == "null" }

func strOf(r json.RawMessage) string {
	var s string
	_ = json.Unmarshal(r, &s)
	return s
}

func listOf(r json.RawMessage) []string {
	var l []string
	_ = json.Unmarshal(r, &l)
	return l
}

type dueValue struct {
	Date string  `json:"date"`
	Time *string `json:"time,omitempty"`
	TZ   *string `json:"tz,omitempty"`
}

func dueOf(r json.RawMessage) *dueValue {
	if isNull(r) {
		return nil
	}
	var d dueValue
	if json.Unmarshal(r, &d) != nil || d.Date == "" {
		return nil
	}
	return &d
}

// weekStartOf is the first day of the week containing date.
func weekStartOf(date string, start time.Weekday) string {
	t, err := time.Parse("2006-01-02", date)
	if err != nil {
		return date
	}
	back := (int(t.Weekday()) - int(start) + 7) % 7
	return t.AddDate(0, 0, -back).Format("2006-01-02")
}

// dateOf resolves a date action against today: today, tomorrow, next week's
// first day (the bulk action's "Next week"), or today plus N days.
func dateOf(a *ruleval.DueAction, ctx PlanContext) string {
	switch a.Word {
	case "today":
		return ctx.Today
	case "tomorrow":
		return ruleval.AddDays(ctx.Today, 1)
	case "next-week":
		return weekStartOf(ruleval.AddDays(ctx.Today, 7), ctx.WeekStart)
	}
	return ruleval.AddDays(ctx.Today, a.InDays)
}

// Plan plans a rule's actions on one task row (a map of its stored fields).
func Plan(a ruleval.Actions, task map[string]json.RawMessage, ctx PlanContext) Planned {
	cur := map[string]json.RawMessage{}
	for k, v := range task {
		cur[k] = v
	}
	patch := map[string]json.RawMessage{}
	set := func(f string, v json.RawMessage) { patch[f] = v; cur[f] = v }
	var out Planned
	planLabels(a, cur, ctx, set)
	if a.Priority != nil {
		set("priority", raw(*a.Priority))
	}
	planDue(a, cur, ctx, set)
	if a.Start != nil {
		if *a.Start == "someday" {
			if strOf(cur["start"]) != "someday" || !isNull(cur["due"]) || string(cur["evening"]) == "true" {
				set("start", raw("someday"))
				set("due", nullJSON)
				set("evening", raw(false))
			}
		} else if !isNull(cur["start"]) {
			set("start", nullJSON)
		}
	}
	if a.Deadline != nil {
		if a.Deadline.Word == "clear" {
			set("deadline", nullJSON)
		} else {
			set("deadline", raw(dateOf(a.Deadline, ctx)))
		}
	}
	if a.Assignee != nil {
		if *a.Assignee == "me" {
			set("assignee_id", raw(ctx.UserID))
		} else {
			set("assignee_id", nullJSON)
		}
	}
	if a.State != nil {
		if *a.State == "complete" && isNull(cur["completed_at"]) {
			set("completed_at", raw(ctx.NowMs))
			out.Completing = true
		} else if *a.State == "reopen" && !isNull(cur["completed_at"]) {
			set("completed_at", nullJSON)
		}
	}
	if a.Section != nil {
		out.Skipped = append(out.Skipped, planSection(a.Section, cur, ctx, set)...)
	}
	out.Patch = withoutNoops(patch, task)
	if _, ok := out.Patch["completed_at"]; !ok {
		out.Completing = false
	}
	return out
}

func planLabels(a ruleval.Actions, cur map[string]json.RawMessage, ctx PlanContext, set func(string, json.RawMessage)) {
	if len(a.AddLabels) == 0 && len(a.RemoveLabels) == 0 {
		return
	}
	labels := listOf(cur["labels"])
	if labels == nil {
		labels = []string{}
	}
	changed := false
	for _, id := range a.RemoveLabels {
		if ctx.LabelLive != nil && !ctx.LabelLive(id) {
			continue
		}
		for i, l := range labels {
			if l == id {
				labels = append(labels[:i:i], labels[i+1:]...)
				changed = true
				break
			}
		}
	}
	for _, id := range a.AddLabels {
		if ctx.LabelLive != nil && !ctx.LabelLive(id) {
			continue
		}
		has := false
		for _, l := range labels {
			if l == id {
				has = true
			}
		}
		if !has {
			labels = append(labels, id)
			changed = true
		}
	}
	if changed {
		set("labels", raw(labels))
	}
}

func planDue(a ruleval.Actions, cur map[string]json.RawMessage, ctx PlanContext, set func(string, json.RawMessage)) {
	if a.Due == nil {
		return
	}
	if a.Due.Word == "clear" {
		if !isNull(cur["due"]) {
			set("due", nullJSON)
			if !isNull(cur["recurrence"]) {
				set("recurrence", nullJSON)
			}
		}
		return
	}
	d := dueValue{Date: dateOf(a.Due, ctx)}
	if old := dueOf(cur["due"]); old != nil && old.Time != nil {
		d.Time, d.TZ = old.Time, old.TZ
	}
	set("due", raw(d))
	if strOf(cur["start"]) == "someday" {
		set("start", nullJSON)
	}
}

func planSection(s *ruleval.SectionAction, cur map[string]json.RawMessage, ctx PlanContext, set func(string, json.RawMessage)) []string {
	if ctx.ProjectLive != nil && !ctx.ProjectLive(s.ProjectID) {
		return []string{"project gone"}
	}
	project := strOf(cur["project_id"])
	if s.ProjectID != project {
		if (ctx.ProjectShared != nil && ctx.ProjectShared(s.ProjectID)) || (project != "" && ctx.ProjectShared != nil && ctx.ProjectShared(project)) {
			return []string{"shared project"}
		}
		set("project_id", raw(s.ProjectID))
	}
	section := nullJSON
	if s.SectionID != nil && (ctx.SectionProject == nil || ctx.SectionProject(*s.SectionID) == s.ProjectID) {
		section = raw(*s.SectionID)
	}
	set("section_id", section)
	return nil
}

// sameJSON compares two values as JSON (key order and spacing ignored).
func sameJSON(a, b json.RawMessage) bool {
	if isNull(a) && isNull(b) {
		return true
	}
	var x, y any
	if json.Unmarshal(a, &x) != nil || json.Unmarshal(b, &y) != nil {
		return string(a) == string(b)
	}
	ax, _ := json.Marshal(x)
	by, _ := json.Marshal(y)
	return string(ax) == string(by)
}

// withoutNoops drops the fields the task already has: a change the task
// already has is not written (spec "Actions").
func withoutNoops(patch, task map[string]json.RawMessage) map[string]json.RawMessage {
	out := map[string]json.RawMessage{}
	for f, v := range patch {
		if !sameJSON(v, task[f]) {
			out[f] = v
		}
	}
	return out
}
