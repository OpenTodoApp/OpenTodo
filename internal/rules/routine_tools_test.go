package rules

import (
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/agenttools"
	"github.com/OpenTodoApp/opentodo/internal/ruleval"
)

// notAStep lists the registry's write tools no step names, with the reason
// (routines-engine 2.2): a new write tool fails this test until it is a step
// or listed here.
var notAStep = map[string]string{
	"add_reminders":       "reminders follow a task's due; a routine changes the due",
	"remove_reminders":    "as add_reminders",
	"update_reminders":    "as add_reminders",
	"archive_projects":    "used by Update project (archived)",
	"complete_tasks":      "Change tasks completes through the rule planner",
	"reopen_tasks":        "Change tasks reopens through the rule planner",
	"move_tasks":          "Change tasks moves through the rule planner (section and project)",
	"schedule_tasks":      "Change tasks dates through the rule planner",
	"trash_tasks":         "Change tasks moves to the Trash (set.trash)",
	"create_note":         "routines act on task and project notes, not standalone notes (notes-overview)",
	"update_note":         "as create_note",
	"trash_note":          "as create_note",
	"note_to_task":        "as create_note",
	"log_time":            "a routine starts and stops the timer; past time is the person's own record",
	"update_time_entries": "as log_time",
	"reorder_sections":    "order is a person's arrangement, not an automation",
	"update_sections":     "as reorder_sections",
	"update_labels":       "labels are created by Create labels; renaming is the person's",
}

func TestEveryToolStepNamesARegistryTool(t *testing.T) {
	reg := agenttools.New(nil, agenttools.Options{})
	caller := agenttools.Caller{UserID: "u", Scope: agenttools.ScopeAgent, OwnerAllowsWrites: true, UserAllowsWrites: true}
	writes := map[string]bool{}
	for _, d := range reg.Definitions(caller) {
		if d.Kind == agenttools.KindWrite {
			writes[d.Name] = true
		}
	}
	steps := map[string]bool{}
	for _, k := range ruleval.Steps {
		if k.Tool == "" {
			continue
		}
		if !writes[k.Tool] {
			t.Errorf("step %s names %s, which is not a registry write tool", k.Kind, k.Tool)
		}
		steps[k.Tool] = true
	}
	for name := range writes {
		if !steps[name] && notAStep[name] == "" {
			t.Errorf("write tool %s is neither a step nor listed in notAStep with a reason", name)
		}
	}
	for name := range notAStep {
		if !writes[name] {
			t.Errorf("notAStep lists %s, which is not a write tool", name)
		}
	}
}
