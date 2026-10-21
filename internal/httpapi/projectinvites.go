package httpapi

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/e2ee"
	"github.com/pixari/opentodo/internal/mail"
	"github.com/pixari/opentodo/internal/settings"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// Project invite links (OpenSpec change `project-invite-links`). Managing a
// project's links needs the owner or admin role on that project; the preview
// is public (the invitee may have no account yet) and shares the sign-in
// limiter; accepting needs a session or full token. Links are server-side
// account data: nothing here writes an op except the membership change, which
// goes through sync.AddMemberTx like adding a member by email.

// membersInviteKey is the owner switch "Members can invite new people with
// project links" (design D6): a JSON boolean, false when unset.
const membersInviteKey = "project_invites.members_create_accounts"

func (s *Server) registerProjectInviteRoutes(mux *routes) {
	s.projectInviteLimiter = newRateLimiter(20, time.Hour)
	mux.handle("GET /api/v1/projects/{id}/invites", signedIn.demoDenied(), s.handleListProjectInvites)
	mux.handle("POST /api/v1/projects/{id}/invites", signedIn.recent().demoDenied(), s.handleCreateProjectInvite)
	mux.handle("DELETE /api/v1/projects/{id}/invites/{inviteId}", signedIn.demoDenied(), s.handleRevokeProjectInvite)
	mux.handle("GET /api/v1/project-invites/{token}", public("someone with an invite link previews the project before joining").demoDenied(), s.handlePreviewProjectInvite)
	mux.handle("POST /api/v1/project-invites/{token}/accept", signedIn.demoDenied(), s.handleAcceptProjectInvite)
	mux.handle("GET /api/v1/settings/project-invites", signedIn, s.handleGetProjectInviteSettings)
	mux.handle("PUT /api/v1/settings/project-invites", ownerOnly("manage the project invite setting").demoDenied(), s.handlePutProjectInviteSettings)
}

// membersMayInvite reads the owner switch; an unreadable setting counts as off.
func (s *Server) membersMayInvite(ctx context.Context) bool {
	var on bool
	if _, err := settings.New(s.sync.DB()).Get(ctx, membersInviteKey, &on); err != nil {
		s.log.Error("read project invite setting", "err", err)
		return false
	}
	return on
}

