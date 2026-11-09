package httpapi

import (
	"context"
	"errors"
	"net/http"

	"github.com/OpenTodoApp/opentodo/internal/audit"
	"github.com/OpenTodoApp/opentodo/internal/rules"
)

// Stop links of Email project members (OpenSpec change routines-shared-email,
// design D4): the member, signed out or on another device, sees the routine's
// name and stops its emails with a button. The secret in the address is the
// credential; the answer names the routine and nothing else about it.

func (s *Server) registerRoutineEmailRoutes(mux *routes) {
	stop := public("a member stops a routine's emails from the link in one, signed out too; the secret in the address is the credential").DemoDenied()
	mux.handle("GET /api/v1/routine-emails/{token}", stop, s.handleRoutineEmailLink)
	mux.handle("POST /api/v1/routine-emails/{token}/stop", stop, s.handleRoutineEmailStop)
}

// routineEmailLink resolves the link of a request, or answers it.
func (s *Server) routineEmailLink(w http.ResponseWriter, r *http.Request) (ruleID, userID string, ok bool) {
	publicHeaders(w)
	invalid := func() (string, string, bool) {
		writeError(w, http.StatusNotFound, "link_invalid", rules.ErrStopLinkInvalid.Error())
		return "", "", false
	}
	if s.rules == nil {
		return invalid()
	}
	ruleID, userID, err := s.rules.Store.StopLink(r.Context(), r.PathValue("token"), s.now())
	if errors.Is(err, rules.ErrStopLinkInvalid) {
		// Guessing links costs as much as guessing a public link (10 misses a minute).
		if !s.publicLinkLimiter.allow(clientIP(r)) {
			writeError(w, http.StatusTooManyRequests, "rate_limited", "too many attempts, try again later")
			return "", "", false
		}
		return invalid()
	}
	if err != nil {
		s.internal(w, err)
		return "", "", false
	}
	return ruleID, userID, true
}

func (s *Server) handleRoutineEmailLink(w http.ResponseWriter, r *http.Request) {
	ruleID, userID, ok := s.routineEmailLink(w, r)
	if !ok {
		return
	}
	stopped, err := s.rules.Store.EmailsStopped(r.Context(), ruleID, userID)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, s.routineEmailJSON(r.Context(), ruleID, stopped))
}

func (s *Server) handleRoutineEmailStop(w http.ResponseWriter, r *http.Request) {
	ruleID, userID, ok := s.routineEmailLink(w, r)
	if !ok {
		return
	}
	changed, err := s.rules.Store.StopEmails(r.Context(), ruleID, userID, s.now())
	if err != nil {
		s.internal(w, err)
		return
	}
	if changed {
		// Like turning off the weekly digest; never the routine's name.
		s.audit.Record(r.Context(), audit.SettingsChanged(userID, "routine_email", "on", "off"))
	}
	writeJSON(w, http.StatusOK, s.routineEmailJSON(r.Context(), ruleID, true))
}

func (s *Server) routineEmailJSON(ctx context.Context, ruleID string, stopped bool) map[string]any {
	return map[string]any{"routine": s.rules.RoutineName(ctx, ruleID), "stopped": stopped}
}
