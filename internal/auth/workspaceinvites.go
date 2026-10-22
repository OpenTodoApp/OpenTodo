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
	if role != "member" && role != "admin" {
		return nil, "", ErrInvalidWorkspaceRole
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
	secret := WorkspaceInviteSecretPrefix + ids.Secret(32)
	now := s.clock()
	inv := &WorkspaceInvite{
		ID: ids.New(), WorkspaceID: workspaceID, Role: role, Email: bound,
		CreatedBy: creator.ID, CreatedByName: creator.Name,
		CreatedAt: now.UnixMilli(), ExpiresAt: now.Add(ttl).UnixMilli(),
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, "", err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `INSERT INTO workspace_invites(id,token_hash,workspace_id,created_by,email,role,created_at,expires_at)
		VALUES(?,?,?,?,?,?,?,?)`, inv.ID, hashToken(secret), workspaceID, creator.ID, inv.Email, role, inv.CreatedAt, inv.ExpiresAt); err != nil {
		return nil, "", err
	}
	boundEmail := ""
	if bound != nil {
		boundEmail = *bound
	}
	if err := s.audit.RecordTx(ctx, tx, audit.WorkspaceInviteCreated(creator.ID, inv.ID, workspaceID, role, boundEmail)); err != nil {
		return nil, "", err
	}
	if err := tx.Commit(); err != nil {
		return nil, "", err
	}
	return inv, secret, nil
}