// projectManager answers the request and returns "" unless the caller is the
// owner or an admin of the project; otherwise it returns the caller's role and
// whether the project is shared yet.
func (s *Server) projectManager(w http.ResponseWriter, r *http.Request) (string, bool) {
	m, err := s.sync.ProjectMembers(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"))
	if err != nil {
		s.memberError(w, err)
		return "", false
	}
	if m.Role != opsync.RoleOwner && m.Role != opsync.RoleAdmin {
		writeError(w, http.StatusForbidden, "forbidden", "only the project's owner and admins can manage invite links")
		return "", false
	}
	return m.Role, len(m.Members) > 1
}

func (s *Server) handleCreateProjectInvite(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	u := userFrom(ctx)
	role, shared := s.projectManager(w, r)
	if role == "" {
		return
	}
	var in struct {
		Role           string   `json:"role"`
		Email          string   `json:"email"`
		ExpiresInHours *float64 `json:"expiresInHours"`
		Send           bool     `json:"send"`
	}
	if err := readJSON(r, &in); err != nil {
		badBody(w, err)
		return
	}
	if !opsync.ValidMemberRole(in.Role) {
		writeError(w, http.StatusBadRequest, "invalid_input", "role: must be viewer, editor or admin")
		return
	}
	if !opsync.CanGrant(role, in.Role) {
		writeError(w, http.StatusForbidden, "forbidden", "only the project's owner can invite admins")
		return
	}
	ttl := auth.DefaultInvitationTTL
	if in.ExpiresInHours != nil {
		h := *in.ExpiresInHours
		if h != float64(int64(h)) || h < 1 || h > 720 {
			writeError(w, http.StatusBadRequest, "invalid_input", "expiresInHours: "+auth.ErrInvalidExpiry.Error())
			return
		}
		ttl = time.Duration(h) * time.Hour
	}
	// Accepting shares a project that is not shared yet, which an encrypted
	// account cannot do (OpenSpec `e2ee`, design D8; same refusal as sharing).
	if !shared && s.refuseIfEncrypted(w, r, "sharing is not available for accounts with end-to-end encryption yet") {
		return
	}
	msg, ok := s.inviteMessage(w, r, in.Send, in.Email, mail.KindProjectInvite, u, in.Role)
	if !ok {
		return
	}
	if !s.projectInviteLimiter.allow(u.ID) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many invite links created, try again later")
		return
	}
	inv, secret, err := s.auth.CreateProjectInvite(ctx, u, r.PathValue("id"), in.Role, in.Email, ttl)
	switch {
	case errors.Is(err, auth.ErrInvalidEmail):
		writeError(w, http.StatusBadRequest, "invalid_input", "email: "+err.Error())
		return
	case errors.Is(err, auth.ErrInvalidExpiry), errors.Is(err, auth.ErrInvalidProjectRole):
		writeError(w, http.StatusBadRequest, "invalid_input", err.Error())
		return
	case err != nil:
		s.internal(w, err)
		return
	}
	link := s.inviteLinkOrigin(r, msg) + "/invite/p/" + secret
	out := map[string]any{
		"invite":      inv,
		"link":        link,
		"newAccounts": s.auth.MayCreateAccount(u.Role, s.membersMayInvite(ctx)),
	}
	if in.Send {
		// The message names the inviter and the role, never the project: its
		// name is content (design D6).
		msg.Vars.Link, msg.Vars.Expiry = link, ttl
		if err := s.mail.Send(ctx, msg); err != nil {
			if rerr := s.auth.RevokeProjectInvite(context.WithoutCancel(ctx), u.ID, r.PathValue("id"), inv.ID); rerr != nil {
				s.log.Error("revoke unsent project invite", "err", rerr)
			}
			s.mailSendError(w, err)
			return
		}
		out["sent"] = true
	}
	writeJSON(w, http.StatusCreated, out)
}

func (s *Server) handleListProjectInvites(w http.ResponseWriter, r *http.Request) {
	if role, _ := s.projectManager(w, r); role == "" {
		return
	}
	list, err := s.auth.ListProjectInvites(r.Context(), r.PathValue("id"))
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"invites": list})
}

