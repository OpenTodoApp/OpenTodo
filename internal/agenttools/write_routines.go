package agenttools

import "github.com/OpenTodoApp/opentodo/internal/ruleval"

// The routine write tools (routines-engine D11), behind the write gate;
// routines.go has their planning.

var (
	triggerProp   = map[string]any{"type": "string", "maxLength": 2000, "description": "JSON text of the trigger: {kind} with kind task.created, task.completed, task.reopened, label.added or label.removed (label_id), assigned.to_me, task.moved (project_id, section_id?), due.reached, overdue, schedule (at HH:MM, and weekdays 1-7 or month_days 1-31 and \"last\"), manual (only when run; on: \"note\" to run on a standalone note), note.created, note.edited (5 minutes after the last edit) or note.label.added (label_id). A note trigger takes steps only and a condition of project and labels only."}
	conditionProp = map[string]any{"type": "string", "maxLength": 8000, "description": "JSON text of an optional condition every task must meet (see docs/api.md#routines), or the text null."}
	stepsProp     = map[string]any{"type": "string", "maxLength": ruleval.MaxStepsBytes,
		"description": "JSON text of the steps, a list of at most 20: {id, kind, in: {name: {ref: step-id|trigger|item} | {literal: value}}, then?, otherwise?, do?}. Step kinds and their inputs: see docs/routines.md and the API's catalogue. Steps read tasks from the trigger or earlier steps: a step that takes a task and gets a list runs once per task, so add_comment with task {ref: a} comments on each task step a found. Pick is take (from start|end|all, n default 1) or filter (where). find_tasks never finds tasks in the Trash or of a project in the Trash, and leaves out archived projects unless archived is {literal: true}. A specific task literal {task: id} is for rare fixed targets only. Standalone notes: find_notes (project, labels {any|all|none}, within_days, unchanged_days, words), get_note ({note: id}), create_note (title, text, project, labels), change_notes (notes, project or no_project, add_labels, remove_labels, pin, trash), note_to_task (note); note_text, append_to_note and clear_note take a note too, and note_text's field title reads a note's title. No step may create, edit or run a routine."}
	workspaceRoutineProp = map[string]any{"type": []string{"string", "null"}, "description": "The workspace the routine works in (id or exact name, see list_workspaces): its trigger fires only for that workspace's tasks and its steps find and change only them. null: every workspace (the default)."}
	actionsProp          = map[string]any{"type": "string", "maxLength": 8000, "description": "JSON text of the actions, for a routine of one Change tasks card instead of steps: the actions object (see docs/api.md#routines)."}
)

func init() {
	register(tool{def: func(Caller) Definition {
		return writeDef("run_routine", "Run a routine", "Run a routine now, or test it (test: true plans every step and writes nothing). It runs with the routine's own limits and writes as the routine; the answer lists each step's status and counts. A routine that sends a webhook or an email can only be tested: the person runs it in the app.",
			object([]string{"routine"}, map[string]any{"routine": routineProp,
				"task_id": map[string]any{"type": "string", "description": "The task a manual routine is run on (its steps read it as the trigger), for a routine that reads one."},
				"note_id": map[string]any{"type": "string", "description": "The standalone note (see list_notes) a routine triggered by a note, or run on a note, is run on; not with task_id."},
				"test":    map[string]any{"type": "boolean", "default": false, "description": "Plan every step and log a test run; nothing is written."}}), false, false, nil, false)
	}, plan: (*Registry).planRunRoutine})
	register(tool{def: func(Caller) Definition {
		return writeDef("set_routine_enabled", "Turn a routine on or off", "Turn a routine on or off. Turning it on clears the server's pause for running too often. A routine that sends a webhook or an email is turned on by the person in the app; it can be turned off here.",
			object([]string{"routine", "enabled"}, map[string]any{"routine": routineProp, "enabled": map[string]any{"type": "boolean"}}), false, true, nil, false)
	}, plan: (*Registry).planSetRoutineEnabled})
	register(tool{def: func(Caller) Definition {
		return writeDef("create_routine", "Create a routine", "Create a routine: a name, a trigger, an optional condition and steps (or actions for one Change tasks card), and optionally the project it belongs to or the workspace it works in. It starts off unless enabled is true. Steps that are not available now are allowed and listed in the result. Steps that send a webhook or an email (webhook, email_me, email_members) are refused: the person adds them in the app.",
			object([]string{"name", "trigger"}, map[string]any{"name": map[string]any{"type": "string", "minLength": 1, "maxLength": 200}, "trigger": triggerProp, "condition": conditionProp,
				"steps": stepsProp, "actions": actionsProp, "enabled": map[string]any{"type": "boolean", "default": false}, "workspace": workspaceRoutineProp,
				"project": map[string]any{"type": "string", "description": "A project (id or exact name) the routine belongs to. In a shared project the routine is the project's: its editors change it, it acts only in that project, and it runs as whoever turns it on."}}), false, false, []string{"name"}, false)
	}, plan: (*Registry).planCreateRoutine})
	register(tool{def: func(Caller) Definition {
		return writeDef("update_routine", "Change a routine", "Change a routine's name or workspace, or replace its whole trigger, condition, steps or actions. A routine that would still send a webhook or an email after the change is refused: the person changes it in the app.",
			object([]string{"routine"}, map[string]any{"routine": routineProp, "name": map[string]any{"type": "string", "minLength": 1, "maxLength": 200}, "trigger": triggerProp,
				"condition": conditionProp, "steps": stepsProp, "actions": actionsProp, "workspace": workspaceRoutineProp}), false, true, []string{"name"}, false)
	}, plan: (*Registry).planUpdateRoutine})
	register(tool{def: func(Caller) Definition {
		return writeDef("trash_routine", "Delete a routine", "Move a routine to the Trash; it stops running and can be restored. What it already did stays.",
			object([]string{"routine"}, map[string]any{"routine": routineProp}), true, true, nil, false)
	}, plan: (*Registry).planTrashRoutine})
}
