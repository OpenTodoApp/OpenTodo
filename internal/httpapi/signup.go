package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/mail"
)

// Verified open sign-up (OpenSpec `outgoing-email` D4): the registration is
// answered 202 and the account is created by the mailed link, on POST only
// (mail scanners fetch links).
func (s *Server) registerSignupRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/auth/verify/{token}", s.handlePreviewSignup)
	mux.HandleFunc("POST /api/v1/auth/verify/{token}", s.handleCompleteSignup)
}

// registerWithVerification stores a pending sign-up and mails the link; an
// address that already has an account gets the other message. Both answer the
// same 202, and a failed send keeps the answer.
func (s *Server) registerWithVerification(w http.ResponseWriter, r *http.Request, c credentials) {
	ctx := context.WithoutCancel(r.Context())
	lang := mail.LangFrom(r.Header.Get("Accept-Language"))
	msg := mail.Message{Kind: mail.KindVerifySignup, To: strings.ToLower(strings.TrimSpace(c.Email)), Lang: lang,
		Origin: s.publicOrigin(r), Vars: mail.Vars{Expiry: auth.SignupTTL}}
	accepted := func() { writeJSON(w, http.StatusAccepted, map[string]any{"verificationRequired": true}) }
	if err := auth.CheckPasswordPolicy(c.Password); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_input", err.Error())
		return
	}
	if s.mail.Limited(ctx, msg) {
		accepted()
		return
	}
	secret, existing, err := s.auth.BeginSignup(ctx, c.Email, c.Name, c.Password, lang)
	switch {
	case errors.Is(err, auth.ErrInvalidEmail), errors.Is(err, auth.ErrWeakPassword):
		writeError(w, http.StatusBadRequest, "invalid_input", err.Error())
		return
	case err != nil:
		s.internal(w, err)
		return
	}
	msg.Vars.Existing = existing
	if !existing {
		msg.Vars.Link = s.publicOrigin(r) + "/verify/" + secret
	}
	if err := s.mail.Send(ctx, msg); err != nil && secret != "" {
		if cerr := s.auth.CancelSignup(ctx, secret); cerr != nil {
			s.log.Error("discard unsent sign-up", "err", cerr)
		}
	}
	accepted()
}

func (s *Server) handlePreviewSignup(w http.ResponseWriter, r *http.Request) {
	if !s.limiter.allow(clientIP(r)) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many attempts, try again later")
		return
	}
	p, err := s.auth.PreviewSignup(r.Context(), r.PathValue("token"))
	if errors.Is(err, auth.ErrVerificationInvalid) {
		writeError(w, http.StatusNotFound, "verification_invalid", err.Error())
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func (s *Server) handleCompleteSignup(w http.ResponseWriter, r *http.Request) {
	if !s.limiter.allow(clientIP(r)) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many attempts, try again later")
		return
	}
	if !s.originAllowed(r) {
		writeError(w, http.StatusForbidden, "bad_origin", "cross-site request rejected")
		return
	}
	u, err := s.auth.CompleteSignup(r.Context(), r.PathValue("token"))
	switch {
	case errors.Is(err, auth.ErrVerificationInvalid):
		writeError(w, http.StatusNotFound, "verification_invalid", err.Error())
		return
	case errors.Is(err, auth.ErrSignupClosed):
		writeError(w, http.StatusForbidden, "signup_closed", err.Error())
		return
	case errors.Is(err, auth.ErrEmailTaken):
		writeError(w, http.StatusConflict, "email_taken", err.Error())
		return
	case err != nil:
		s.internal(w, err)
		return
	}
	if s.startSession(w, r, u, http.StatusCreated, false) {
		s.audit.Record(r.Context(), audit.LoginSucceeded(u.ID, u.Email, "register"))
	}
}
