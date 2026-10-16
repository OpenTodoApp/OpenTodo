package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/pixari/opentodo/internal/agenttools"
	"github.com/pixari/opentodo/internal/auth"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// Agent content routes (OpenSpec change `agent-ready-cli`, design D8).
//
// An `agent` token may write through REST on a fixed list of routes only, and
// there its request never reaches the regular handler: requireAuth hands it to
// handleAgentWrite, which translates the body into calls of the agent tool
// registry (internal/agenttools) and runs them as one write call. So the two
// switches, the shared per-token limits, validation, the E2EE refusal, mention
// suppression, `agent.write` audit and attribution (device agent:<token-id>)
// are exactly those of the MCP write tools. Every other write route, and every
// field without a matching tool, is refused with 403 insufficient_scope (fail
// closed: agentRoute decides by the matched mux pattern, so a new route is
// refused until it is added here on purpose).

const (
	agentCreateTask    = "create_task"
	agentCreateProject = "create_project"
	agentCreateLabel   = "create_label"
	agentPatchTask     = "patch_task"
	agentPatchProject  = "patch_project"
	agentDeleteTask    = "delete_task"
	agentCreateComment = "create_comment"
)

// agentRoute names the agent content route a request matched, or "".
func agentRoute(r *http.Request) string {
	switch r.Pattern {
	case "POST /api/v1/{collection}":
		switch r.PathValue("collection") {
		case "tasks":
			return agentCreateTask
		case "projects":
			return agentCreateProject
		case "labels":
			return agentCreateLabel
		}
	case "PATCH /api/v1/{collection}/{id}":
		switch r.PathValue("collection") {
		case "tasks":
			return agentPatchTask
		case "projects":
			return agentPatchProject
		}
	case "DELETE /api/v1/{collection}/{id}":
		if r.PathValue("collection") == "tasks" {
			return agentDeleteTask
		}
	case "POST /api/v1/tasks/{id}/comments":
		return agentCreateComment
	}
	return ""
}

// agentMaxBody caps an agent write body like an MCP request.
const agentMaxBody = 1 << 20

func (s *Server) handleAgentWrite(w http.ResponseWriter, r *http.Request, u *auth.User, tok auth.TokenInfo) {
	route := agentRoute(r)
	ctx := r.Context()
	caller, err := s.agentCaller(ctx, u, tok)
	if err != nil {
		s.internal(w, err)
		return
	}
	body := map[string]json.RawMessage{}
	if r.Method != http.MethodDelete {
		r.Body = http.MaxBytesReader(w, r.Body, agentMaxBody)
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeError(w, http.StatusBadRequest, "bad_request", "invalid JSON body: "+err.Error())
			return
		}
		if body == nil {
			body = map[string]json.RawMessage{}
		}
		delete(body, "id")
		if route == agentCreateProject || route == agentPatchProject {
			stripAnnotations("project", body)
		}
	}
	key, keyed := "", false
	if route == agentCreateTask || route == agentCreateProject || route == agentCreateLabel {
		var handled bool
		if key, keyed, handled = idempotencyKey(w, r); handled {
			return
		}
	}
	id := r.PathValue("id")
	var calls []agenttools.ToolCall
	var refusal string
	switch route {
	case agentCreateTask:
		calls, refusal = agentCreateTaskCalls(body)
	case agentCreateProject:
		calls, refusal = agentSimpleCall("create_project", "project", body, map[string]bool{"name": true, "color": true, "parent_id": true}, map[string]string{"archived": "false"}, nil)
	case agentCreateLabel:
		calls, refusal = agentSimpleCall("create_label", "label", body, map[string]bool{"name": true, "color": true}, nil, nil)
	case agentCreateComment:
		// mentions are accepted and dropped: assistant comments notify nobody.
		delete(body, "mentions")
		calls, refusal = agentSimpleCall("add_comment", "comment", body, map[string]bool{"body": true, "parent_id": true}, nil, map[string]any{"task_id": id})
	case agentPatchProject:
		calls, refusal = agentSimpleCall("update_project", "project", body, map[string]bool{"name": true, "color": true}, nil, map[string]any{"id": id})
	case agentDeleteTask:
		calls = []agenttools.ToolCall{{Name: "trash_tasks", Args: mustJSON(map[string]any{"ids": []string{id}})}}
	case agentPatchTask:
		var existing opsync.Entity
		if existing, err = s.sync.Get(ctx, u.ID, "task", id); err != nil {
			s.internal(w, err)
			return
		}
		calls, refusal = agentPatchTaskCalls(id, body, existing)
	}
	if refusal != "" {
		writeError(w, http.StatusForbidden, "insufficient_scope", refusal)
		return
	}
	if len(calls) == 0 {
		writeError(w, http.StatusBadRequest, "bad_request", "no fields to update")
		return
	}
	if keyed {
		// Each create route maps to exactly one create tool call.
		var args map[string]any
		_ = json.Unmarshal(calls[0].Args, &args)
		args["client_request_id"] = s.agentRequestID(r.PathValue("collection"), key)
		calls[0].Args = mustJSON(args)
		if caller.CanWrite() {
			if done := s.agentReplay(w, r, caller, route, calls); done {
				return
			}
		}
	}
	results, err := s.agentTools.CallAll(ctx, caller, calls)
	if err != nil {
		s.writeAgentError(w, err)
		return
	}
	s.writeAgentResult(w, r, route, id, results)
}

