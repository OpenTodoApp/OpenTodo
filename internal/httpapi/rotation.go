package httpapi

import (
	"context"
	"encoding/json"
	"net/http"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Rotating assignees on recurring tasks (OpenSpec change chore-rotation, design D6).

// presentRotation gives a task representation its rotation, [] when none.
func presentRotation(e opsync.Entity) {
	if e == nil {
		return
	}
	if v, has := e["rotation"]; !has || opsync.IsNull(v) {
		e["rotation"] = json.RawMessage("[]")
	}
}

// rotationOK checks a REST write that sets task.rotation: a list of at most
// MaxRotation distinct account ids, and a non-empty one only on a top-level
// recurring task of a project with at least two members (existing is nil for a
// create). It answers 400 invalid_rotation and returns false when refused;
// membership is checked by Apply (409 not_a_member).
func (s *Server) rotationOK(ctx context.Context, w http.ResponseWriter, body map[string]json.RawMessage, existing opsync.Entity) bool {
	raw, has := body["rotation"]
	if !has {
		return true
	}
	var list []string
	if json.Unmarshal(raw, &list) != nil || !opsync.ValidRotation(list) {
		writeError(w, http.StatusBadRequest, "invalid_rotation", "task.rotation: a list of at most 20 different account ids")
		return false
	}
	if len(list) == 0 {
		return true
	}
	merged := opsync.Entity{}
	for k, v := range existing {
		merged[k] = v
	}
	for k, v := range body {
		merged[k] = v
	}
	ok, err := s.sync.RotationAllowed(ctx, merged)
	if err != nil {
		s.internal(w, err)
		return false
	}
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid_rotation",
			"task.rotation: only a top-level recurring task in a project with at least two members takes turns")
		return false
	}
	return true
}

// notAMember answers a refused assignee or rotation: an account that is not a
// member of the task's project. A rotation is a conflict with the current
// membership (409); the assignee keeps its original 400.
func notAMember(w http.ResponseWriter, rej *opsync.RejectedError) {
	if rej.Op.Field == "rotation" {
		writeError(w, http.StatusConflict, "not_a_member", "task.rotation: everyone who takes turns must be a member of the task's project")
		return
	}
	writeError(w, http.StatusBadRequest, "not_a_member",
		"task.assignee_id: the assignee must be a member of the task's project (or yourself for a personal task)")
}
