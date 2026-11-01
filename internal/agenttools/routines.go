package agenttools

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	"github.com/OpenTodoApp/opentodo/internal/ids"
	"github.com/OpenTodoApp/opentodo/internal/ruleval"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Routines for agents (OpenSpec change routines-engine, design D11): read
// tools and resources, and write tools behind the write gate. A definition is
// written as ops with the agent's device; a run is the engine's, with device
// rule:<rule-id> and source mcp. No tool turns on applying AI results without
// asking (routines-ai-step): the tools take only the fields listed.

// Routines is what the routine tools need from the rules engine and the REST
// checks; the server installs it with SetRoutines.
type Routines interface {
	// Check validates a rule body as POST/PATCH /api/v1/rules does and returns
	// the warnings for steps that are not available.
	Check(ctx context.Context, userID string, body map[string]json.RawMessage, existing opsync.Entity) ([]ruleval.StepWarning, error)
	// Runs lists a routine's runs, newest first (outcome "" for all).
	Runs(ctx context.Context, userID, ruleID, outcome string, limit int) (any, error)
	// Run is one run with its steps; ok false for another user's or none.
	Run(ctx context.Context, userID, ruleID, runID string) (any, bool, error)
	// RunNow runs a routine (source mcp) and returns the answer and the writes.
	RunNow(ctx context.Context, userID, ruleID, taskID string, test bool) (map[string]any, int, error)
	// State is the server's pause and the last run time per routine.
	State(ctx context.Context, userID string) (paused map[string]string, lastRun map[string]int64)
	// RunAs names the person each shared routine runs as (routines-shared D4):
	// id and display name, by routine id.
	RunAs(ctx context.Context, userID string, ids []string) map[string]map[string]string
}

// SetRoutines installs the routine tools' engine.
func (r *Registry) SetRoutines(rt Routines) { r.routines = rt }

var routineProp = map[string]any{"type": "string", "description": "The routine's id (see list_routines) or its exact name."}

func routinesOff() *ToolError {
	return toolErr("unavailable", "routines are not available on this server")
}

// routineRows lists the user's live routines.
func (r *Registry) routineRows(ctx context.Context, userID string) ([]opsync.Entity, error) {
	return r.list(ctx, userID, "rule", false)
}

// findRoutine resolves an id or an exact name (ignoring case).
func (r *Registry) findRoutine(ctx context.Context, userID, ref string) (opsync.Entity, error) {
	rows, err := r.routineRows(ctx, userID)
	if err != nil {
		return nil, err
	}
	var byName []opsync.Entity
	for _, row := range rows {
		if str(row, "id") == ref {
			return row, nil
		}
		if strings.EqualFold(strings.TrimSpace(str(row, "name")), strings.TrimSpace(ref)) {
			byName = append(byName, row)
		}
	}
	switch len(byName) {
	case 1:
		return byName[0], nil
	case 0:
		return nil, notFound("routine", []string{ref})
	}
	return nil, argErr("routine: more than one routine is named " + ref + "; use its id")
}

// displayValue writes a stored value with every ciphertext string shown as encrypted.
func displayValue(raw json.RawMessage) any {
	var v any
	if json.Unmarshal(raw, &v) != nil {
		return nil
	}
	var walk func(any) any
	walk = func(x any) any {
		switch t := x.(type) {
		case string:
			return e2ee.Display(t)
		case []any:
			for i := range t {
				t[i] = walk(t[i])
			}
		case map[string]any:
			for k := range t {
				t[k] = walk(t[k])
			}
		}
		return x
	}
	return walk(v)
}

func stepsCount(raw json.RawMessage) int {
	steps, err := ruleval.ParseSteps(raw)
	if err != nil {
		return 1
	}
	return ruleval.CountSteps(steps)
}

func (r *Registry) listRoutines(ctx context.Context, userID string, _ args) (map[string]any, error) {
	rows, err := r.routineRows(ctx, userID)
	if err != nil {
		return nil, err
	}
	var paused map[string]string
	var last map[string]int64
	runAs := map[string]map[string]string{}
	if r.routines != nil {
		paused, last = r.routines.State(ctx, userID)
		runAs = r.routines.RunAs(ctx, userID, sharedIDs(rows))
	}
	out := []map[string]any{}
	for _, row := range rows {
		id := str(row, "id")
		var tr struct {
			Kind string `json:"kind"`
		}
		_ = json.Unmarshal(row["trigger"], &tr)
		item := map[string]any{"id": id, "untrusted_text": nameText{Name: e2ee.Display(str(row, "name"))}, "trigger_kind": tr.Kind,
			"enabled": string(row["enabled"]) == "true", "paused_reason": nil, "steps": stepsCount(row["steps"]), "last_run": nil,
			"project_id": nullable(str(row, "project_id")), "run_as": nil}
		if p := runAs[id]; p != nil {
			item["run_as"] = p
		}
		if p := paused[id]; p != "" {
			item["paused_reason"] = p
		}
		if at := last[id]; at > 0 {
			item["last_run"] = at
		}
		out = append(out, item)
	}
	return map[string]any{"routines": out}, nil
}

