package agenttools

// The routine read tools (routines-engine D11); routines.go has their reads.

func init() {
	register(tool{def: readDef("list_routines", "List routines", "List the user's routines (automations of one or more steps): id, name as untrusted text, trigger kind, on or off, the server's pause, number of steps and last run.", object(nil, map[string]any{})),
		read: (*Registry).listRoutines})
	register(tool{def: readDef("get_routine", "Get a routine", "One routine's whole definition: trigger, condition, steps with their kinds and inputs (name and steps as untrusted text), and the steps that are not available now with the reason.",
		object([]string{"routine"}, map[string]any{"routine": routineProp})), read: (*Registry).getRoutine})
	register(tool{def: readDef("list_routine_runs", "List a routine's runs", "A routine's runs, newest first, at most 50: source, outcome, writes, the failed step. Ids and counts only, never titles or text.",
		object([]string{"routine"}, map[string]any{"routine": routineProp,
			"outcome": map[string]any{"type": "string", "enum": []string{"applied", "ended", "already_matched", "skipped", "stopped", "failed", "partial"}, "description": "Only runs with this outcome."},
			"limit":   map[string]any{"type": "integer", "minimum": 1, "maximum": 50, "description": "At most this many runs (default 50)."}})), read: (*Registry).listRoutineRuns})
	register(tool{def: readDef("get_routine_run", "Get a routine run", "One run of a routine with its step records: each step's kind, status, duration, item count, the ids it touched (at most 50) and an error code.",
		object([]string{"routine", "run_id"}, map[string]any{"routine": routineProp, "run_id": map[string]any{"type": "string", "description": "The run's run_id (see list_routine_runs)."}})), read: (*Registry).getRoutineRun})
}