func (s *Server) handleRevokeProjectInvite(w http.ResponseWriter, r *http.Request) {
	if role, _ := s.projectManager(w, r); role == "" {
		return
	}
	err := s.auth.RevokeProjectInvite(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"), r.PathValue("inviteId"))
	switch {
	case errors.Is(err, auth.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", "invite link not found")
	case errors.Is(err, auth.ErrInvitationSpent):
		writeError(w, http.StatusConflict, "invitation_spent", "this invite link has already been used")
	case err != nil:
		s.internal(w, err)
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}

// usableProjectInvite re-checks a pending link against current state (design
// D3): the creator is active, the project is live, and the creator may still
// grant the role. It returns the project's stored name and whether it is shared.
func (s *Server) usableProjectInvite(ctx context.Context, inv *auth.PendingProjectInvite) (name string, shared, ok bool, err error) {
	if inv.CreatorDeactivated {
		return "", false, false, nil
	}
	live, shared, role, err := s.sync.ProjectStatus(ctx, inv.CreatedBy, inv.ProjectID)
	if err != nil || !live || !opsync.CanGrant(role, inv.Role) {
		return "", false, false, err
	}
	name, live, err = s.sync.ProjectName(ctx, inv.ProjectID)
	if err != nil || !live {
		return "", false, false, err
	}
	return name, shared, true, nil
}

// resolveProjectInvite looks a secret up and re-checks it. On failure it has
// answered the request (the uniform 404 for every invalid state) and returns nil.
func (s *Server) resolveProjectInvite(w http.ResponseWriter, r *http.Request, secret string) (*auth.PendingProjectInvite, string, bool) {
	inv, err := s.auth.LookupProjectInvite(r.Context(), secret)
	if errors.Is(err, auth.ErrInvitationInvalid) {
		writeError(w, http.StatusNotFound, "invitation_invalid", auth.ErrInvitationInvalid.Error())
		return nil, "", false
	}
	if err != nil {
		s.internal(w, err)
		return nil, "", false
	}
	name, shared, ok, err := s.usableProjectInvite(r.Context(), inv)
	if err != nil {
		s.internal(w, err)
		return nil, "", false
	}
	if !ok {
		writeError(w, http.StatusNotFound, "invitation_invalid", auth.ErrInvitationInvalid.Error())
		return nil, "", false
	}
	if !shared {
		// Joining shares the project; an encrypted creator cannot share it (D3).
		on, err := s.encryptionEnabled(r.Context(), inv.CreatedBy)
		if err != nil {
			s.internal(w, err)
			return nil, "", false
		}
		if on {
			writeError(w, http.StatusConflict, "encryption_enabled", "this project cannot be shared yet: its owner uses end-to-end encryption")
			return nil, "", false
		}
	}
	return inv, name, true
}

// handlePreviewProjectInvite is public. The invite-link limiter makes guessing
// links cost as much as guessing passwords, and it returns no ids.
func (s *Server) handlePreviewProjectInvite(w http.ResponseWriter, r *http.Request) {
	if !s.invitePreviewLimiter.allow(clientIP(r)) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many attempts, try again later")
		return
	}
	ctx := r.Context()
	inv, name, ok := s.resolveProjectInvite(w, r, r.PathValue("token"))
	if !ok {
		return
	}
	out := map[string]any{
		"inviterName": inv.CreatedByName,
		"projectName": e2ee.Display(name),
		"role":        inv.Role,
		"email":       inv.Email,
		"expiresAt":   inv.ExpiresAt,
		// SSO-only mode creates accounts through the provider only (design D5).
		"canCreateAccount": s.auth.MayCreateAccount(inv.CreatorRole, s.membersMayInvite(ctx)) && !s.auth.SSOOnly(ctx),
	}
	// A signed-in visitor learns whether they are on the project already.
	if u, _, err := s.authenticate(r); err == nil && u != nil {
		if _, _, role, err := s.sync.ProjectStatus(ctx, u.ID, inv.ProjectID); err == nil {
			out["alreadyMember"] = role != ""
		}
	}
	writeJSON(w, http.StatusOK, out)
}

// projectJoiner adapts sync.AddMemberTx to the auth package's hook.
func (s *Server) projectJoiner(ctx context.Context, tx *sql.Tx, inviterID, projectID, userID, role string) ([]string, error) {
	ch, err := s.sync.AddMemberTx(ctx, tx, inviterID, projectID, userID, role)
	return ch.Audience, err
}

// projectInviteError maps acceptance failures onto the envelope. Rights that
// changed between the preview and the acceptance answer the uniform 404.
func (s *Server) projectInviteError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, auth.ErrInvitationInvalid), errors.Is(err, opsync.ErrForbidden), errors.Is(err, opsync.ErrNotFound), errors.Is(err, opsync.ErrInvalidMember),
		errors.Is(err, opsync.ErrProjectIDConflict):
		writeError(w, http.StatusNotFound, "invitation_invalid", auth.ErrInvitationInvalid.Error())
	case errors.Is(err, auth.ErrInvitationEmailMismatch):
		writeError(w, http.StatusForbidden, "invitation_email_mismatch", "this invite link was issued for a different email address")
	case errors.Is(err, auth.ErrMemberLimit):
		writeError(w, http.StatusForbidden, "limit_members", err.Error())
	case errors.Is(err, opsync.ErrAlreadyMember):
		writeError(w, http.StatusConflict, "already_member", "you are already a member of this project")
	case errors.Is(err, auth.ErrProjectInviteNotAllowed):
		writeError(w, http.StatusForbidden, "project_invite_not_allowed", err.Error())
	case errors.Is(err, auth.ErrEmailTaken):
		writeError(w, http.StatusConflict, "email_taken", err.Error())
	case errors.Is(err, auth.ErrInvalidEmail), errors.Is(err, auth.ErrWeakPassword):
		writeError(w, http.StatusBadRequest, "invalid_input", err.Error())
	default:
		s.internal(w, err)
	}
}