// routineDetail is one routine's whole definition with each step's availability.
func (r *Registry) routineDetail(ctx context.Context, userID string, row opsync.Entity) (map[string]any, error) {
	null := func(v json.RawMessage) json.RawMessage {
		if len(v) == 0 {
			return json.RawMessage("null")
		}
		return v
	}
	out := map[string]any{"id": str(row, "id"), "enabled": string(row["enabled"]) == "true", "trigger": null(row["trigger"]), "condition": null(row["condition"]),
		"actions":        displayValue(null(row["actions"])),
		"untrusted_text": map[string]any{"name": e2ee.Display(str(row, "name")), "steps": displayValue(null(row["steps"]))}, "unavailable": []ruleval.StepWarning{},
		"project_id": nullable(str(row, "project_id")), "run_as": nil}
	if r.routines != nil {
		if p := r.routines.RunAs(ctx, userID, sharedIDs([]opsync.Entity{row}))[str(row, "id")]; p != nil {
			out["run_as"] = p
		}
		w, err := r.routines.Check(ctx, userID, map[string]json.RawMessage{}, row)
		if err == nil && w != nil {
			out["unavailable"] = w
		}
	}
	return out, nil
}

func (r *Registry) getRoutine(ctx context.Context, userID string, a args) (map[string]any, error) {
	ref, err := a.str("routine")
	if err != nil || ref == "" {
		return nil, argErr("routine: the routine's id or name is required")
	}
	row, err := r.findRoutine(ctx, userID, ref)
	if err != nil {
		return nil, err
	}
	d, err := r.routineDetail(ctx, userID, row)
	if err != nil {
		return nil, err
	}
	return map[string]any{"routine": d}, nil
}

func (r *Registry) listRoutineRuns(ctx context.Context, userID string, a args) (map[string]any, error) {
	if r.routines == nil {
		return nil, routinesOff()
	}
	ref, err := a.str("routine")
	if err != nil || ref == "" {
		return nil, argErr("routine: the routine's id or name is required")
	}
	row, err := r.findRoutine(ctx, userID, ref)
	if err != nil {
		return nil, err
	}
	outcome, err := a.str("outcome")
	if err != nil {
		return nil, err
	}
	limit := 50
	if n, has, err := a.integer("limit"); err != nil {
		return nil, err
	} else if has {
		if n < 1 || n > 50 {
			return nil, argErr("limit: from 1 to 50")
		}
		limit = n
	}
	runs, err := r.routines.Runs(ctx, userID, str(row, "id"), outcome, limit)
	if err != nil {
		return nil, err
	}
	return map[string]any{"runs": runs}, nil
}

func (r *Registry) getRoutineRun(ctx context.Context, userID string, a args) (map[string]any, error) {
	if r.routines == nil {
		return nil, routinesOff()
	}
	ref, err := a.str("routine")
	if err != nil || ref == "" {
		return nil, argErr("routine: the routine's id or name is required")
	}
	runID, err := a.str("run_id")
	if err != nil || runID == "" {
		return nil, argErr("run_id: the run's id is required (see list_routine_runs)")
	}
	row, err := r.findRoutine(ctx, userID, ref)
	if err != nil {
		return nil, err
	}
	run, ok, err := r.routines.Run(ctx, userID, str(row, "id"), runID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, notFound("run", []string{runID})
	}
	return map[string]any{"run": run}, nil
}

// RoutinesResource is opentodo://routines.
func (r *Registry) RoutinesResource(ctx context.Context, userID string) (map[string]any, error) {
	res, err := r.listRoutines(ctx, userID, nil)
	if err != nil {
		return nil, err
	}
	return noticed(res), nil
}

// RoutineResource is opentodo://routines/{id}, the same payload as get_routine.
func (r *Registry) RoutineResource(ctx context.Context, userID, id string) (map[string]any, bool, error) {
	rows, err := r.routineRows(ctx, userID)
	if err != nil {
		return nil, false, err
	}
	for _, row := range rows {
		if str(row, "id") == id {
			d, err := r.routineDetail(ctx, userID, row)
			if err != nil {
				return nil, false, err
			}
			return noticed(map[string]any{"routine": d}), true, nil
		}
	}
	return nil, false, nil
}

// ---- write tools ----

