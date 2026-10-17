package auth

import (
	"context"
	"crypto/subtle"
	"database/sql"
	"errors"
	"net/mail"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/ids"
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
	if role != "viewer" && role != "editor" && role != "admin" {
		return nil, "", ErrInvalidProjectRole
	}
	if ttl == 0 {
		ttl = DefaultInvitationTTL
	}
	if ttl < MinInvitationTTL || ttl > MaxInvitationTTL {
		return nil, "", ErrInvalidExpiry
	}
	var bound *string
	if e := normalizeEmail(email); e != "" {
		if _, err := mail.ParseAddress(e); err != nil {
			return nil, "", ErrInvalidEmail
		}
		bound = &e
	}
	secret := ProjectInviteSecretPrefix + ids.Secret(32)
	now := s.clock()
	inv := &ProjectInvite{
		ID: ids.New(), ProjectID: projectID, Role: role, Email: bound,
		CreatedBy: creator.ID, CreatedByName: creator.Name,
		CreatedAt: now.UnixMilli(), ExpiresAt: now.Add(ttl).UnixMilli(),
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, "", err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `INSERT INTO project_invites(id,token_hash,project_id,created_by,email,role,created_at,expires_at)
		VALUES(?,?,?,?,?,?,?,?)`, inv.ID, hashToken(secret), projectID, creator.ID, inv.Email, role, inv.CreatedAt, inv.ExpiresAt); err != nil {
		return nil, "", err
	}
	boundEmail := ""
	if bound != nil {
		boundEmail = *bound
	}
	if err := s.audit.RecordTx(ctx, tx, audit.ProjectInviteCreated(creator.ID, inv.ID, projectID, role, boundEmail)); err != nil {
		return nil, "", err
	}
	if err := tx.Commit(); err != nil {
		return nil, "", err
	}
	return inv, secret, nil
}