// agentReplay answers a keyed create that was already applied (200, replayed)
// or reused for other content (409). It reports false for a fresh create.
func (s *Server) agentReplay(w http.ResponseWriter, r *http.Request, c agenttools.Caller, route string, calls []agenttools.ToolCall) bool {
	ctx := r.Context()
	entity := map[string]string{agentCreateTask: "task", agentCreateProject: "project", agentCreateLabel: "label"}[route]
	var args map[string]json.RawMessage
	_ = json.Unmarshal(calls[0].Args, &args)
	var crid string
	_ = json.Unmarshal(args["client_request_id"], &crid)
	target := agenttools.KeyedChange(c, crid, entity, 0)
	plans, err := s.agentTools.PlanAll(ctx, c, calls)
	if err != nil {
		// Planning errors are reported by the real call (and audited there).
		return false
	}
	planned := map[string]json.RawMessage{}
	for _, ch := range plans[0].Changes {
		if ch.Create && ch.EntityID == target.EntityID {
			planned = ch.Patch
		}
	}
	if len(planned) == 0 {
		// The planner found an existing label with that name. It is a replay
		// when this key created it, a conflict when this key created another.
		resID := firstResultID(plans[0].Result)
		stored, err := s.storedOpValues(ctx, c.UserID, []string{target.OpID("name")})
		if err != nil {
			s.internal(w, err)
			return true
		}
		if len(stored) == 0 {
			// Not created by this key: an ordinary existing label.
			return false
		}
		var want, had string
		_ = json.Unmarshal(args["name"], &want)
		_ = json.Unmarshal(stored[target.OpID("name")], &had)
		if resID == target.EntityID && strings.EqualFold(strings.TrimSpace(want), had) {
			s.writeReplay(w, r, entity, resID)
			return true
		}
		writeIdempotencyConflict(w, "")
		return true
	}
	state, err := s.replayState(ctx, c.UserID, entity, target.EntityID, planned, target.OpID)
	if err != nil {
		s.internal(w, err)
		return true
	}
	switch state {
	case replayMatch:
		s.writeReplay(w, r, entity, target.EntityID)
		return true
	case replayConflict:
		writeIdempotencyConflict(w, "")
		return true
	}
	return false
}