func (s *Server) handleAcceptProjectInvite(w http.ResponseWriter, r *http.Request) {
	if !s.invitePreviewLimiter.allow(clientIP(r)) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many attempts, try again later")
		return
	}
	u := userFrom(r.Context())
	secret := r.PathValue("token")
	if _, _, ok := s.resolveProjectInvite(w, r, secret); !ok {
		return
	}
	inv, audience, err := s.auth.AcceptProjectInvite(r.Context(), secret, u, s.projectJoiner)
	if err != nil {
		s.projectInviteError(w, err)
		return
	}
	s.sync.NotifyMembership(audience)
	writeJSON(w, http.StatusOK, map[string]any{"projectId": inv.ProjectID, "role": inv.Role})
}

// registerWithProjectInvite is POST /api/v1/auth/register with a projectInvite
// secret: account, membership and spend in one transaction (design D4). The
// caller has applied the limiter, the origin check and SSO-only mode.
func (s *Server) registerWithProjectInvite(w http.ResponseWriter, r *http.Request, c credentials) {
	ctx := r.Context()
	if _, _, ok := s.resolveProjectInvite(w, r, c.ProjectInvite); !ok {
		return
	}
	u, inv, audience, err := s.auth.RegisterWithProjectInvite(ctx, c.Email, c.Name, c.Password, c.ProjectInvite, s.membersMayInvite(ctx), s.projectJoiner)
	if err != nil {
		s.projectInviteError(w, err)
		return
	}
	s.sync.NotifyMembership(audience)
	if _, ok := s.issueSession(w, r, u, false); !ok {
		return
	}
	s.audit.Record(ctx, audit.LoginSucceeded(u.ID, u.Email, "register"))
	writeJSON(w, http.StatusCreated, map[string]any{"user": u, "projectId": inv.ProjectID, "role": inv.Role})
}

func (s *Server) handleGetProjectInviteSettings(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"membersCanInviteNewPeople": s.membersMayInvite(r.Context())})
}

func (s *Server) handlePutProjectInviteSettings(w http.ResponseWriter, r *http.Request) {
	var in struct {
		MembersCanInviteNewPeople *bool `json:"membersCanInviteNewPeople"`
	}
	if err := readJSON(r, &in); err != nil || in.MembersCanInviteNewPeople == nil {
		badBodyWith(w, err, "invalid_input", `body must be {"membersCanInviteNewPeople": true|false}`)
		return
	}
	before := s.membersMayInvite(r.Context())
	if err := settings.New(s.sync.DB()).Set(r.Context(), membersInviteKey, *in.MembersCanInviteNewPeople); err != nil {
		s.internal(w, err)
		return
	}
	if before != *in.MembersCanInviteNewPeople {
		s.audit.Record(r.Context(), audit.SettingsChanged(userFrom(r.Context()).ID, membersInviteKey, boolText(before), boolText(*in.MembersCanInviteNewPeople)))
	}
	writeJSON(w, http.StatusOK, map[string]any{"membersCanInviteNewPeople": *in.MembersCanInviteNewPeople})
}

// redactPath keeps link secrets out of the request log: a path segment that
// carries an invitation, project invite, sign-up verification or reset secret
// is replaced, and so is a task page's secret, which is the segment after /t/ or
// /api/v1/pages/ (task-pages).
func redactPath(p string) string {
	for _, prefix := range []string{"/t/", "/api/v1/pages/"} {
		if rest, ok := strings.CutPrefix(p, prefix); ok && rest != "" {
			_, tail, _ := strings.Cut(rest, "/")
			if tail != "" {
				tail = "/" + tail
			}
			if prefix == "/t/" {
				tail = "" // the label after the secret says what the task is about
			}
			return prefix + "[redacted]" + tail
		}
	}
	if !strings.Contains(p, "/ot") {
		return p
	}
	parts := strings.Split(p, "/")
	for i, part := range parts {
		if strings.HasPrefix(part, auth.ProjectInviteSecretPrefix) || strings.HasPrefix(part, "oti_") || strings.HasPrefix(part, "otv_") || strings.HasPrefix(part, "otr_") || strings.HasPrefix(part, auth.PublicLinkSecretPrefix) {
			parts[i] = "[redacted]"
		}
	}
	return strings.Join(parts, "/")
}
