package auth

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// Workspace invite links (OpenSpec change workspaces, "Workspace invite
// links"): single-use, expiring links that add whoever opens them to a created
// workspace with a role, and may create their account. They follow project
// invite links (projectinvites.go) and share their rules: only the secret's
// hash is stored, every invalid case is ErrInvitationInvalid, a bound email
// must match, and the creator's right to grant the role is re-checked by the
// WorkspaceJoiner inside the transaction that spends the link.

// WorkspaceInviteSecretPrefix marks workspace invite secrets.
const WorkspaceInviteSecretPrefix = "otw_"

// ErrInvalidWorkspaceRole: a link role other than member or admin.
var ErrInvalidWorkspaceRole = errors.New("role must be member or admin")

// WorkspaceJoiner adds userID to workspaceID with role on behalf of inviterID
// inside tx and returns every user whose devices should sync. The HTTP layer
// wires it to sync.Service.AddWorkspaceMemberTx.
type WorkspaceJoiner func(ctx context.Context, tx *sql.Tx, inviterID, workspaceID, userID, role string) ([]string, error)

// WorkspaceInvite is a manager's view of a workspace invite link, never with the secret.
type WorkspaceInvite struct {
	ID            string  `json:"id"`
	WorkspaceID   string  `json:"workspaceId"`
	Role          string  `json:"role"`
	Email         *string `json:"email"`
	CreatedBy     string  `json:"createdBy"`
	CreatedByName string  `json:"createdByName"`
	CreatedAt     int64   `json:"createdAt"`
	ExpiresAt     int64   `json:"expiresAt"`
}

// PendingWorkspaceInvite is a pending link resolved from its secret, with the
// creator's server role and whether their account is deactivated.
type PendingWorkspaceInvite struct {
	WorkspaceInvite
	CreatorRole        string
	CreatorDeactivated bool
}

// CreateWorkspaceInvite mints a link for workspaceID. The caller has checked
// that creator may grant role there. The secret is returned exactly once.
func (s *Service) CreateWorkspaceInvite(ctx context.Context, creator *User, workspaceID, role, email string, ttl time.Duration) (*WorkspaceInvite, string, error) {
	inv, secret, err := s.createLink(ctx, workspaceLinks, creator, workspaceID, role, email, ttl)
	if err != nil {
		return nil, "", err
	}
	w := workspaceInvite(*inv)
	return &w, secret, nil
}

// ListWorkspaceInvites returns the pending links of a workspace, newest first.
func (s *Service) ListWorkspaceInvites(ctx context.Context, workspaceID string) ([]WorkspaceInvite, error) {
	list, err := s.listLinks(ctx, workspaceLinks, workspaceID)
	if err != nil {
		return nil, err
	}
	out := make([]WorkspaceInvite, len(list))
	for i, l := range list {
		out[i] = workspaceInvite(l)
	}
	return out, nil
}

// RevokeWorkspaceInvite revokes a link of workspaceID. A link of another
// workspace is ErrNotFound, an accepted one ErrInvitationSpent; revoking twice
// is a no-op.
func (s *Service) RevokeWorkspaceInvite(ctx context.Context, actorID, workspaceID, id string) error {
	return s.revokeLink(ctx, workspaceLinks, actorID, workspaceID, id)
}

// LookupWorkspaceInvite resolves a secret to its pending link; every failure
// is ErrInvitationInvalid.
func (s *Service) LookupWorkspaceInvite(ctx context.Context, secret string) (*PendingWorkspaceInvite, error) {
	p, err := lookupLink(ctx, workspaceLinks, s.db, secret, s.clock().UnixMilli())
	return pendingWorkspace(p), err
}

// AcceptWorkspaceInvite adds the signed-in user to the link's workspace. The
// membership, the spend and the audit event commit together; any failure
// leaves the link pending.
func (s *Service) AcceptWorkspaceInvite(ctx context.Context, secret string, user *User, join WorkspaceJoiner) (*PendingWorkspaceInvite, []string, error) {
	p, audience, err := s.acceptLink(ctx, workspaceLinks, secret, user, linkJoiner(join))
	return pendingWorkspace(p), audience, err
}

// RegisterWithWorkspaceInvite creates a member account (with its own default
// workspace) and joins it to the link's workspace in one transaction, under
// the account creation rule of project invite links.
func (s *Service) RegisterWithWorkspaceInvite(ctx context.Context, email, name, password, secret string, membersAllowed bool, join WorkspaceJoiner) (*User, *PendingWorkspaceInvite, []string, error) {
	u, p, audience, err := s.registerWithLink(ctx, workspaceLinks, email, name, password, secret, membersAllowed, linkJoiner(join))
	return u, pendingWorkspace(p), audience, err
}

func workspaceInvite(l inviteLink) WorkspaceInvite {
	return WorkspaceInvite{ID: l.ID, WorkspaceID: l.TargetID, Role: l.Role, Email: l.Email, CreatedBy: l.CreatedBy,
		CreatedByName: l.CreatedByName, CreatedAt: l.CreatedAt, ExpiresAt: l.ExpiresAt}
}

func pendingWorkspace(p *pendingLink) *PendingWorkspaceInvite {
	if p == nil {
		return nil
	}
	return &PendingWorkspaceInvite{WorkspaceInvite: workspaceInvite(p.inviteLink), CreatorRole: p.CreatorRole, CreatorDeactivated: p.CreatorDeactivated}
}