// ListWorkspaceInvites returns the pending links of a workspace, newest first.
func (s *Service) ListWorkspaceInvites(ctx context.Context, workspaceID string) ([]WorkspaceInvite, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT i.id, i.workspace_id, i.role, i.email, i.created_by, c.name, i.created_at, i.expires_at
		FROM workspace_invites i JOIN users c ON c.id = i.created_by
		WHERE i.workspace_id = ? AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > ?
		ORDER BY i.created_at DESC, i.id DESC`, workspaceID, s.clock().UnixMilli())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []WorkspaceInvite{}
	for rows.Next() {
		var inv WorkspaceInvite
		if err := rows.Scan(&inv.ID, &inv.WorkspaceID, &inv.Role, &inv.Email, &inv.CreatedBy, &inv.CreatedByName, &inv.CreatedAt, &inv.ExpiresAt); err != nil {
			return nil, err
		}
		inv.CreatedByName = displayName(inv.CreatedByName)
		out = append(out, inv)
	}
	return out, rows.Err()
}

// RevokeWorkspaceInvite revokes a link of workspaceID. A link of another
// workspace is ErrNotFound, an accepted one ErrInvitationSpent; revoking twice
// is a no-op.
func (s *Service) RevokeWorkspaceInvite(ctx context.Context, actorID, workspaceID, id string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var acceptedAt, revokedAt *int64
	err = tx.QueryRowContext(ctx, "SELECT accepted_at, revoked_at FROM workspace_invites WHERE id = ? AND workspace_id = ?", id, workspaceID).Scan(&acceptedAt, &revokedAt)
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
	if _, err := tx.ExecContext(ctx, "UPDATE workspace_invites SET revoked_at = ? WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL",
		s.clock().UnixMilli(), id); err != nil {
		return err
	}
	if err := s.audit.RecordTx(ctx, tx, audit.WorkspaceInviteRevoked(actorID, id, workspaceID)); err != nil {
		return err
	}
	return tx.Commit()
}

// LookupWorkspaceInvite resolves a secret to its pending link; every failure
// is ErrInvitationInvalid.
func (s *Service) LookupWorkspaceInvite(ctx context.Context, secret string) (*PendingWorkspaceInvite, error) {
	return lookupWorkspaceInvite(ctx, s.db, secret, s.clock().UnixMilli())
}

func lookupWorkspaceInvite(ctx context.Context, q rowQuerier, secret string, now int64) (*PendingWorkspaceInvite, error) {
	secret = strings.TrimSpace(secret)
	if !strings.HasPrefix(secret, WorkspaceInviteSecretPrefix) || len(secret) > 128 {
		return nil, ErrInvitationInvalid
	}
	want := hashToken(secret)
	var p PendingWorkspaceInvite
	var stored string
	var deactivated sql.NullInt64
	err := q.QueryRowContext(ctx, `SELECT i.id, i.token_hash, i.workspace_id, i.role, i.email, i.created_by, c.name, c.role,
			i.created_at, i.expires_at, st.deactivated_at
		FROM workspace_invites i
		JOIN users c ON c.id = i.created_by
		LEFT JOIN user_status st ON st.user_id = c.id
		WHERE i.token_hash = ? AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > ?`, want, now).
		Scan(&p.ID, &stored, &p.WorkspaceID, &p.Role, &p.Email, &p.CreatedBy, &p.CreatedByName, &p.CreatorRole,
			&p.CreatedAt, &p.ExpiresAt, &deactivated)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrInvitationInvalid
	}
	if err != nil {
		return nil, err
	}
	if subtle.ConstantTimeCompare([]byte(stored), []byte(want)) != 1 {
		return nil, ErrInvitationInvalid
	}
	p.CreatorDeactivated = deactivated.Valid
	p.CreatedByName = displayName(p.CreatedByName)
	return &p, nil
}

// checkWorkspaceInvite validates a secret inside an acceptance transaction.
func (s *Service) checkWorkspaceInvite(ctx context.Context, tx *sql.Tx, secret, email string, now int64) (*PendingWorkspaceInvite, error) {
	inv, err := lookupWorkspaceInvite(ctx, tx, secret, now)
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

func spendWorkspaceInvite(ctx context.Context, tx *sql.Tx, id, userID string, now int64) error {
	res, err := tx.ExecContext(ctx, `UPDATE workspace_invites SET accepted_at = ?, accepted_by = ?
		WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?`, now, userID, id, now)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n != 1 {
		return ErrInvitationInvalid
	}
	return nil
}

// joinWorkspace runs the joiner, spends the link and records the event in tx.
func (s *Service) joinWorkspace(ctx context.Context, tx *sql.Tx, inv *PendingWorkspaceInvite, userID string, now int64, join WorkspaceJoiner) ([]string, error) {
	audience, err := join(ctx, tx, inv.CreatedBy, inv.WorkspaceID, userID, inv.Role)
	if err != nil {
		return nil, err
	}
	if err := spendWorkspaceInvite(ctx, tx, inv.ID, userID, now); err != nil {
		return nil, err
	}
	if err := s.audit.RecordTx(ctx, tx, audit.WorkspaceInviteAccepted(userID, inv.CreatedBy, inv.ID, inv.WorkspaceID, inv.Role)); err != nil {
		return nil, err
	}
	return audience, nil
}

// AcceptWorkspaceInvite adds the signed-in user to the link's workspace. The
// membership, the spend and the audit event commit together; any failure
// leaves the link pending.
func (s *Service) AcceptWorkspaceInvite(ctx context.Context, secret string, user *User, join WorkspaceJoiner) (*PendingWorkspaceInvite, []string, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, nil, err
	}
	defer tx.Rollback()
	now := s.clock().UnixMilli()
	inv, err := s.checkWorkspaceInvite(ctx, tx, secret, user.Email, now)
	if err != nil {
		return nil, nil, err
	}
	audience, err := s.joinWorkspace(ctx, tx, inv, user.ID, now, join)
	if err != nil {
		return nil, nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, nil, err
	}
	return inv, audience, nil
}

// RegisterWithWorkspaceInvite creates a member account (with its own default
// workspace) and joins it to the link's workspace in one transaction, under
// the account creation rule of project invite links.
func (s *Service) RegisterWithWorkspaceInvite(ctx context.Context, email, name, password, secret string, membersAllowed bool, join WorkspaceJoiner) (*User, *PendingWorkspaceInvite, []string, error) {
	email = normalizeEmail(email)
	if _, err := mail.ParseAddress(email); err != nil || email == "" {
		return nil, nil, nil, ErrInvalidEmail
	}
	if err := CheckPasswordPolicy(password); err != nil {
		return nil, nil, nil, err
	}
	if err := s.readTx(ctx, func(tx *sql.Tx) error {
		_, err := s.admitWorkspaceInvite(ctx, tx, email, secret, membersAllowed, s.clock().UnixMilli())
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
	inv, err := s.admitWorkspaceInvite(ctx, tx, email, secret, membersAllowed, now)
	if err != nil {
		return nil, nil, nil, err
	}
	u := &User{ID: ids.New(), Email: email, Name: strings.TrimSpace(name), Role: "member", CreatedAt: now}
	if err := insertUser(ctx, tx, u, hash); err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			return nil, nil, nil, ErrEmailTaken
		}
		return nil, nil, nil, err
	}
	audience, err := s.joinWorkspace(ctx, tx, inv, u.ID, now, join)
	if err != nil {
		return nil, nil, nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, nil, nil, err
	}
	return u, inv, audience, nil
}

// admitWorkspaceInvite checks inside tx that a link may create the account.
func (s *Service) admitWorkspaceInvite(ctx context.Context, tx *sql.Tx, email, secret string, membersAllowed bool, now int64) (*PendingWorkspaceInvite, error) {
	var n int
	if err := tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM users").Scan(&n); err != nil {
		return nil, err
	}
	if n == 0 {
		return nil, ErrInvitationInvalid
	}
	inv, err := s.checkWorkspaceInvite(ctx, tx, secret, email, now)
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
