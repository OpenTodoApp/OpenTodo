package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/mail"
)

// Profile routes (OpenSpec change settings-refresh, design D10): every user
// changes their own name, email and picture. Server-side account data like the
// name set at sign-up: never written to the op log. The email change needs a
// recently confirmed session; with outgoing email and a base URL it waits for
// a link sent to the new address, otherwise it applies at once.
func (s *Server) registerProfileRoutes(mux *routes) {
	mux.handle("GET /api/v1/me/profile", signedIn, s.handleGetProfile)
	mux.handle("PATCH /api/v1/me/profile", signedIn.fullTokens().demoDenied(), s.handlePatchProfile)
	mux.handle("POST /api/v1/me/email", signedIn.sessionOnly().recent().demoDenied(), s.handleChangeEmail)
	mux.handle("DELETE /api/v1/me/email", signedIn.sessionOnly().demoDenied(), s.handleCancelEmailChange)
	mux.handle("POST /api/v1/me/email/confirm", signedIn.sessionOnly().demoDenied(), s.handleConfirmEmail)
	mux.handle("PUT /api/v1/me/avatar", signedIn.fullTokens().demoDenied(), s.handlePutAvatar)
	mux.handle("DELETE /api/v1/me/avatar", signedIn.fullTokens().demoDenied(), s.handleDeleteAvatar)
	mux.handle("GET /api/v1/users/{id}/avatar", signedIn, s.handleGetAvatar)
}

// profileView is the Profile card's data: the account and its profile info.
type profileView struct {
	User *auth.User `json:"user"`
	*auth.ProfileInfo
	// EmailByLink says an email change waits for a link (outgoing email and a
	// base URL are set); otherwise it applies at once.
	EmailByLink bool `json:"emailByLink"`
}

func (s *Server) profileView(ctx context.Context, u *auth.User) (*profileView, error) {
	p, err := s.auth.Profile(ctx, u)
	if err != nil {
		return nil, err
	}
	return &profileView{User: u, ProfileInfo: p, EmailByLink: s.emailByLink(ctx)}, nil
}

// emailByLink reports whether an email change is confirmed by a link.
func (s *Server) emailByLink(ctx context.Context) bool {
	return s.mailEnabled(ctx) && s.cfg.Origin() != ""
}

func (s *Server) writeProfile(w http.ResponseWriter, r *http.Request, u *auth.User) {
	v, err := s.profileView(r.Context(), u)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, v)
}

func (s *Server) handleGetProfile(w http.ResponseWriter, r *http.Request) {
	s.writeProfile(w, r, userFrom(r.Context()))
}

func (s *Server) handlePatchProfile(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	var in struct {
		Name *string `json:"name"`
	}
	if err := readJSON(r, &in); err != nil {
		badBodyWith(w, err, "invalid_input", "a JSON body with a name is required")
		return
	}
	if in.Name == nil {
		writeError(w, http.StatusBadRequest, "invalid_input", "name: required")
		return
	}
	updated, err := s.auth.SetName(r.Context(), u.ID, *in.Name)
	if err != nil {
		s.profileError(w, err)
		return
	}
	// Members of shared projects see the new name on their next sync.
	s.notifyCoMembers(r.Context(), u.ID)
	s.writeProfile(w, r, updated)
}