// ListProjectInvites returns the pending (unspent, unrevoked, unexpired) links
// of a project, newest first.
func (s *Service) ListProjectInvites(ctx context.Context, projectID string) ([]ProjectInvite, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT i.id, i.project_id, i.role, i.email, i.created_by, c.name, i.created_at, i.expires_at
		FROM project_invites i JOIN users c ON c.id = i.created_by
		WHERE i.project_id = ? AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > ?
		ORDER BY i.created_at DESC, i.id DESC`, projectID, s.clock().UnixMilli())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ProjectInvite{}
	for rows.Next() {
		var inv ProjectInvite
		if err := rows.Scan(&inv.ID, &inv.ProjectID, &inv.Role, &inv.Email, &inv.CreatedBy, &inv.CreatedByName, &inv.CreatedAt, &inv.ExpiresAt); err != nil {
			return nil, err
		}
		out = append(out, inv)
	}
	return out, rows.Err()
}

// RevokeProjectInvite revokes a link of projectID on behalf of actorID (the
// caller has checked the actor's project role). A link of another project is
// ErrNotFound, an accepted one ErrInvitationSpent; revoking twice is a no-op.
func (s *Service) RevokeProjectInvite(ctx context.Context, actorID, projectID, id string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var acceptedAt, revokedAt *int64
	err = tx.QueryRowContext(ctx, "SELECT accepted_at, revoked_at FROM project_invites WHERE id = ? AND project_id = ?", id, projectID).Scan(&acceptedAt, &revokedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if acceptedAt != nil {
		return ErrInvitationSpent
	}
	if revokedAt != nil {
		return nil
	}
	if _, err := tx.ExecContext(ctx, "UPDATE project_invites SET revoked_at = ? WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL",
		s.clock().UnixMilli(), id); err != nil {
		return err
	}
	if err := s.audit.RecordTx(ctx, tx, audit.ProjectInviteRevoked(actorID, id, projectID)); err != nil {
		return err
	}
	return tx.Commit()
}

// LookupProjectInvite resolves a secret to its pending link. Every failure
// (malformed, unknown, expired, revoked, accepted) is ErrInvitationInvalid.
func (s *Service) LookupProjectInvite(ctx context.Context, secret string) (*PendingProjectInvite, error) {
	return lookupProjectInvite(ctx, s.db, secret, s.clock().UnixMilli())
}

func lookupProjectInvite(ctx context.Context, q rowQuerier, secret string, now int64) (*PendingProjectInvite, error) {
	secret = strings.TrimSpace(secret)
	if !strings.HasPrefix(secret, ProjectInviteSecretPrefix) || len(secret) > 128 {
		return nil, ErrInvitationInvalid
	}
	want := hashToken(secret)
	var p PendingProjectInvite
	var stored string
	var deactivated sql.NullInt64
	err := q.QueryRowContext(ctx, `SELECT i.id, i.token_hash, i.project_id, i.role, i.email, i.created_by, c.name, c.role,
			i.created_at, i.expires_at, st.deactivated_at
		FROM project_invites i
		JOIN users c ON c.id = i.created_by
		LEFT JOIN user_status st ON st.user_id = c.id
		WHERE i.token_hash = ? AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > ?`, want, now).
		Scan(&p.ID, &stored, &p.ProjectID, &p.Role, &p.Email, &p.CreatedBy, &p.CreatedByName, &p.CreatorRole,
			&p.CreatedAt, &p.ExpiresAt, &deactivated)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrInvitationInvalid
	}
	if err != nil {
		return nil, err
	}
	// The row was found by its hash; compare once more in constant time so no
	// code path ever trusts a hash comparison whose timing depends on the input.
	if subtle.ConstantTimeCompare([]byte(stored), []byte(want)) != 1 {
		return nil, ErrInvitationInvalid
	}
	p.CreatorDeactivated = deactivated.Valid
	p.CreatedByName = displayName(p.CreatedByName)
	return &p, nil
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
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, nil, err
	}
	defer tx.Rollback()
	now := s.clock().UnixMilli()
	inv, err := s.checkProjectInvite(ctx, tx, secret, user.Email, now)
	if err != nil {
		return nil, nil, err
	}
	audience, err := join(ctx, tx, inv.CreatedBy, inv.ProjectID, user.ID, inv.Role)
	if err != nil {
		return nil, nil, err
	}
	if err := spendProjectInvite(ctx, tx, inv.ID, user.ID, now); err != nil {
		return nil, nil, err
	}
	if err := s.audit.RecordTx(ctx, tx, audit.ProjectInviteAccepted(user.ID, inv.CreatedBy, inv.ID, inv.ProjectID, inv.Role)); err != nil {
		return nil, nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, nil, err
	}
	return inv, audience, nil
}

// RegisterWithProjectInvite creates a member account and joins it to the link's
// project in one transaction, so a link creates at most one account and one
// membership. membersAllowed is the owner switch; the creator's server role is
// read inside the transaction. Refusals leave the link pending and create
// nothing. Sign-up being closed does not matter when the link may create
// accounts.
func (s *Service) RegisterWithProjectInvite(ctx context.Context, email, name, password, secret string, membersAllowed bool, join ProjectJoiner) (*User, *PendingProjectInvite, []string, error) {
	email = normalizeEmail(email)
	if _, err := mail.ParseAddress(email); err != nil || email == "" {
		return nil, nil, nil, ErrInvalidEmail
	}
	if err := CheckPasswordPolicy(password); err != nil {
		return nil, nil, nil, err
	}
	// Refuse a link that cannot create an account before paying for a hash
	// (SEC-5); the write transaction checks again.
	if err := s.readTx(ctx, func(tx *sql.Tx) error {
		_, err := s.admitProjectInvite(ctx, tx, email, secret, membersAllowed, s.clock().UnixMilli())
		return err
	}); err != nil {
		return nil, nil, nil, err
	}
	hash, err := HashPassword(password)
	if err != nil {
		return nil, nil, nil, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, nil, nil, err
	}
	defer tx.Rollback()
	now := s.clock().UnixMilli()
	inv, err := s.admitProjectInvite(ctx, tx, email, secret, membersAllowed, now)
	if err != nil {
		return nil, nil, nil, err
	}
	u := &User{ID: ids.New(), Email: email, Name: strings.TrimSpace(name), Role: "member", CreatedAt: now}
	if _, err := tx.ExecContext(ctx, "INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)",
		u.ID, u.Email, u.Name, hash, u.Role, u.CreatedAt); err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			return nil, nil, nil, ErrEmailTaken
		}
		return nil, nil, nil, err
	}
	audience, err := join(ctx, tx, inv.CreatedBy, inv.ProjectID, u.ID, inv.Role)
	if err != nil {
		return nil, nil, nil, err
	}
	if err := spendProjectInvite(ctx, tx, inv.ID, u.ID, now); err != nil {
		return nil, nil, nil, err
	}
	if err := s.audit.RecordTx(ctx, tx, audit.ProjectInviteAccepted(u.ID, inv.CreatedBy, inv.ID, inv.ProjectID, inv.Role)); err != nil {
		return nil, nil, nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, nil, nil, err
	}
	return u, inv, audience, nil
}

// admitProjectInvite checks inside tx that a project invite link may create
// the account: an owner exists, the link is pending and matches the email, its
// creator may invite new people, and the member limit has room.
func (s *Service) admitProjectInvite(ctx context.Context, tx *sql.Tx, email, secret string, membersAllowed bool, now int64) (*PendingProjectInvite, error) {
	var n int
	if err := tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM users").Scan(&n); err != nil {
		return nil, err
	}
	if n == 0 {
		// The first account is the owner and is created by setup, never by a link.
		return nil, ErrInvitationInvalid
	}
	inv, err := s.checkProjectInvite(ctx, tx, secret, email, now)
	if err != nil {
		return nil, err
	}
	if !s.MayCreateAccount(inv.CreatorRole, membersAllowed) {
		return nil, ErrProjectInviteNotAllowed
	}
	if err := s.checkMemberLimit(ctx, tx); err != nil {
		return nil, err
	}
	return inv, nil
}

// checkProjectInvite validates a secret inside an acceptance transaction: the
// link is pending, its creator is active, and a bound email matches.
func (s *Service) checkProjectInvite(ctx context.Context, tx *sql.Tx, secret, email string, now int64) (*PendingProjectInvite, error) {
	inv, err := lookupProjectInvite(ctx, tx, secret, now)
	if err != nil {
		return nil, err
	}
	if inv.CreatorDeactivated {
		return nil, ErrInvitationInvalid
	}
	if inv.Email != nil && !strings.EqualFold(*inv.Email, strings.TrimSpace(email)) {
		return nil, ErrInvitationEmailMismatch
	}
	return inv, nil
}

// spendProjectInvite marks the link accepted. Zero rows affected means another
// acceptance won (or the link changed state), and the caller rolls back.
func spendProjectInvite(ctx context.Context, tx *sql.Tx, id, userID string, now int64) error {
	res, err := tx.ExecContext(ctx, `UPDATE project_invites SET accepted_at = ?, accepted_by = ?
		WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?`, now, userID, id, now)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n != 1 {
		return ErrInvitationInvalid
	}
	return nil
}