func (s *Server) writeAgentResult(w http.ResponseWriter, r *http.Request, route, id string, results []map[string]any) {
	ctx := r.Context()
	uid := userFrom(ctx).ID
	switch route {
	case agentDeleteTask:
		w.WriteHeader(http.StatusNoContent)
		return
	case agentPatchTask, agentPatchProject:
		entity := "task"
		if route == agentPatchProject {
			entity = "project"
		}
		s.writeAgentEntity(w, r, uid, entity, id, http.StatusOK)
		return
	}
	entity := map[string]string{agentCreateTask: "task", agentCreateProject: "project", agentCreateLabel: "label", agentCreateComment: "comment"}[route]
	newID := firstResultID(results[0])
	status := http.StatusCreated
	if firstResultStatus(results[0]) == "exists" {
		// create_label returns an existing label of the same name.
		status = http.StatusOK
	}
	s.writeAgentEntity(w, r, uid, entity, newID, status)
}

func (s *Server) writeAgentEntity(w http.ResponseWriter, r *http.Request, uid, entity, id string, status int) {
	e, err := s.sync.Get(r.Context(), uid, entity, id)
	if err != nil {
		s.internal(w, err)
		return
	}
	if e == nil {
		writeError(w, http.StatusNotFound, "not_found", "not found")
		return
	}
	if err := s.annotateProjects(r.Context(), entity, e); err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, status, e)
}

func firstResultID(res map[string]any) string {
	if items, ok := res["results"].([]map[string]any); ok && len(items) > 0 {
		id, _ := items[0]["id"].(string)
		return id
	}
	return ""
}

func firstResultStatus(res map[string]any) string {
	if items, ok := res["results"].([]map[string]any); ok && len(items) > 0 {
		st, _ := items[0]["status"].(string)
		return st
	}
	return ""
}

// agentSimpleCall maps a body onto one tool's arguments: allowed fields pass
// through (null dropped), tolerated fields must hold their default, anything
// else is refused. fixed arguments come from the path.
func agentSimpleCall(tool, entity string, body map[string]json.RawMessage, allowed map[string]bool, tolerated map[string]string, fixed map[string]any) ([]agenttools.ToolCall, string) {
	args := map[string]any{}
	for k, v := range fixed {
		args[k] = v
	}
	for k, v := range body {
		switch {
		case allowed[k]:
			if string(v) != "null" {
				args[k] = v
			}
		case tolerated[k] != "" && opsync.SameJSON(v, json.RawMessage(tolerated[k])):
		default:
			return nil, refusedField(entity, k)
		}
	}
	return []agenttools.ToolCall{{Name: tool, Args: mustJSON(args)}}, ""
}

func refusedField(entity, field string) string {
	return fmt.Sprintf("%s.%s cannot be set with an agent token (see docs/api.md#agent-tokens)", entity, field)
}

// taskCreateFields are the task fields create_tasks accepts.
var taskCreateFields = map[string]bool{"title": true, "description": true, "project_id": true, "section_id": true, "parent_id": true,
	"priority": true, "due": true, "labels": true, "estimate_minutes": true, "recurrence": true}

func agentCreateTaskCalls(body map[string]json.RawMessage) ([]agenttools.ToolCall, string) {
	item := map[string]json.RawMessage{}
	for k, v := range body {
		switch {
		case taskCreateFields[k]:
			if string(v) != "null" {
				item[k] = v
			}
		case (k == "completed_at" || k == "completed_by" || k == "deleted_at" || k == "assignee_id") && string(v) == "null":
			// Defaults of a new task: nothing to set.
		default:
			return nil, refusedField("task", k)
		}
	}
	return []agenttools.ToolCall{{Name: "create_tasks", Args: mustJSON(map[string]any{"items": []any{item}})}}, ""
}

