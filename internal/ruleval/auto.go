package ruleval

// Apply without asking (OpenSpec change routines-ai-step, design D4): which
// steps a routine with an AI step may hold while it applies the AI's results
// itself. Only additive changes and setting a task's fields: create tasks,
// comments and labels; priority, due, start, deadline, energy, labels added and
// a section of the task's own project (checked again on every run); Notify me,
// Email me and Send a webhook. web/src/lib/rules/steps.ts has the same check;
// both run the "auto" vectors of steps.vectors.json.

// What a blocked step does, for the editor's reason ("Turn this off to complete tasks").
const (
	AutoComplete     = "complete_tasks"
	AutoTrash        = "trash_tasks"
	AutoRemoveLabels = "remove_labels"
	AutoAssign       = "assign"
	AutoProjects     = "projects"
	AutoNotes        = "notes"
	AutoFocus        = "focus"
	AutoTimers       = "timers"
	AutoEmailMembers = "email_members"
)

// MaxAutoItems is the most items a run writes without asking (D4).
const MaxAutoItems = 20

// autoKinds are the writing kinds auto mode refuses, with what they do.
var autoKinds = map[string]string{
	"create_project": AutoProjects, "update_project": AutoProjects, "create_sections": AutoProjects, "favourite": AutoProjects,
	"project_from_template": AutoProjects, "append_to_note": AutoNotes, "clear_note": AutoNotes, "set_focus": AutoFocus,
	"start_timer": AutoTimers, "stop_timer": AutoTimers, "email_members": AutoEmailMembers,
}

// AutoBlocker returns the first step a routine in auto mode may not hold and
// what it does, or "", "" when every step is allowed.
func AutoBlocker(steps []Step) (string, string) {
	step, what := "", ""
	Walk(steps, func(s *Step) {
		if step != "" {
			return
		}
		if w, ok := autoKinds[s.Kind]; ok {
			step, what = s.ID, w
			return
		}
		if s.Kind != "change_tasks" {
			return
		}
		set, err := ParseStepActions(s.In["set"].Lit)
		if err != nil {
			return
		}
		switch {
		case set.State != nil:
			step, what = s.ID, AutoComplete
		case set.Trash:
			step, what = s.ID, AutoTrash
		case len(set.RemoveLabels) > 0:
			step, what = s.ID, AutoRemoveLabels
		case set.Assignee != nil:
			step, what = s.ID, AutoAssign
		}
	})
	return step, what
}
