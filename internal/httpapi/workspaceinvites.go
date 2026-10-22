package httpapi

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"time"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/mail"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// Workspace invite links (OpenSpec change workspaces, "Workspace invite
// links"), built like project invite links: managing them needs the owner or
// admin role in a created workspace; the preview is public and shares the
// invite preview limiter (on a demo instance it answers the uniform 404);
// accepting needs a session or a full token. Only the membership is written,
// through sync.AddWorkspaceMemberTx inside the transaction that spends the link.

func (s *Server) registerWorkspaceInviteRoutes(mux *routes) {
	s.workspaceInviteLimiter = newRateLimiter(20, time.Hour)
	write := signedIn.fullTokens().demoDenied()
	mux.handle("GET /api/v1/workspaces/{id}/invites", signedIn.fullTokens(), s.handleListWorkspaceInvites)
	mux.handle("POST /api/v1/workspaces/{id}/invites", write, s.handleCreateWorkspaceInvite)
	mux.handle("DELETE /api/v1/workspaces/{id}/invites/{inviteId}", write, s.handleRevokeWorkspaceInvite)
	mux.handle("GET /api/v1/workspace-invites/{token}", public("workspace invite preview"), s.handlePreviewWorkspaceInvite)
	mux.handle("POST /api/v1/workspace-invites/{token}/accept", write, s.handleAcceptWorkspaceInvite)
}

func (s *Server) handleCreateWorkspaceInvite(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	u := userFrom(ctx)
	ws := s.workspaceManager(w, r)
	if ws == nil {
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
	if in.Role == "" {
		in.Role = opsync.WorkspaceMember
	}
	if !opsync.ValidWorkspaceRole(in.Role) {
		writeError(w, http.StatusBadRequest, "invalid_input", "role: must be member or admin")
		return
	}
	if in.Role == opsync.WorkspaceAdmin && ws.Role != opsync.WorkspaceOwner {
		writeError(w, http.StatusForbidden, "forbidden", "only the workspace's owner can invite admins")
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
	if s.encryptedDirectory(w, r) {
		return
	}
	msg, ok := s.inviteMessage(w, r, in.Send, in.Email, mail.KindWorkspaceInvite, u, in.Role)
	if !ok {
		return
	}
	if !s.workspaceInviteLimiter.allow(u.ID) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many invite links created, try again later")
		return
	}
	inv, secret, err := s.auth.CreateWorkspaceInvite(ctx, u, ws.ID, in.Role, in.Email, ttl)
	switch {
	case errors.Is(err, auth.ErrInvalidEmail):
		writeError(w, http.StatusBadRequest, "invalid_input", "email: "+err.Error())
		return
	case errors.Is(err, auth.ErrInvalidExpiry), errors.Is(err, auth.ErrInvalidWorkspaceRole):
		writeError(w, http.StatusBadRequest, "invalid_input", err.Error())
		return
	case err != nil:
		s.internal(w, err)
		return
	}
	link := s.inviteLinkOrigin(r, msg) + "/invite/w/" + secret
	out := map[string]any{"invite": inv, "link": link, "newAccounts": s.auth.MayCreateAccount(u.Role, s.membersMayInvite(ctx))}
	if in.Send {
		// The message names the inviter and the role, never the workspace.
		msg.Vars.Link, msg.Vars.Expiry = link, ttl
		if err := s.mail.Send(ctx, msg); err != nil {
			if rerr := s.auth.RevokeWorkspaceInvite(context.WithoutCancel(ctx), u.ID, ws.ID, inv.ID); rerr != nil {
				s.log.Error("revoke unsent workspace invite", "err", rerr)
			}
			s.mailSendError(w, err)
			return
		}
		out["sent"] = true
	}
	writeJSON(w, http.StatusCreated, out)
}

func (s *Server) handleListWorkspaceInvites(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceManager(w, r)
	if ws == nil {
		return
	}
	list, err := s.auth.ListWorkspaceInvites(r.Context(), ws.ID)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"invites": list})
}