// agentPatchTaskCalls splits a task PATCH into the matching tools: field edits
// (update_tasks), project and section (move_tasks), due (schedule_tasks, which
// replaces the whole due as REST does), completion (complete_tasks or
// reopen_tasks) and the Trash (trash_tasks, own creations only). Fields with no
// tool (assignee_id, parent_id, position, restoring from the Trash) are refused.
func agentPatchTaskCalls(id string, body map[string]json.RawMessage, existing opsync.Entity) ([]agenttools.ToolCall, string) {
	update := map[string]json.RawMessage{}
	var calls []agenttools.ToolCall
	var move map[string]any
	for k, v := range body {
		switch k {
		case "title", "description", "priority", "labels", "estimate_minutes", "recurrence":
			update[k] = v
		case "project_id", "section_id":
			if move == nil {
				move = map[string]any{}
			}
			move[k] = v
		case "due", "completed_at", "deleted_at":
		default:
			return nil, refusedField("task", k)
		}
	}
	if v, ok := body["deleted_at"]; ok && string(v) == "null" {
		return nil, "task.deleted_at: an agent token cannot restore tasks from the Trash"
	}
	if len(update) > 0 {
		update["id"] = mustJSON(id)
		calls = append(calls, agenttools.ToolCall{Name: "update_tasks", Args: mustJSON(map[string]any{"updates": []any{update}})})
	}
	if move != nil {
		cur := func(f string) any {
			if existing == nil {
				return nil
			}
			if v, ok := existing[f]; ok {
				return v
			}
			return nil
		}
		if _, ok := move["project_id"]; !ok {
			move["project_id"] = cur("project_id")
		}
		if _, ok := move["section_id"]; !ok {
			if p, _ := json.Marshal(move["project_id"]); opsync.SameJSON(p, mustJSON(cur("project_id"))) {
				move["section_id"] = cur("section_id")
			}
		}
		move["ids"] = []string{id}
		calls = append(calls, agenttools.ToolCall{Name: "move_tasks", Args: mustJSON(move)})
	}
	if v, ok := body["due"]; ok {
		due := json.RawMessage("null")
		if string(v) != "null" {
			// REST replaces the due: a missing time or zone clears it.
			var d map[string]json.RawMessage
			if json.Unmarshal(v, &d) != nil {
				return []agenttools.ToolCall{{Name: "schedule_tasks", Args: mustJSON(map[string]any{"ids": []string{id}, "due": v})}}, ""
			}
			for _, f := range []string{"time", "tz"} {
				if _, ok := d[f]; !ok {
					d[f] = json.RawMessage("null")
				}
			}
			due = mustJSON(d)
		}
		calls = append(calls, agenttools.ToolCall{Name: "schedule_tasks", Args: mustJSON(map[string]any{"ids": []string{id}, "due": due})})
	}
	if v, ok := body["completed_at"]; ok {
		name := "complete_tasks"
		if string(v) == "null" {
			name = "reopen_tasks"
		}
		calls = append(calls, agenttools.ToolCall{Name: name, Args: mustJSON(map[string]any{"ids": []string{id}})})
	}
	if v, ok := body["deleted_at"]; ok && string(v) != "null" {
		calls = append(calls, agenttools.ToolCall{Name: "trash_tasks", Args: mustJSON(map[string]any{"ids": []string{id}})})
	}
	return calls, ""
}

// writeAgentError maps registry errors onto the REST error envelope; the
// tool error's code is kept so clients see the same reasons as on MCP.
func (s *Server) writeAgentError(w http.ResponseWriter, err error) {
	var ae *agenttools.ArgError
	var te *agenttools.ToolError
	switch {
	case errors.As(err, &ae):
		writeError(w, http.StatusBadRequest, "invalid_input", ae.Msg)
	case errors.As(err, &te):
		status := http.StatusBadRequest
		code := te.Code
		switch te.Code {
		case agenttools.DeniedByOwner, agenttools.DeniedByUser, "forbidden", "not_permitted":
			status = http.StatusForbidden
		case agenttools.DeniedByScope:
			status, code = http.StatusForbidden, "insufficient_scope"
		case "not_found":
			status = http.StatusNotFound
		case "encryption_enabled":
			status = http.StatusConflict
		case "rate_limited", "write_limit":
			status = http.StatusTooManyRequests
			if n, ok := te.Data["retry_after_seconds"].(int); ok {
				w.Header().Set("Retry-After", strconv.Itoa(n))
			}
		}
		e := map[string]any{"code": code, "message": te.Message}
		for k, v := range te.Data {
			e[k] = v
		}
		writeJSON(w, status, map[string]any{"error": e})
	default:
		s.internal(w, err)
	}
}
