package auth

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// Project invite links (OpenSpec change `project-invite-links`): single-use,
// expiring links that add whoever opens them to one project with a role, and
// may create their account. Like invitations they are server-side account
// data: never ops, never synced. Membership itself is written by the sync
// package through the ProjectJoiner hook, inside the transaction that spends
// the link, so the auth package does not depend on sync.

// ProjectInviteSecretPrefix marks project invite secrets ("oti_" marks server
// invitations), so a secret pasted into the wrong place is recognisable.
const ProjectInviteSecretPrefix = "otp_"

var (
	// ErrProjectInviteNotAllowed: the link may not create an account (its
	// creator is a plain member, sign-up is closed and the owner switch is off).
	ErrProjectInviteNotAllowed = errors.New("this link can only be used by people who already have an account on this server; sign in first, or ask the server owner for an account")
	// ErrInvalidProjectRole: a link role other than viewer, editor or admin.
	ErrInvalidProjectRole = errors.New("role must be viewer, editor or admin")
)

// ProjectJoiner adds userID to projectID with role on behalf of inviterID
// inside tx and returns every user whose devices should sync. It must check
// that the inviter may still grant the role and that the project is live, and
// return an error that rolls the acceptance back otherwise. The HTTP layer
// wires it to sync.Service.AddMemberTx.
type ProjectJoiner func(ctx context.Context, tx *sql.Tx, inviterID, projectID, userID, role string) ([]string, error)

// ProjectInvite is a manager's view of a project invite link. It never
// carries the secret.
type ProjectInvite struct {
	ID            string  `json:"id"`
	ProjectID     string  `json:"projectId"`
	Role          string  `json:"role"`
	Email         *string `json:"email"`
	CreatedBy     string  `json:"createdBy"`
	CreatedByName string  `json:"createdByName"`
	CreatedAt     int64   `json:"createdAt"`
	ExpiresAt     int64   `json:"expiresAt"`
}

// PendingProjectInvite is a pending link resolved from its secret, with what
// the HTTP layer needs to re-check it: the creator's server role and whether
// their account is deactivated. It is never sent to a client as is.
type PendingProjectInvite struct {
	ProjectInvite
	CreatorRole        string
	CreatorDeactivated bool
}

// CreateProjectInvite mints a link for projectID. The caller has checked that
// creator may grant role on the project. email may be empty (open link). The
// plaintext secret is returned exactly once; only its hash is stored, and the
// link and its audit event commit together.
func (s *Service) CreateProjectInvite(ctx context.Context, creator *User, projectID, role, email string, ttl time.Duration) (*ProjectInvite, string, error) {
	inv, secret, err := s.createLink(ctx, projectLinks, creator, projectID, role, email, ttl)
	if err != nil {
		return nil, "", err
	}
	p := projectInvite(*inv)
	return &p, secret, nil
}

// ListProjectInvites returns the pending (unspent, unrevoked, unexpired) links
// of a project, newest first.
func (s *Service) ListProjectInvites(ctx context.Context, projectID string) ([]ProjectInvite, error) {
	list, err := s.listLinks(ctx, projectLinks, projectID)
	if err != nil {
		return nil, err
	}
	out := make([]ProjectInvite, len(list))
	for i, l := range list {
		out[i] = projectInvite(l)
	}
	return out, nil
}

// RevokeProjectInvite revokes a link of projectID on behalf of actorID (the
// caller has checked the actor's project role). A link of another project is
// ErrNotFound, an accepted one ErrInvitationSpent; revoking twice is a no-op.
func (s *Service) RevokeProjectInvite(ctx context.Context, actorID, projectID, id string) error {
	return s.revokeLink(ctx, projectLinks, actorID, projectID, id)
}

// LookupProjectInvite resolves a secret to its pending link. Every failure
// (malformed, unknown, expired, revoked, accepted) is ErrInvitationInvalid.
func (s *Service) LookupProjectInvite(ctx context.Context, secret string) (*PendingProjectInvite, error) {
	p, err := lookupLink(ctx, projectLinks, s.db, secret, s.clock().UnixMilli())
	return pendingProject(p), err
}

// MayCreateAccount reports whether a link created by an account with
// creatorRole may create a new account: the server owner's and admins' links
// always may, other links only while open sign-up is on or the owner allowed
// it ("Members can invite new people with project links").
func (s *Service) MayCreateAccount(creatorRole string, membersAllowed bool) bool {
	return creatorRole == "owner" || creatorRole == "admin" || s.allowSignup || membersAllowed
}

// AcceptProjectInvite adds the signed-in user to the link's project. A bound
// email must match the account's (case-insensitively). The membership (through
// join), the spend and the audit event commit together; any failure leaves the
// link pending. It returns the audience to wake and the pending link.
func (s *Service) AcceptProjectInvite(ctx context.Context, secret string, user *User, join ProjectJoiner) (*PendingProjectInvite, []string, error) {
	p, audience, err := s.acceptLink(ctx, projectLinks, secret, user, linkJoiner(join))
	return pendingProject(p), audience, err
}

// RegisterWithProjectInvite creates a member account and joins it to the link's
// project in one transaction (registerWithLink).
func (s *Service) RegisterWithProjectInvite(ctx context.Context, email, name, password, secret string, membersAllowed bool, join ProjectJoiner) (*User, *PendingProjectInvite, []string, error) {
	u, p, audience, err := s.registerWithLink(ctx, projectLinks, email, name, password, secret, membersAllowed, linkJoiner(join))
	return u, pendingProject(p), audience, err
}

func projectInvite(l inviteLink) ProjectInvite {
	return ProjectInvite{ID: l.ID, ProjectID: l.TargetID, Role: l.Role, Email: l.Email, CreatedBy: l.CreatedBy,
		CreatedByName: l.CreatedByName, CreatedAt: l.CreatedAt, ExpiresAt: l.ExpiresAt}
}

func pendingProject(p *pendingLink) *PendingProjectInvite {
	if p == nil {
		return nil
	}
	return &PendingProjectInvite{ProjectInvite: projectInvite(p.inviteLink), CreatorRole: p.CreatorRole, CreatorDeactivated: p.CreatorDeactivated}
}
