package httpapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/pixari/opentodo/internal/email"
)

// Email to task (OpenSpec change `email-to-task`): each account's secret inbox
// address. The routes require a session or API token and act on the caller's
// account only; they never return the operator's mailbox host or credentials.

// WithEmail (an Option) wires email capture; without it the routes report the
// feature as not enabled by the operator.
func WithEmail(svc *email.Service) Option { return func(s *Server) { s.email = svc } }

func (s *Server) registerEmailRoutes(mux *http.ServeMux) {
	mux.Handle("GET /api/v1/email-inbox", s.requireAuth(s.handleGetEmailInbox))
	mux.Handle("PATCH /api/v1/email-inbox", s.requireAuth(s.handlePatchEmailInbox))
	mux.Handle("POST /api/v1/email-inbox/rotate", s.requireAuth(s.handleRotateEmailInbox))
}

type emailInboxDTO struct {
	EnabledByOperator bool     `json:"enabledByOperator"`
	Address           *string  `json:"address"`
	Enabled           bool     `json:"enabled"`
	Allowlist         []string `json:"allowlist"`
	HourlyLimit       int      `json:"hourlyLimit"`
}

func (s *Server) emailInboxDTO(in email.Inbox) emailInboxDTO {
	addr := s.email.Address(in.Secret)
	return emailInboxDTO{EnabledByOperator: true, Address: &addr, Enabled: in.Enabled, Allowlist: in.Allowlist, HourlyLimit: email.HourlyCap}
}

// emailEnabled answers 409 email_disabled unless the operator configured email
// capture.
func (s *Server) emailEnabled(w http.ResponseWriter) bool {
	if s.email == nil || !s.email.Enabled() {
		writeError(w, http.StatusConflict, "email_disabled", "email to task is not enabled on this server (the operator sets OPENTODO_EMAIL_*)")
		return false
	}
	return true
}

func (s *Server) handleGetEmailInbox(w http.ResponseWriter, r *http.Request) {
	if s.email == nil || !s.email.Enabled() {
		writeJSON(w, http.StatusOK, emailInboxDTO{Allowlist: []string{}, HourlyLimit: email.HourlyCap})
		return
	}
	in, err := s.email.Store().Get(r.Context(), userFrom(r.Context()).ID)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, s.emailInboxDTO(in))
}

func (s *Server) handlePatchEmailInbox(w http.ResponseWriter, r *http.Request) {
	if !s.emailEnabled(w) {
		return
	}
	uid := userFrom(r.Context()).ID
	if !s.emailLimiter.allow(uid) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many changes, try again later")
		return
	}
	var in struct {
		Enabled   *bool           `json:"enabled"`
		Allowlist json.RawMessage `json:"allowlist"`
	}
	if err := readJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	var allow []string
	if len(in.Allowlist) > 0 && !bytes.Equal(bytes.TrimSpace(in.Allowlist), []byte("null")) {
		var list []string
		if err := json.Unmarshal(in.Allowlist, &list); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_input", "allowlist: "+email.ErrInvalidAllowlist.Error())
			return
		}
		norm, err := email.NormalizeAllowlist(list)
		if errors.Is(err, email.ErrInvalidAllowlist) {
			writeError(w, http.StatusBadRequest, "invalid_input", "allowlist: "+err.Error())
			return
		}
		allow = norm
	}
	if in.Enabled == nil && allow == nil {
		writeError(w, http.StatusBadRequest, "invalid_input", "nothing to change: send enabled and/or allowlist")
		return
	}
	got, err := s.email.Store().Update(r.Context(), uid, in.Enabled, allow)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, s.emailInboxDTO(got))
}

func (s *Server) handleRotateEmailInbox(w http.ResponseWriter, r *http.Request) {
	if !s.emailEnabled(w) {
		return
	}
	uid := userFrom(r.Context()).ID
	if !s.emailLimiter.allow(uid) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many changes, try again later")
		return
	}
	got, err := s.email.Store().Rotate(r.Context(), uid)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, s.emailInboxDTO(got))
}
