package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"sort"
	"strings"

	opsync "github.com/pixari/opentodo/internal/sync"
)

// Keep a project away from AI assistants (OpenSpec change
// agent-planning-fields, design D9): server access state next to membership,
// read by every member and set by the project's owner or an admin. Only the
// assistant surfaces (agenttools) read it; nothing else changes.

func (s *Server) registerAgentExclusionRoutes(mux *routes) {
	mux.handle("GET /api/v1/projects/{id}/agent-access", signedIn.fullTokens(), s.handleGetProjectAgentAccess)
	mux.handle("PUT /api/v1/projects/{id}/agent-access", signedIn.fullTokens().demoDenied(), s.handlePutProjectAgentAccess)
}

// projectAgentAccess answers the project's state for the caller.
func (s *Server) projectAgentAccess(w http.ResponseWriter, r *http.Request, projectID string) {
	states, err := s.agentExclusions.For(r.Context(), s.sync, userFrom(r.Context()).ID)
	if err != nil {
		s.internal(w, err)
		return
	}
	st := states[projectID]
	var from any
	if st.InheritedFrom != "" {
		from = st.InheritedFrom
	}
	writeJSON(w, http.StatusOK, map[string]any{"kept_away": st.KeptAway, "inherited_from": from})
}

func (s *Server) handleGetProjectAgentAccess(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := s.sync.ProjectMembers(r.Context(), userFrom(r.Context()).ID, id); err != nil {
		s.memberError(w, err)
		return
	}
	s.projectAgentAccess(w, r, id)
}

func (s *Server) handlePutProjectAgentAccess(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	id := r.PathValue("id")
	m, err := s.sync.ProjectMembers(r.Context(), u.ID, id)
	if err != nil {
		s.memberError(w, err)
		return
	}
	if m.Role != opsync.RoleOwner && m.Role != opsync.RoleAdmin {
		writeError(w, http.StatusForbidden, "forbidden", "only the project's owner and admins can keep it away from AI assistants")
		return
	}
	var in map[string]json.RawMessage
	if err := readJSON(r, &in); err != nil {
		badBody(w, err)
		return
	}
	var keep bool
	v, ok := in["kept_away"]
	if !ok || len(in) != 1 || strings.TrimSpace(string(v)) == "null" || json.Unmarshal(v, &keep) != nil {
		writeError(w, http.StatusBadRequest, "invalid_input", "kept_away: must be true or false")
		return
	}
	if err := s.agentExclusions.Set(r.Context(), u.ID, id, keep, s.audit); err != nil {
		s.internal(w, err)
		return
	}
	s.projectAgentAccess(w, r, id)
}

// agentExcludedProjects is GET /api/v1/me's agent_excluded_projects: every
// project the caller can see that is kept away, inherited ones included.
func (s *Server) agentExcludedProjects(r *http.Request) []string {
	if s.agentExclusions == nil {
		return []string{}
	}
	ids, err := s.agentExclusions.Excluded(r.Context(), s.sync, userFrom(r.Context()).ID)
	if err != nil {
		s.log.Warn("agent exclusions", "err", err)
		return []string{}
	}
	sort.Strings(ids)
	return ids
}

// visibleToAssistants drops the ids of tasks in projects kept away from
// assistants, so the in-app assistant's selection context never names them
// (agent-planning-fields D9). Unknown ids pass through: the tools answer them
// as not found anyway.
func (s *Server) visibleToAssistants(ctx context.Context, userID string, taskIDs []string) []string {
	if s.agentExclusions == nil || len(taskIDs) == 0 {
		return taskIDs
	}
	ex, err := s.agentExclusions.Excluded(ctx, s.sync, userID)
	if err != nil {
		s.log.Warn("agent exclusions", "err", err)
		return nil
	}
	if len(ex) == 0 {
		return taskIDs
	}
	hidden := make(map[string]bool, len(ex))
	for _, id := range ex {
		hidden[id] = true
	}
	out := make([]string, 0, len(taskIDs))
	for _, id := range taskIDs {
		if t, err := s.sync.Get(ctx, userID, "task", id); err == nil {
			var pid string
			_ = json.Unmarshal(t["project_id"], &pid)
			if hidden[pid] {
				continue
			}
		}
		out = append(out, id)
	}
	return out
}