func routineResult(tool, id, status string, warnings []ruleval.StepWarning) map[string]any {
	out := result(tool, []map[string]any{{"id": id, "status": status}}, 1)
	if warnings == nil {
		warnings = []ruleval.StepWarning{}
	}
	out["unavailable"] = warnings
	return out
}

// checkRoutineText refuses plain text literals inside steps for an encrypted
// account whose caller cannot encrypt: they are accepted only as ciphertext.
func checkRoutineText(c Caller, raw json.RawMessage) error {
	if !c.Encrypted || c.relayed() || len(raw) == 0 {
		return nil
	}
	steps, err := ruleval.ParseSteps(raw)
	if err != nil {
		return nil // the shape check names it
	}
	var plainText error
	ruleval.Walk(steps, func(s *ruleval.Step) {
		for _, a := range s.In {
			if txt, _, ok := ruleval.TextLiteral(a.Lit); ok && txt != "" && !e2ee.IsEnvelope(txt) && plainText == nil {
				plainText = encryptionErr()
			}
		}
	})
	return plainText
}

func (r *Registry) routineBody(c Caller, a args) (map[string]json.RawMessage, error) {
	body := map[string]json.RawMessage{}
	for _, f := range []string{"trigger", "condition", "steps", "actions"} {
		if !a.present(f) {
			continue
		}
		v := a[f]
		// The value is JSON text (strict tool schemas take no free objects);
		// an object is accepted as well.
		var text string
		if json.Unmarshal(v, &text) == nil {
			if !json.Valid([]byte(text)) {
				return nil, argErr(f + ": must be JSON text")
			}
			v = json.RawMessage(text)
		}
		body[f] = v
	}
	if a.present("name") {
		name, _, err := a.contentText(c, "name", true, 200)
		if err != nil {
			return nil, err
		}
		body["name"] = raw(strings.TrimSpace(name))
	}
	if err := checkRoutineText(c, body["steps"]); err != nil {
		return nil, err
	}
	return body, nil
}

// checkError maps the REST check's refusal onto a tool error.
func checkError(err error) error {
	var te *ToolError
	if errors.As(err, &te) {
		return te
	}
	return &ToolError{Code: "invalid_argument", Message: err.Error()}
}

// refuseAIApply refuses "Apply without asking" on every agent path
// (routines-ai-step D6): only the person turns it on, in the app. A routine an
// agent creates or edits runs its AI steps as proposals.
func refuseAIApply(a args) error {
	if a.present("ai_apply") {
		return toolErr("forbidden_for_agents", "an AI assistant cannot turn on Apply without asking for a routine: its AI results wait as proposals until the person turns it on in the app")
	}
	return nil
}

func (r *Registry) planCreateRoutine(ctx context.Context, c Caller, a args, _ ChangeSet) (Plan, error) {
	if r.routines == nil {
		return Plan{}, routinesOff()
	}
	if err := refuseAIApply(a); err != nil {
		return Plan{}, err
	}
	if err := a.only("", "name", "trigger", "condition", "steps", "actions", "enabled", "project"); err != nil {
		return Plan{}, err
	}
	body, err := r.routineBody(c, a)
	if err != nil {
		return Plan{}, err
	}
	if ref, _ := a.str("project"); ref != "" {
		pid, err := r.projectRef(ctx, c.UserID, ref)
		if err != nil {
			return Plan{}, err
		}
		body["project_id"] = raw(pid)
	}
	enabled := false
	if a.present("enabled") {
		if enabled, err = a.boolean("enabled"); err != nil {
			return Plan{}, err
		}
	}
	for f, v := range map[string]string{"condition": "null", "steps": "null", "actions": "null"} {
		if _, has := body[f]; !has {
			body[f] = json.RawMessage(v)
		}
	}
	warnings, err := r.routines.Check(ctx, c.UserID, body, nil)
	if err != nil {
		return Plan{}, checkError(err)
	}
	id := ids.New()
	now := stamp()
	body["enabled"], body["position"], body["created_at"], body["deleted_at"] = raw(enabled), raw(now), raw(now), nullRaw
	return Plan{Result: routineResult("create_routine", id, "created", warnings), Changes: ChangeSet{{Entity: "rule", EntityID: id, Create: true, Patch: body}}, Count: 1}, nil
}

func (r *Registry) planUpdateRoutine(ctx context.Context, c Caller, a args, _ ChangeSet) (Plan, error) {
	if r.routines == nil {
		return Plan{}, routinesOff()
	}
	if err := refuseAIApply(a); err != nil {
		return Plan{}, err
	}
	if err := a.only("", "routine", "name", "trigger", "condition", "steps", "actions"); err != nil {
		return Plan{}, err
	}
	ref, _ := a.str("routine")
	row, err := r.findRoutine(ctx, c.UserID, ref)
	if err != nil {
		return Plan{}, err
	}
	body, err := r.routineBody(c, a)
	if err != nil {
		return Plan{}, err
	}
	if len(body) == 0 {
		return Plan{}, argErr("nothing to change: give name, trigger, condition, steps or actions")
	}
	warnings, err := r.routines.Check(ctx, c.UserID, body, row)
	if err != nil {
		return Plan{}, checkError(err)
	}
	id := str(row, "id")
	return Plan{Result: routineResult("update_routine", id, "updated", warnings), Changes: ChangeSet{{Entity: "rule", EntityID: id, Patch: body}}, Count: 1}, nil
}

