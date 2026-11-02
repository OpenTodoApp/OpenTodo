package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	"github.com/OpenTodoApp/opentodo/internal/reuse"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Reusable lists (OpenSpec reusable-lists, design D6): POST /api/v1/tasks with
// reuse: true in a reusable project reopens the item the title matches instead
// of creating a second one.

// reusedKey carries the "reused" answer of a create into writeOps.
type reusedKey struct{}

// takeReuse removes the optional boolean reuse from a task create body. It
// answers 400 when reuse is not a boolean.
func takeReuse(w http.ResponseWriter, entity string, body map[string]json.RawMessage) (reuse, ok bool) {
	raw, has := body["reuse"]
	if entity != "task" || !has {
		return false, true
	}
	delete(body, "reuse")
	if json.Unmarshal(raw, &reuse) != nil {
		writeError(w, http.StatusBadRequest, "invalid_input", "reuse must be true or false")
		return false, false
	}
	return reuse, true
}

// valuesOK checks the closed value sets a create or patch body may hold: a
// task's fields (taskBodyOK) and a section's aisle.
func valuesOK(w http.ResponseWriter, entity string, body map[string]json.RawMessage) bool {
	if entity == "task" {
		return taskBodyOK(w, body)
	}
	return aisleOK(w, entity, body)
}

// aisleOK refuses a section aisle outside the nine keys with 400 invalid_aisle
// (null clears it). Sync accepts any string, which clients read as none.
func aisleOK(w http.ResponseWriter, entity string, body map[string]json.RawMessage) bool {
	raw, has := body["aisle"]
	if entity != "section" || !has || string(raw) == "null" {
		return true
	}
	var key string
	if json.Unmarshal(raw, &key) != nil || !reuse.ValidAisle(key) {
		writeError(w, http.StatusBadRequest, "invalid_aisle",
			fmt.Sprintf("section.aisle must be null or one of produce, bakery, dairy, meat, frozen, pantry, drinks, household, personal, got %s", raw))
		return false
	}
	return true
}

// reuseCreate runs the match for a create with reuse: true. It answers the
// request and returns true when a match was found (200, reopened or open);
// otherwise the create goes on, and the returned request carries "unavailable"
// when the server cannot read the titles (an encrypted account or a ciphertext
// title).
func (s *Server) reuseCreate(w http.ResponseWriter, r *http.Request, body map[string]json.RawMessage) (*http.Request, bool) {
	ctx := r.Context()
	uid := userFrom(ctx).ID
	pid := idOf(body["project_id"])
	if pid == "" || idOf(body["parent_id"]) != "" || (len(body["completed_at"]) > 0 && string(body["completed_at"]) != "null") {
		return r, false
	}
	p, err := s.sync.Get(ctx, uid, "project", pid)
	if err != nil {
		s.internal(w, err)
		return r, true
	}
	if p == nil || p.Deleted() || string(p["reusable"]) != "true" {
		return r, false
	}
	var title string
	_ = json.Unmarshal(body["title"], &title)
	if enc, err := s.encryptionEnabled(ctx, uid); err != nil {
		s.internal(w, err)
		return r, true
	} else if enc || e2ee.IsCiphertext(title) {
		return r.WithContext(context.WithValue(ctx, reusedKey{}, "unavailable")), false
	}
	tasks, err := s.sync.List(ctx, uid, "task", false)
	if err != nil {
		s.internal(w, err)
		return r, true
	}
	m, ok := reuse.FindMatch(pid, title, reuse.FromRows(tasks))
	if !ok {
		return r, false
	}
	// A viewer may not add, so it learns nothing from a match either.
	if _, _, role, err := s.sync.ProjectStatus(ctx, uid, pid); err != nil {
		s.internal(w, err)
		return r, true
	} else if !opsync.CanWrite(role, "task", "completed_at") {
		writeError(w, http.StatusForbidden, "forbidden", "your role on this project does not allow adding tasks")
		return r, true
	}
	if m.State == reuse.Open {
		e, err := s.sync.Get(ctx, uid, "task", m.Task.ID)
		if err == nil {
			err = s.annotateProjects(ctx, "task", e)
		}
		if err != nil {
			s.internal(w, err)
			return r, true
		}
		e["reused"] = json.RawMessage(`"open"`)
		writeJSON(w, http.StatusOK, e)
		return r, true
	}
	reopen := map[string]json.RawMessage{"completed_at": json.RawMessage("null"), "completed_by": json.RawMessage("null")}
	s.writeFieldsAt(w, r.WithContext(context.WithValue(ctx, reusedKey{}, "reopened")), "task", m.Task.ID, reopen, http.StatusOK, nil, s.opTS())
	return r, true
}

// presentReused adds the "reused" answer a reuse create left on the request.
func presentReused(r *http.Request, e opsync.Entity) {
	if v, ok := r.Context().Value(reusedKey{}).(string); ok && e != nil {
		e["reused"] = json.RawMessage(opsync.QuoteJSON(v))
	}
}

// presentReusable gives every project representation its reusable and aisles
// flags, false when unset; aisles reads false while reusable is false.
func presentReusable(e opsync.Entity) {
	if e == nil {
		return
	}
	reusable := string(e["reusable"]) == "true"
	e["reusable"] = json.RawMessage(fmt.Sprint(reusable))
	e["aisles"] = json.RawMessage(fmt.Sprint(reusable && string(e["aisles"]) == "true"))
}