func (s *Server) handleRevokeWorkspaceInvite(w http.ResponseWriter, r *http.Request) {
	ws := s.workspaceManager(w, r)
	if ws == nil {
		return
	}
	err := s.auth.RevokeWorkspaceInvite(r.Context(), userFrom(r.Context()).ID, ws.ID, r.PathValue("inviteId"))
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

// resolveWorkspaceInvite looks a secret up and re-checks it against current
// state: the creator is active and still owner or admin (owner for an admin
// link) of the workspace. On failure it has answered with the uniform 404.
func (s *Server) resolveWorkspaceInvite(w http.ResponseWriter, r *http.Request, secret string) (*auth.PendingWorkspaceInvite, opsync.Workspace, bool) {
	invalid := func() (*auth.PendingWorkspaceInvite, opsync.Workspace, bool) {
		writeError(w, http.StatusNotFound, "invitation_invalid", auth.ErrInvitationInvalid.Error())
		return nil, opsync.Workspace{}, false
	}
	if s.demo != nil {
		return invalid()
	}
	inv, err := s.auth.LookupWorkspaceInvite(r.Context(), secret)
	if errors.Is(err, auth.ErrInvitationInvalid) {
		return invalid()
	}
	if err != nil {
		s.internal(w, err)
		return nil, opsync.Workspace{}, false
	}
	ws, err := s.sync.WorkspaceByID(r.Context(), inv.CreatedBy, inv.WorkspaceID)
	if err != nil || inv.CreatorDeactivated || ws.Default || (ws.Role != opsync.WorkspaceOwner && ws.Role != opsync.WorkspaceAdmin) ||
		(inv.Role == opsync.WorkspaceAdmin && ws.Role != opsync.WorkspaceOwner) {
		return invalid()
	}
	return inv, ws, true
}

func (s *Server) handlePreviewWorkspaceInvite(w http.ResponseWriter, r *http.Request) {
	if !s.invitePreviewLimiter.allow(clientIP(r)) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many attempts, try again later")
		return
	}
	ctx := r.Context()
	inv, ws, ok := s.resolveWorkspaceInvite(w, r, r.PathValue("token"))
	if !ok {
		return
	}
	out := map[string]any{
		"inviterName":      inv.CreatedByName,
		"workspaceName":    ws.Name,
		"role":             inv.Role,
		"email":            inv.Email,
		"expiresAt":        inv.ExpiresAt,
		"canCreateAccount": s.auth.MayCreateAccount(inv.CreatorRole, s.membersMayInvite(ctx)) && !s.auth.SSOOnly(ctx),
	}
	if u, _, err := s.authenticate(r); err == nil && u != nil {
		_, err := s.sync.WorkspaceByID(ctx, u.ID, inv.WorkspaceID)
		out["alreadyMember"] = err == nil
	}
	writeJSON(w, http.StatusOK, out)
}

// workspaceJoiner adapts sync.AddWorkspaceMemberTx to the auth package's hook.
func (s *Server) workspaceJoiner(ctx context.Context, tx *sql.Tx, inviterID, workspaceID, userID, role string) ([]string, error) {
	return s.sync.AddWorkspaceMemberTx(ctx, tx, inviterID, workspaceID, userID, role)
}

// workspaceInviteError maps acceptance failures; rights that changed answer the uniform 404.
func (s *Server) workspaceInviteError(w http.ResponseWriter, err error) {
	var le *opsync.LimitError
	switch {
	case errors.As(err, &le):
		s.directoryError(w, err)
	case errors.Is(err, opsync.ErrForbidden), errors.Is(err, opsync.ErrNotFound), errors.Is(err, opsync.ErrDefaultWorkspace), errors.Is(err, opsync.ErrInvalidInput):
		writeError(w, http.StatusNotFound, "invitation_invalid", auth.ErrInvitationInvalid.Error())
	case errors.Is(err, opsync.ErrAlreadyMember):
		writeError(w, http.StatusConflict, "already_member", "you are already a member of this workspace")
	default:
		s.projectInviteError(w, err)
	}
}

func (s *Server) handleAcceptWorkspaceInvite(w http.ResponseWriter, r *http.Request) {
	if !s.invitePreviewLimiter.allow(clientIP(r)) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many attempts, try again later")
		return
	}
	u := userFrom(r.Context())
	secret := r.PathValue("token")
	if _, _, ok := s.resolveWorkspaceInvite(w, r, secret); !ok {
		return
	}
	inv, audience, err := s.auth.AcceptWorkspaceInvite(r.Context(), secret, u, s.workspaceJoiner)
	if err != nil {
		s.workspaceInviteError(w, err)
		return
	}
	s.sync.NotifyMembership(audience)
	writeJSON(w, http.StatusOK, map[string]any{"workspaceId": inv.WorkspaceID, "role": inv.Role})
}

// registerWithWorkspaceInvite is POST /api/v1/auth/register with a
// workspaceInvite secret: account, default workspace, membership and spend in
// one transaction.
func (s *Server) registerWithWorkspaceInvite(w http.ResponseWriter, r *http.Request, c credentials) {
	ctx := r.Context()
	if _, _, ok := s.resolveWorkspaceInvite(w, r, c.WorkspaceInvite); !ok {
		return
	}
	u, inv, audience, err := s.auth.RegisterWithWorkspaceInvite(ctx, c.Email, c.Name, c.Password, c.WorkspaceInvite, s.membersMayInvite(ctx), s.workspaceJoiner)
	if err != nil {
		s.workspaceInviteError(w, err)
		return
	}
	s.sync.NotifyMembership(audience)
	if _, ok := s.issueSession(w, r, u, false); !ok {
		return
	}
	s.audit.Record(ctx, audit.LoginSucceeded(u.ID, u.Email, "register"))
	writeJSON(w, http.StatusCreated, map[string]any{"user": u, "workspaceId": inv.WorkspaceID, "role": inv.Role})
}
