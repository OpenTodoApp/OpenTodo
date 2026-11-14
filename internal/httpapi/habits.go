package httpapi

import (
	"encoding/json"
	"net/http"

	"github.com/OpenTodoApp/opentodo/internal/agenttools"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// The habits route (OpenSpec change habits-assistant, design D3): a habit's
// numbers and days with the shapes of list_habits and get_habit, and logging a
// day as log_habit does, so a phone shortcut or a script logs a habit in one
// request. Writes go through the op log (ApplyStrict, devices woken). An
// `agent` token's log runs through the tool registry (agent_rest.go); `read`
// tokens only read (requireAuth refuses their POST).

func (s *Server) registerHabitRoutes(mux *routes) {
	mux.handle("GET /api/v1/habits", signedIn, s.handleListHabits)
	mux.handle("GET /api/v1/habits/{id}", signedIn, s.handleGetHabit)
	mux.handle("POST /api/v1/habits/{id}/log", signedIn, s.handleLogHabit)
}

// habitQuery turns the query of a habits GET into tool arguments.
func habitQuery(r *http.Request, names map[string]string) json.RawMessage {
	args := map[string]any{}
	q := r.URL.Query()
	for param, arg := range names {
		if v := q.Get(param); v != "" {
			if param == "graduated" {
				args[arg] = v == "true"
			} else {
				args[arg] = v
			}
		}
	}
	return mustJSON(args)
}

func (s *Server) handleListHabits(w http.ResponseWriter, r *http.Request) {
	out, err := s.agentTools.HabitsRoute(r.Context(), userFrom(r.Context()).ID, "", habitQuery(r, map[string]string{"graduated": "include_graduated", "timezone": "timezone"}))
	if err != nil {
		s.writeAgentError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleGetHabit(w http.ResponseWriter, r *http.Request) {
	s.writeHabit(w, r, http.StatusOK)
}

// writeHabit answers one habit with its days (get_habit's shape).
func (s *Server) writeHabit(w http.ResponseWriter, r *http.Request, status int) {
	args := habitQuery(r, map[string]string{"from": "from", "to": "to", "timezone": "timezone"})
	out, err := s.agentTools.HabitsRoute(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"), args)
	if err != nil {
		s.writeAgentError(w, err)
		return
	}
	writeJSON(w, status, out)
}

func (s *Server) handleLogHabit(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := userFrom(ctx).ID
	var body map[string]json.RawMessage
	if err := readJSON(r, &body); err != nil {
		badBody(w, err)
		return
	}
	for k := range body {
		if k != "date" && k != "state" && k != "note" && k != "timezone" {
			writeError(w, http.StatusBadRequest, "invalid_input", k+": unexpected field (date, state, note and timezone are accepted)")
			return
		}
	}
	if _, ok := body["state"]; !ok {
		writeError(w, http.StatusBadRequest, "invalid_input", "state: is required (done, tiny, skipped or clear)")
		return
	}
	encrypted, err := s.keys().Enabled(ctx, uid)
	if err != nil {
		s.internal(w, err)
		return
	}
	id := r.PathValue("id")
	cs, err := s.agentTools.PlanHabitLog(ctx, uid, encrypted, id, mustJSON(body))
	if err != nil {
		s.writeAgentError(w, err)
		return
	}
	ts := s.opTS()
	var ops []opsync.Op
	for _, c := range cs {
		ops = append(ops, fieldOps(c.Entity, c.EntityID, c.Patch, ts)...)
		// The series moved: its relative reminders follow the new due date.
		if c.EntityID == id && !c.Create {
			rops, err := s.reminderOpsForTaskAs(ctx, uid, id, c.Patch, ts, serverDevice)
			if err != nil {
				s.internal(w, err)
				return
			}
			ops = append(ops, rops...)
		}
	}
	if len(ops) > 0 {
		if _, ok := s.applyREST(w, ctx, uid, ops, "", collectionRefusals); !ok {
			return
		}
	}
	s.writeHabit(w, r, http.StatusOK)
}

// agentLogHabitCalls is an agent token's log: log_habit with the body.
func agentLogHabitCalls(id string, body map[string]json.RawMessage) []agenttools.ToolCall {
	args := map[string]json.RawMessage{}
	for k, v := range body {
		args[k] = v
	}
	args["id"] = mustJSON(id)
	return []agenttools.ToolCall{{Name: "log_habit", Args: mustJSON(args)}}
}
