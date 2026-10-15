package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	netmail "net/mail"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/mail"
)

// User administration routes (OpenSpec change `user-management`, design D8).
// Every /users and /me/password route requires a session or token and, for
// cookie sessions, a fresh re-authentication (requireFresh, carried over from
// mfa-totp); the two reset-link routes are public, rate limited per address
// and check the origin on POST like registration. All of this is server-side
// account data: never written to the op log, never synced.
func (s *Server) registerUserRoutes(mux *http.ServeMux) {
	mux.Handle("GET /api/v1/users", s.requireAuth(s.handleListUsers))
	mux.Handle("PUT /api/v1/users/{id}/role", s.requireAuth(s.requireFresh(s.handleSetRole)))
	mux.Handle("POST /api/v1/users/{id}/deactivate", s.requireAuth(s.requireFresh(s.handleDeactivate)))
	mux.Handle("POST /api/v1/users/{id}/reactivate", s.requireAuth(s.requireFresh(s.handleReactivate)))
	mux.Handle("DELETE /api/v1/users/{id}", s.requireAuth(s.requireFresh(s.handleDeleteUser)))
	mux.Handle("POST /api/v1/users/{id}/password-reset", s.requireAuth(s.requireFresh(s.handleIssueReset)))
	mux.Handle("POST /api/v1/users/{id}/transfer-ownership", s.requireAuth(s.requireFresh(s.handleTransferOwnership)))
	mux.Handle("POST /api/v1/me/password", s.requireAuth(s.requireFresh(s.handleChangePassword)))
	mux.HandleFunc("POST /api/v1/auth/password-reset", s.handleRequestPasswordReset)
	mux.HandleFunc("GET /api/v1/password-resets/{token}", s.handlePreviewReset)
	mux.HandleFunc("POST /api/v1/password-resets/{token}", s.handleUseReset)
}

// userError maps the auth package's administration errors onto the envelope.
func (s *Server) userError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, auth.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", "account not found")
	case errors.Is(err, auth.ErrSelfAction):
		writeError(w, http.StatusConflict, "self_action", err.Error())
	case errors.Is(err, auth.ErrForbidden):
		writeError(w, http.StatusForbidden, "forbidden", err.Error())
	case errors.Is(err, auth.ErrAccountDeactivated):
		writeError(w, http.StatusConflict, "account_deactivated", err.Error())
	case errors.Is(err, auth.ErrAccountActive):
		writeError(w, http.StatusConflict, "account_active", err.Error())
	case errors.Is(err, auth.ErrConfirmationMismatch):
		writeError(w, http.StatusBadRequest, "confirmation_mismatch", err.Error())
	case errors.Is(err, auth.ErrInvalidRole):
		writeError(w, http.StatusBadRequest, "invalid_input", "role: "+err.Error())
	case errors.Is(err, auth.ErrInvalidResetExpiry):
		writeError(w, http.StatusBadRequest, "invalid_input", err.Error())
	case errors.Is(err, auth.ErrWeakPassword):
		writeError(w, http.StatusBadRequest, "invalid_input", err.Error())
	case errors.Is(err, auth.ErrInvalidCredentials):
		writeError(w, http.StatusForbidden, "invalid_credentials", "the password is not correct")
	case errors.Is(err, auth.ErrResetInvalid):
		writeError(w, http.StatusNotFound, "reset_invalid", err.Error())
	default:
		s.internal(w, err)
	}
}

// adminActor answers 403 for members, then 429 once the acting account used
// its hourly budget of mutating administration requests (design D9). It
// returns nil when it answered.
func (s *Server) adminActor(w http.ResponseWriter, r *http.Request) *auth.User {
	u := userFrom(r.Context())
	if !s.auth.CanListUsers(u) {
		writeError(w, http.StatusForbidden, "forbidden", "only the owner and admins can manage accounts")
		return nil
	}
	if !s.adminLimiter.allow(u.ID) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many administrative actions, try again later")
		return nil
	}
	return u
}

// readOptionalJSON decodes a body that may be empty.
func readOptionalJSON(r *http.Request, dst any) error {
	if err := readJSON(r, dst); err != nil && !errors.Is(err, io.EOF) {
		return err
	}
	return nil
}

func (s *Server) handleListUsers(w http.ResponseWriter, r *http.Request) {
	if !s.auth.CanListUsers(userFrom(r.Context())) {
		writeError(w, http.StatusForbidden, "forbidden", "only the owner and admins can list accounts")
		return
	}
	list, err := s.auth.ListUsers(r.Context())
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": list})
}

