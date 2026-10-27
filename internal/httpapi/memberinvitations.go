package httpapi

import (
	"context"
	"errors"
	"net/http"
	netmail "net/mail"
	"strings"

	"github.com/OpenTodoApp/opentodo/internal/audit"
	"github.com/OpenTodoApp/opentodo/internal/auth"
	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	"github.com/OpenTodoApp/opentodo/internal/mail"
	"github.com/OpenTodoApp/opentodo/internal/notify"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Membership invitations (OpenSpec change member-add-consent). Adding by email
// someone the caller shares nothing with stores an invitation instead of a
// membership and answers 202 {pending: true}, the same for an address without
// an account (design D2). The invitee answers through the routes below; the
// membership is then added with the inviter as the acting member, through the
// same sync methods as an immediate add. Membership is still never an op.

func (s *Server) registerMemberInvitationRoutes(mux *routes) {
	invitee := signedIn.FullTokens().DemoDenied()
	mux.handle("GET /api/v1/me/member-invitations", invitee, s.handleListMemberInvitations)
	mux.handle("POST /api/v1/me/member-invitations/{id}/accept", invitee, s.handleAcceptMemberInvitation)
	mux.handle("POST /api/v1/me/member-invitations/{id}/decline", invitee, s.handleDeclineMemberInvitation)
	mux.handle("DELETE /api/v1/projects/{id}/member-invitations/{invitationId}", signedIn.DemoDenied(), s.handleCancelProjectInvitation)
	mux.handle("DELETE /api/v1/workspaces/{id}/member-invitations/{invitationId}", signedIn.FullTokens().DemoDenied(), s.handleCancelWorkspaceInvitation)
}

// inviteAddress normalises the email of an add by email and answers 400 for
// anything but one plain address.
func inviteAddress(w http.ResponseWriter, email string) (string, bool) {
	email = strings.ToLower(strings.TrimSpace(email))
	addr, err := netmail.ParseAddress(email)
	if err != nil || addr.Name != "" || addr.Address != email || len(email) > 320 {
		writeError(w, http.StatusBadRequest, "invalid_input", "email: enter one valid address")
		return "", false
	}
	return email, true
}

// lookupInvitee returns the account with email, or nil when there is none.
func (s *Server) lookupInvitee(ctx context.Context, email string) (*auth.User, error) {
	u, err := s.auth.UserByEmail(ctx, email)
	if errors.Is(err, auth.ErrNotFound) {
		return nil, nil
	}
	return u, err
}

// addsAtOnce reports whether target may be added without asking: it is the
// caller, or already shares a project or a created workspace with them (D1).
func (s *Server) addsAtOnce(ctx context.Context, actorID string, target *auth.User) (bool, error) {
	if target == nil {
		return false, nil
	}
	if target.ID == actorID {
		return true, nil
	}
	return s.sync.Acquainted(ctx, actorID, target.ID)
}

// inviteMember stores an invitation and answers 202 {pending: true}. A new
// invitation to an existing account is announced after the answer, so the
// response takes the same time with or without an account (D2).
func (s *Server) inviteMember(w http.ResponseWriter, r *http.Request, kind, targetID string, invitee *auth.User, email, role string) {
	ctx := r.Context()
	inviter := userFrom(ctx)
	inv, outcome, err := s.auth.InviteMember(ctx, kind, targetID, inviter.ID, invitee, email, role)
	if errors.Is(err, auth.ErrInvitationLimit) {
		writeError(w, http.StatusConflict, "limit_reached", "limit reached: "+err.Error())
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	if outcome == auth.InviteCreated {
		s.audit.Record(ctx, audit.MemberInvitationCreated(inviter.ID, inv.InviteeID, inv.ID, kind, targetID, role))
		if invitee != nil {
			// The notification is one insert, in line so it exists before the
			// invitee can answer; the email waits for the answer to be sent.
			name, _ := s.invitationTargetName(ctx, inv.Kind, inv.TargetID)
			s.sync.EmitMemberInvited(ctx, notify.MemberInvited{RecipientID: invitee.ID, InvitationID: inv.ID, Target: inv.Kind, TargetID: inv.TargetID,
				TargetName: name, InviterID: inviter.ID, InviterName: inviter.Name, Role: inv.Role, At: inv.CreatedAt})
			s.sync.NotifyMembership([]string{invitee.ID})
			lang := mail.LangFrom(r.Header.Get("Accept-Language"))
			bg := context.WithoutCancel(ctx)
			s.background.Add(1)
			go func() {
				defer s.background.Done()
				s.mailInvitation(bg, inv, invitee, inviter, lang)
			}()
		}
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"pending": true})
}

// mailInvitation emails the invitee when outgoing email is on and the server
// knows its public address (D5). It runs after the answer was sent.
func (s *Server) mailInvitation(ctx context.Context, inv *auth.MemberInvitation, invitee, inviter *auth.User, lang string) {
	if !s.mailEnabled(ctx) {
		return
	}
	origin := s.cfg.Origin()
	if origin == "" {
		return
	}
	msg := mail.Message{Kind: mail.KindMemberInvitation, To: invitee.Email, Lang: lang, Origin: origin, UserID: invitee.ID, ActorID: inviter.ID,
		Vars: mail.Vars{Inviter: inviter.Name, Role: inv.Role, Link: origin + "/settings/account/invitations", Expiry: auth.MemberInvitationTTL}}
	if s.mail.Limited(ctx, msg) {
		return
	}
	if err := s.mail.Send(ctx, msg); err != nil {
		s.log.Warn("membership invitation email not sent", "err", err)
	}
}

// invitationTargetName is the project's or workspace's name as people see it,
// and whether the target still exists.
func (s *Server) invitationTargetName(ctx context.Context, kind, targetID string) (string, bool) {
	if kind == auth.InvitationWorkspace {
		name, ok, err := s.sync.WorkspaceName(ctx, targetID)
		return name, ok && err == nil
	}
	name, ok, err := s.sync.ProjectName(ctx, targetID)
	return e2ee.Display(name), ok && err == nil
}

// invitationRead marks the invitee's notification about an invitation read.
func (s *Server) invitationRead(ctx context.Context, inviteeID, invitationID string) {
	if s.inbox == nil || inviteeID == "" {
		return
	}
	if err := s.inbox.MarkInvitationRead(ctx, inviteeID, invitationID); err != nil {
		s.log.Warn("mark invitation notification read", "err", err)
	}
}

func (s *Server) handleListMemberInvitations(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	list, err := s.auth.MemberInvitations(ctx, userFrom(ctx).ID)
	if err != nil {
		s.internal(w, err)
		return
	}
	out := []map[string]any{}
	for _, inv := range list {
		name, live := s.invitationTargetName(ctx, inv.Kind, inv.TargetID)
		if !live {
			continue // accepting would answer invitation_stale; it expires
		}
		out = append(out, map[string]any{"id": inv.ID, "kind": inv.Kind, "targetId": inv.TargetID, "targetName": name, "role": inv.Role,
			"inviterId": inv.InviterID, "inviterName": inv.InviterName, "createdAt": inv.CreatedAt, "expiresAt": inv.ExpiresAt})
	}
	writeJSON(w, http.StatusOK, map[string]any{"invitations": out})
}

// errInvitationStale marks an acceptance whose inviter can no longer add the
// person (design D4).
var errInvitationStale = errors.New("this invitation can no longer be accepted: ask the person who invited you to add you again")

func (s *Server) handleAcceptMemberInvitation(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	me := userFrom(ctx)
	inv, err := s.auth.MemberInvitationFor(ctx, me.ID, r.PathValue("id"))
	if errors.Is(err, auth.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "invitation not found")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	audience, err := s.joinInvitation(ctx, inv, me.ID)
	if err != nil && !errors.Is(err, errInvitationStale) && !errors.Is(err, opsync.ErrAlreadyMember) {
		s.internal(w, err)
		return
	}
	if derr := s.auth.DeleteMemberInvitation(ctx, inv.ID); derr != nil {
		s.log.Error("delete answered membership invitation", "err", derr)
	}
	s.invitationRead(ctx, me.ID, inv.ID)
	switch {
	case errors.Is(err, errInvitationStale):
		writeError(w, http.StatusGone, "invitation_stale", err.Error())
		return
	case errors.Is(err, opsync.ErrAlreadyMember):
		writeError(w, http.StatusConflict, "already_member", "you are already a member")
		return
	}
	s.audit.Record(ctx, audit.MemberInvitationAccepted(me.ID, inv.InviterID, inv.ID, inv.Kind, inv.TargetID, inv.Role))
	s.sync.NotifyMembership(audience)
	writeJSON(w, http.StatusOK, map[string]any{"kind": inv.Kind, "targetId": inv.TargetID, "role": inv.Role})
}

// joinInvitation adds the invitee with the inviter as the acting member after
// re-checking the inviter's rights, and returns the users to wake. A refusal
// that comes from changed rights or state is errInvitationStale.
func (s *Server) joinInvitation(ctx context.Context, inv *auth.MemberInvitation, inviteeID string) ([]string, error) {
	if active, err := s.auth.InviterActive(ctx, inv.InviterID); err != nil {
		return nil, err
	} else if !active {
		return nil, errInvitationStale
	}
	encrypted, err := s.encryptionEnabled(ctx, inv.InviterID)
	if err != nil {
		return nil, err
	}
	if inv.Kind == auth.InvitationWorkspace {
		if encrypted {
			return nil, errInvitationStale
		}
		ch, err := s.sync.AddWorkspaceMember(ctx, inv.InviterID, inv.TargetID, inviteeID, inv.Role)
		var le *opsync.LimitError
		switch {
		case errors.Is(err, opsync.ErrAlreadyMember):
			return nil, err
		case errors.As(err, &le), errors.Is(err, opsync.ErrForbidden), errors.Is(err, opsync.ErrNotFound),
			errors.Is(err, opsync.ErrDefaultWorkspace), errors.Is(err, opsync.ErrInvalidInput):
			return nil, errInvitationStale
		case err != nil:
			return nil, err
		}
		s.audit.Record(ctx, audit.WorkspaceMemberAdded(inv.InviterID, inviteeID, inv.TargetID, inv.Role))
		return ch.Audience, nil
	}
	live, shared, role, err := s.sync.ProjectStatus(ctx, inv.InviterID, inv.TargetID)
	if err != nil {
		return nil, err
	}
	if !live || !opsync.CanGrant(role, inv.Role) || (!shared && encrypted) {
		return nil, errInvitationStale
	}
	ch, err := s.sync.AddMember(ctx, inv.InviterID, inv.TargetID, inviteeID, inv.Role)
	switch {
	case errors.Is(err, opsync.ErrAlreadyMember):
		return nil, err
	case errors.Is(err, opsync.ErrForbidden), errors.Is(err, opsync.ErrNotFound), errors.Is(err, opsync.ErrInvalidMember),
		errors.Is(err, opsync.ErrNotInWorkspace), errors.Is(err, opsync.ErrProjectIDConflict):
		return nil, errInvitationStale
	case err != nil:
		return nil, err
	}
	s.audit.Record(ctx, audit.ProjectMemberAdded(inv.InviterID, inviteeID, inv.TargetID, inv.Role))
	if ch.From != ch.To {
		s.audit.Record(ctx, audit.RoleChanged(inv.InviterID, inviteeID, projectRoleLabel(ch.From), projectRoleLabel(ch.To)))
	}
	return ch.Audience, nil
}

func (s *Server) handleDeclineMemberInvitation(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	me := userFrom(ctx)
	inv, err := s.auth.DeclineMemberInvitation(ctx, me.ID, r.PathValue("id"))
	if errors.Is(err, auth.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "invitation not found")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	s.invitationRead(ctx, me.ID, inv.ID)
	s.audit.Record(ctx, audit.MemberInvitationDeclined(me.ID, inv.InviterID, inv.ID, inv.Kind, inv.TargetID, inv.Role))
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleCancelProjectInvitation(w http.ResponseWriter, r *http.Request) {
	m, err := s.sync.ProjectMembers(r.Context(), userFrom(r.Context()).ID, r.PathValue("id"))
	if err != nil {
		s.memberError(w, err)
		return
	}
	if m.Role != opsync.RoleOwner && m.Role != opsync.RoleAdmin {
		s.memberError(w, opsync.ErrForbidden)
		return
	}
	s.cancelInvitation(w, r, auth.InvitationProject)
}

func (s *Server) handleCancelWorkspaceInvitation(w http.ResponseWriter, r *http.Request) {
	if s.workspaceManager(w, r) == nil {
		return
	}
	s.cancelInvitation(w, r, auth.InvitationWorkspace)
}

// cancelInvitation withdraws an open invitation of the target in the path;
// the caller has checked the manager's role.
func (s *Server) cancelInvitation(w http.ResponseWriter, r *http.Request, kind string) {
	ctx := r.Context()
	inv, err := s.auth.CancelMemberInvitation(ctx, kind, r.PathValue("id"), r.PathValue("invitationId"))
	if errors.Is(err, auth.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "invitation not found")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	s.invitationRead(ctx, inv.InviteeID, inv.ID)
	s.audit.Record(ctx, audit.MemberInvitationCancelled(userFrom(ctx).ID, inv.InviteeID, inv.ID, kind, inv.TargetID, inv.Role))
	w.WriteHeader(http.StatusNoContent)
}

// membersView is a project's member list with, for its owner and admins, the
// open invitations (`pending`).
type membersView struct {
	opsync.Membership
	Pending any `json:"pending,omitempty"`
}

// projectMembersView adds the open invitations to m when the caller manages
// the project.
func (s *Server) projectMembersView(ctx context.Context, m opsync.Membership) (membersView, error) {
	v := membersView{Membership: m}
	if m.Role == opsync.RoleOwner || m.Role == opsync.RoleAdmin {
		pending, err := s.auth.PendingMembers(ctx, auth.InvitationProject, m.ProjectID)
		if err != nil {
			return v, err
		}
		v.Pending = pending
	}
	return v, nil
}

// workspaceView is a workspace with, for its owner and admins, the open
// invitations (`pending`).
type workspaceView struct {
	opsync.Workspace
	Pending any `json:"pending,omitempty"`
}

// workspacePending returns the open invitations of ws when the caller manages
// it, or nil.
func (s *Server) workspacePending(ctx context.Context, ws opsync.Workspace) (any, error) {
	if ws.Default || (ws.Role != opsync.WorkspaceOwner && ws.Role != opsync.WorkspaceAdmin) {
		return nil, nil
	}
	return s.auth.PendingMembers(ctx, auth.InvitationWorkspace, ws.ID)
}