func (r *Registry) planSetRoutineEnabled(ctx context.Context, c Caller, a args, _ ChangeSet) (Plan, error) {
	if err := a.only("", "routine", "enabled"); err != nil {
		return Plan{}, err
	}
	ref, _ := a.str("routine")
	row, err := r.findRoutine(ctx, c.UserID, ref)
	if err != nil {
		return Plan{}, err
	}
	if !a.present("enabled") {
		return Plan{}, argErr("enabled: is required (true or false)")
	}
	on, err := a.boolean("enabled")
	if err != nil {
		return Plan{}, err
	}
	id := str(row, "id")
	if (string(row["enabled"]) == "true") == on {
		return Plan{Result: result("set_routine_enabled", []map[string]any{{"id": id, "status": "unchanged"}}, 0)}, nil
	}
	return Plan{Result: result("set_routine_enabled", []map[string]any{{"id": id, "status": "updated"}}, 1),
		Changes: ChangeSet{{Entity: "rule", EntityID: id, Patch: map[string]json.RawMessage{"enabled": raw(on)}}}, Count: 1}, nil
}

func (r *Registry) planTrashRoutine(ctx context.Context, c Caller, a args, _ ChangeSet) (Plan, error) {
	if err := a.only("", "routine"); err != nil {
		return Plan{}, err
	}
	ref, _ := a.str("routine")
	row, err := r.findRoutine(ctx, c.UserID, ref)
	if err != nil {
		return Plan{}, err
	}
	id := str(row, "id")
	return Plan{Result: result("trash_routine", []map[string]any{{"id": id, "status": "trashed"}}, 1),
		Changes: ChangeSet{{Entity: "rule", EntityID: id, Patch: map[string]json.RawMessage{"deleted_at": raw(stamp())}}}, Count: 1}, nil
}

// planRunRoutine plans nothing: the run is the engine's, carried out by
// Call after the gate and the limits (exec); planning never writes.
func (r *Registry) planRunRoutine(ctx context.Context, c Caller, a args, _ ChangeSet) (Plan, error) {
	if r.routines == nil {
		return Plan{}, routinesOff()
	}
	if err := a.only("", "routine", "task_id", "test"); err != nil {
		return Plan{}, err
	}
	ref, _ := a.str("routine")
	row, err := r.findRoutine(ctx, c.UserID, ref)
	if err != nil {
		return Plan{}, err
	}
	taskID, err := a.str("task_id")
	if err != nil {
		return Plan{}, err
	}
	test := false
	if a.present("test") {
		if test, err = a.boolean("test"); err != nil {
			return Plan{}, err
		}
	}
	id := str(row, "id")
	return Plan{Result: map[string]any{}, exec: func(ctx context.Context) (map[string]any, int, error) {
		res, n, err := r.routines.RunNow(ctx, c.UserID, id, taskID, test)
		if err != nil {
			var te *ToolError
			if errors.As(err, &te) {
				return nil, 0, te
			}
			return nil, 0, toolErr("run_refused", fmt.Sprint(err))
		}
		return res, n, nil
	}}, nil
}

// sharedIDs lists the routines with a project (the run-as person matters for
// those of a shared project).
func sharedIDs(rows []opsync.Entity) []string {
	var out []string
	for _, row := range rows {
		if str(row, "project_id") != "" {
			out = append(out, str(row, "id"))
		}
	}
	return out
}

// projectRef resolves a project id or exact name (ignoring case) among the
// user's live projects (a routine of a project, routines-shared D11).
func (r *Registry) projectRef(ctx context.Context, userID, ref string) (string, error) {
	rows, err := r.list(ctx, userID, "project", false)
	if err != nil {
		return "", err
	}
	var byName []string
	for _, row := range rows {
		if str(row, "id") == ref {
			return ref, nil
		}
		if strings.EqualFold(strings.TrimSpace(e2ee.Display(str(row, "name"))), strings.TrimSpace(ref)) {
			byName = append(byName, str(row, "id"))
		}
	}
	switch len(byName) {
	case 1:
		return byName[0], nil
	case 0:
		return "", notFound("project", []string{ref})
	}
	return "", argErr("project: more than one project is named " + ref + "; use its id")
}
