package agenttools

import "github.com/OpenTodoApp/opentodo/internal/ruleval"

// The routine write tools (routines-engine D11), behind the write gate;
// routines.go has their planning.

var (
	triggerProp   = map[string]any{"type": "string", "maxLength": 2000, "description": "JSON text of the trigger: {kind} with kind task.created, task.completed, task.reopened, label.added or label.removed (label_id), assigned.to_me, task.moved (project_id, section_id?), due.reached, overdue, schedule (at HH:MM, and weekdays 1-7 or month_days 1-31 and \"last\") or manual (only when run)."}
	conditionProp = map[string]any{"type": "string", "maxLength": 8000, "description": "JSON text of an optional condition every task must meet (see docs/api.md#routines), or the text null."}
	stepsProp     = map[string]any{"type": "string", "maxLength": ruleval.MaxStepsBytes,
		"description": "JSON text of the steps, a list of at most 20: {id, kind, in: {name: {ref: step-id|trigger|item} | {literal: value}}, then?, otherwise?, do?}. Step kinds and their inputs: see docs/routines.md and the API's catalogue. Steps read tasks from the trigger or earlier steps: a step that takes a task and gets a list runs once per task, so add_comment with task {ref: a} comments on each task step a found. Pick is take (from start|end|all, n default 1) or filter (where). find_tasks never finds tasks in the Trash or of a project in the Trash, and leaves out archived projects unless archived is {literal: true}. A specific task literal {task: id} is for rare fixed targets only. No step may create, edit or run a routine."}
	actionsProp = map[string]any{"type": "string", "maxLength": 8000, "description": "JSON text of the actions, for a routine of one Change tasks card instead of steps: the actions object (see docs/api.md#routines)."}
)

func init() {
	register(tool{def: func(Caller) Definition {
		return writeDef("run_routine", "Run a routine", "Run a routine now, or test it (test: true plans every step and writes nothing). It runs with the routine's own limits and writes as the routine; the answer lists each step's status and counts.",
			object([]string{"routine"}, map[string]any{"routine": routineProp,
				"task_id": map[string]any{"type": "string", "description": "The task a manual routine is run on (its steps read it as the trigger), for a routine that reads one."},
				"test":    map[string]any{"type": "boolean", "default": false, "description": "Plan every step and log a test run; nothing is written."}}), false, false, nil, false)
	}, plan: (*Registry).planRunRoutine})
	register(tool{def: func(Caller) Definition {
		return writeDef("set_routine_enabled", "Turn a routine on or off", "Turn a routine on or off. Turning it on clears the server's pause for running too often.",
			object([]string{"routine", "enabled"}, map[string]any{"routine": routineProp, "enabled": map[string]any{"type": "boolean"}}), false, true, nil, false)
	}, plan: (*Registry).planSetRoutineEnabled})
	register(tool{def: func(Caller) Definition {
		return writeDef("create_routine", "Create a routine", "Create a routine: a name, a trigger, an optional condition and steps (or actions for one Change tasks card). It starts off unless enabled is true. Steps that are not available now are allowed and listed in the result.",
			object([]string{"name", "trigger"}, map[string]any{"name": map[string]any{"type": "string", "minLength": 1, "maxLength": 200}, "trigger": triggerProp, "condition": conditionProp,
				"steps": stepsProp, "actions": actionsProp, "enabled": map[string]any{"type": "boolean", "default": false}}), false, false, []string{"name"}, false)
	}, plan: (*Registry).planCreateRoutine})
	register(tool{def: func(Caller) Definition {
		return writeDef("update_routine", "Change a routine", "Change a routine's name, or replace its whole trigger, condition, steps or actions.",
			object([]string{"routine"}, map[string]any{"routine": routineProp, "name": map[string]any{"type": "string", "minLength": 1, "maxLength": 200}, "trigger": triggerProp,
				"condition": conditionProp, "steps": stepsProp, "actions": actionsProp}), false, true, []string{"name"}, false)
	}, plan: (*Registry).planUpdateRoutine})
	register(tool{def: func(Caller) Definition {
		return writeDef("trash_routine", "Delete a routine", "Move a routine to the Trash; it stops running and can be restored. What it already did stays.",
			object([]string{"routine"}, map[string]any{"routine": routineProp}), true, true, nil, false)
	}, plan: (*Registry).planTrashRoutine})
}