func (s *Server) handleChangeEmail(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	var in struct {
		Email string `json:"email"`
	}
	if err := readJSON(r, &in); err != nil {
		badBodyWith(w, err, "invalid_input", "a JSON body with an email is required")
		return
	}
	if !s.emailChangeLimiter.allow(u.ID) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many email changes, try again in an hour")
		return
	}
	ctx := r.Context()
	if !s.emailByLink(ctx) {
		updated, err := s.auth.ChangeEmailNow(ctx, u, in.Email)
		if err != nil {
			s.profileError(w, err)
			return
		}
		s.notifyCoMembers(ctx, u.ID)
		s.writeProfile(w, r, updated)
		return
	}
	secret, email, err := s.auth.RequestEmailChange(ctx, u, in.Email)
	if err != nil {
		s.profileError(w, err)
		return
	}
	origin, lang := s.cfg.Origin(), mail.LangFrom(r.Header.Get("Accept-Language"))
	send := context.WithoutCancel(ctx)
	link := mail.Message{Kind: mail.KindEmailChange, To: email, Lang: lang, Origin: origin, UserID: u.ID, ActorID: u.ID,
		Vars: mail.Vars{Link: origin + "/confirm-email/" + secret, Expiry: auth.EmailChangeTTL}}
	if err := s.mail.Send(send, link); err != nil {
		if cerr := s.auth.CancelEmailChange(send, u.ID); cerr != nil {
			s.log.Error("cancel unsent email change", "err", cerr)
		}
		writeError(w, http.StatusBadGateway, "email_failed", "the confirmation could not be sent; nothing changed, try again")
		return
	}
	// The old address hears about it; a failure there does not undo the request.
	notice := mail.Message{Kind: mail.KindEmailChangeNotice, To: u.Email, Lang: lang, Origin: origin, UserID: u.ID, ActorID: u.ID}
	if err := s.mail.Send(send, notice); err != nil {
		s.log.Warn("email change notice not sent", "err", err)
	}
	s.writeProfile(w, r, u)
}

func (s *Server) handleCancelEmailChange(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	if err := s.auth.CancelEmailChange(r.Context(), u.ID); err != nil {
		s.internal(w, err)
		return
	}
	s.writeProfile(w, r, u)
}

func (s *Server) handleConfirmEmail(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	var in struct {
		Token string `json:"token"`
	}
	if err := readJSON(r, &in); err != nil || strings.TrimSpace(in.Token) == "" {
		writeError(w, http.StatusBadRequest, "invalid_input", "token: required")
		return
	}
	updated, err := s.auth.ConfirmEmailChange(r.Context(), u, strings.TrimSpace(in.Token))
	if err != nil {
		s.profileError(w, err)
		return
	}
	s.notifyCoMembers(r.Context(), u.ID)
	s.writeProfile(w, r, updated)
}

// profileError maps the profile errors onto the envelope.
func (s *Server) profileError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, auth.ErrInvalidName):
		writeError(w, http.StatusBadRequest, "invalid_input", "name: "+err.Error())
	case errors.Is(err, auth.ErrInvalidEmail):
		writeError(w, http.StatusBadRequest, "invalid_input", "email: enter one valid address")
	case errors.Is(err, auth.ErrSameEmail):
		writeError(w, http.StatusBadRequest, "invalid_input", "email: "+err.Error())
	case errors.Is(err, auth.ErrEmailTaken):
		writeError(w, http.StatusConflict, "email_taken", "another account uses this email")
	case errors.Is(err, auth.ErrEmailManaged):
		writeError(w, http.StatusForbidden, "forbidden", err.Error())
	case errors.Is(err, auth.ErrForbidden):
		writeError(w, http.StatusForbidden, "forbidden", "this link belongs to another account")
	case errors.Is(err, auth.ErrInvalidLink):
		writeError(w, http.StatusBadRequest, "invalid_token", err.Error())
	case errors.Is(err, auth.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", "account not found")
	default:
		s.internal(w, err)
	}
}

// notifyCoMembers wakes the devices of everyone sharing a project with the
// account, so names and pictures in member lists refresh on their next sync.
func (s *Server) notifyCoMembers(ctx context.Context, userID string) {
	ms, err := s.sync.Memberships(ctx, userID)
	if err != nil {
		s.log.Warn("profile change: memberships", "err", err)
		return
	}
	seen := map[string]bool{}
	var audience []string
	for _, m := range ms {
		for _, mem := range m.Members {
			if mem.UserID != userID && !seen[mem.UserID] {
				seen[mem.UserID] = true
				audience = append(audience, mem.UserID)
			}
		}
	}
	if len(audience) > 0 {
		s.sync.NotifyMembership(audience)
	}
}