func (s *Server) handleSetRole(w http.ResponseWriter, r *http.Request) {
	actor := s.adminActor(w, r)
	if actor == nil {
		return
	}
	var in struct {
		Role string `json:"role"`
	}
	if err := readJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	u, err := s.auth.SetRole(r.Context(), actor.ID, r.PathValue("id"), in.Role)
	if err != nil {
		s.userError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": u})
}

func (s *Server) handleDeactivate(w http.ResponseWriter, r *http.Request) {
	actor := s.adminActor(w, r)
	if actor == nil {
		return
	}
	u, err := s.auth.Deactivate(r.Context(), actor.ID, r.PathValue("id"))
	if err != nil {
		s.userError(w, err)
		return
	}
	// Sessions and tokens are gone; end the open streams now so the devices
	// learn it at once (their reconnect gets 401).
	s.sync.Notifier().CloseUser(u.ID)
	writeJSON(w, http.StatusOK, map[string]any{"user": u})
}

func (s *Server) handleReactivate(w http.ResponseWriter, r *http.Request) {
	actor := s.adminActor(w, r)
	if actor == nil {
		return
	}
	u, err := s.auth.Reactivate(r.Context(), actor.ID, r.PathValue("id"))
	if err != nil {
		s.userError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": u})
}

func (s *Server) handleDeleteUser(w http.ResponseWriter, r *http.Request) {
	actor := s.adminActor(w, r)
	if actor == nil {
		return
	}
	var in struct {
		ConfirmEmail string `json:"confirmEmail"`
	}
	if err := readOptionalJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	id := r.PathValue("id")
	notify, err := s.auth.DeleteUser(r.Context(), actor.ID, id, in.ConfirmEmail)
	if err != nil {
		s.userError(w, err)
		return
	}
	s.sync.Notifier().CloseUser(id)
	// Their own assistant keys go with the account (in-app-assistant D4).
	if s.assistant != nil {
		if err := s.assistant.Store.RemoveUserKeys(id); err != nil {
			s.log.Error("assistant keys of a deleted account not removed", "err", err)
		}
	}
	// Members of projects the account owned or joined re-sync their membership.
	s.sync.NotifyMembership(notify)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleIssueReset(w http.ResponseWriter, r *http.Request) {
	actor := s.adminActor(w, r)
	if actor == nil {
		return
	}
	var in struct {
		ExpiresInHours *float64 `json:"expiresInHours"`
		Send           bool     `json:"send"`
	}
	if err := readOptionalJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	ttl := auth.DefaultResetTTL
	if in.ExpiresInHours != nil {
		h := *in.ExpiresInHours
		if h != float64(int64(h)) || h < 1 || h > 72 {
			writeError(w, http.StatusBadRequest, "invalid_input", "expiresInHours: "+auth.ErrInvalidResetExpiry.Error())
			return
		}
		ttl = time.Duration(h) * time.Hour
	}
	var msg mail.Message
	if in.Send {
		// Sending by email (OpenSpec `outgoing-email` D6): the administrator never
		// handles the secret; a failure leaves no link pending.
		if !s.mailEnabled(r.Context()) {
			writeError(w, http.StatusConflict, "smtp_disabled", "outgoing email is not configured")
			return
		}
		target, err := s.auth.UserByID(r.Context(), r.PathValue("id"))
		if err != nil {
			s.userError(w, err)
			return
		}
		msg = mail.Message{Kind: mail.KindPasswordReset, To: target.Email, Lang: mail.LangFrom(r.Header.Get("Accept-Language")),
			Origin: s.publicOrigin(r), UserID: target.ID, ActorID: actor.ID, Vars: mail.Vars{Expiry: ttl}}
		if s.mail.Limited(r.Context(), msg) {
			s.mailSendError(w, mail.ErrRateLimited)
			return
		}
	}
	pr, secret, err := s.auth.IssuePasswordReset(r.Context(), actor.ID, r.PathValue("id"), ttl)
	if err != nil {
		s.userError(w, err)
		return
	}
	link := s.publicOrigin(r) + "/reset/" + secret
	if in.Send {
		msg.Vars.Link = link
		if err := s.mail.Send(r.Context(), msg); err != nil {
			if rerr := s.auth.RevokePasswordReset(context.WithoutCancel(r.Context()), pr.ID); rerr != nil {
				s.log.Error("revoke unsent reset link", "err", rerr)
			}
			s.mailSendError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"expiresAt": pr.ExpiresAt, "sent": true})
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"expiresAt": pr.ExpiresAt, "link": link})
}

func (s *Server) handleTransferOwnership(w http.ResponseWriter, r *http.Request) {
	actor := s.adminActor(w, r)
	if actor == nil {
		return
	}
	var in struct {
		Password string `json:"password"`
	}
	if err := readJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	u, err := s.auth.TransferOwnership(r.Context(), actor.ID, r.PathValue("id"), in.Password)
	if err != nil {
		s.userError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": u})
}

func (s *Server) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	if !s.passwordLimiter.allow(u.ID) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many password changes, try again later")
		return
	}
	var in struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	if err := readJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	keep := ""
	if sess := sessionFrom(r.Context()); sess != nil {
		keep = sess.TokenHash
	}
	if err := s.auth.ChangePassword(r.Context(), u.ID, in.CurrentPassword, in.NewPassword, keep); err != nil {
		s.userError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handlePreviewReset is public: the holder of a reset link is not signed in.
// It shares the sign-in limiter and every failure is the same 404.
func (s *Server) handlePreviewReset(w http.ResponseWriter, r *http.Request) {
	if !s.limiter.allow(clientIP(r)) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many attempts, try again later")
		return
	}
	p, err := s.auth.PreviewPasswordReset(r.Context(), r.PathValue("token"))
	if err != nil {
		s.userError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func (s *Server) handleUseReset(w http.ResponseWriter, r *http.Request) {
	if !s.limiter.allow(clientIP(r)) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many attempts, try again later")
		return
	}
	if !s.originAllowed(r) {
		writeError(w, http.StatusForbidden, "bad_origin", "cross-site request rejected")
		return
	}
	var in struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&in); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid JSON body")
		return
	}
	if err := s.auth.ResetPassword(r.Context(), r.PathValue("token"), in.Password); err != nil {
		s.userError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// resetMinDuration pads every self-service reset answer so the response time
// does not reveal whether the address has an account (design D5).
var resetMinDuration = 200 * time.Millisecond

// handleRequestPasswordReset is the anonymous "Forgot password?" request: always
// 202 with the same body; a link is mailed only for an active account while
// password sign-in is allowed.
func (s *Server) handleRequestPasswordReset(w http.ResponseWriter, r *http.Request) {
	if !s.mailEnabled(r.Context()) {
		writeError(w, http.StatusNotFound, "smtp_disabled", "password reset by email is not available on this server")
		return
	}
	if !s.originAllowed(r) {
		writeError(w, http.StatusForbidden, "bad_origin", "cross-site request rejected")
		return
	}
	var in struct {
		Email string `json:"email"`
	}
	if err := readJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_input", "a JSON body with an email is required")
		return
	}
	addr, err := netmail.ParseAddress(strings.TrimSpace(in.Email))
	if err != nil || addr.Name != "" || len(in.Email) > 320 {
		writeError(w, http.StatusBadRequest, "invalid_input", "email: enter one valid address")
		return
	}
	if !s.limiter.allow(clientIP(r)) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many attempts, try again in a minute")
		return
	}
	start := time.Now()
	defer func() {
		if d := resetMinDuration - time.Since(start); d > 0 {
			time.Sleep(d)
		}
		writeJSON(w, http.StatusAccepted, map[string]any{"ok": true})
	}()
	if s.auth.SSOOnly(r.Context()) {
		return
	}
	ctx := context.WithoutCancel(r.Context())
	msg := mail.Message{Kind: mail.KindPasswordReset, To: strings.ToLower(addr.Address), Lang: mail.LangFrom(r.Header.Get("Accept-Language")),
		Origin: s.publicOrigin(r), Vars: mail.Vars{Expiry: auth.DefaultResetTTL}}
	if s.mail.Limited(ctx, msg) {
		return
	}
	u, pr, secret, err := s.auth.RequestPasswordReset(ctx, addr.Address)
	if err != nil {
		s.log.Error("password reset request", "err", err)
		return
	}
	if u == nil {
		return
	}
	msg.To, msg.UserID, msg.Vars.Link = u.Email, u.ID, s.publicOrigin(r)+"/reset/"+secret
	if err := s.mail.Send(ctx, msg); err != nil {
		if rerr := s.auth.RevokePasswordReset(ctx, pr.ID); rerr != nil {
			s.log.Error("revoke unsent reset link", "err", rerr)
		}
	}
}
