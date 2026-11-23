package auth

import (
	"context"
	"crypto/subtle"
	"database/sql"
	"errors"
	"net/mail"
	"slices"
	"strings"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/audit"
	"github.com/OpenTodoApp/opentodo/internal/ids"
)

// Invite links to a project or a workspace (projectinvites.go,
// workspaceinvites.go) follow one set of rules: single-use and expiring, only
// the secret's hash is stored, every invalid case is ErrInvitationInvalid, a
// bound email must match, and the joiner re-checks the creator's right to grant
// the role inside the transaction that spends the link. This file holds them
// once; a linkKind names what differs: the table and target column, the secret
// prefix, the roles and the audit events.

type linkKind struct {
	table, col, prefix string
	roles              []string
	roleErr            error
	created            func(actorID, inviteID, targetID, role, boundEmail string) audit.Event
	revoked            func(actorID, inviteID, targetID string) audit.Event
	accepted           func(userID, creatorID, inviteID, targetID, role string) audit.Event
}

// The table and column names are constants: they are the only text put into
// the SQL below.
var (
	projectLinks = linkKind{table: "project_invites", col: "project_id", prefix: ProjectInviteSecretPrefix,
		roles: []string{"viewer", "editor", "admin"}, roleErr: ErrInvalidProjectRole,
		created: audit.ProjectInviteCreated, revoked: audit.ProjectInviteRevoked, accepted: audit.ProjectInviteAccepted}
	workspaceLinks = linkKind{table: "workspace_invites", col: "workspace_id", prefix: WorkspaceInviteSecretPrefix,
		roles: []string{"member", "admin"}, roleErr: ErrInvalidWorkspaceRole,
		created: audit.WorkspaceInviteCreated, revoked: audit.WorkspaceInviteRevoked, accepted: audit.WorkspaceInviteAccepted}
)

// linkJoiner is ProjectJoiner and WorkspaceJoiner: it adds userID to targetID.
type linkJoiner func(ctx context.Context, tx *sql.Tx, inviterID, targetID, userID, role string) ([]string, error)

// inviteLink is a link of either kind; TargetID is its project or workspace.
type inviteLink struct {
	ID, TargetID, Role       string
	Email                    *string
	CreatedBy, CreatedByName string
	CreatedAt, ExpiresAt     int64
}

type pendingLink struct {
	inviteLink
	CreatorRole        string
	CreatorDeactivated bool
}

func (s *Service) createLink(ctx context.Context, k linkKind, creator *User, targetID, role, email string, ttl time.Duration) (*inviteLink, string, error) {
	if !slices.Contains(k.roles, role) {
		return nil, "", k.roleErr
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
	secret := k.prefix + ids.Secret(32)
	now := s.clock()
	inv := &inviteLink{
		ID: ids.New(), TargetID: targetID, Role: role, Email: bound,
		CreatedBy: creator.ID, CreatedByName: creator.Name,
		CreatedAt: now.UnixMilli(), ExpiresAt: now.Add(ttl).UnixMilli(),
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, "", err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `INSERT INTO `+k.table+`(id,token_hash,`+k.col+`,created_by,email,role,created_at,expires_at)
		VALUES(?,?,?,?,?,?,?,?)`, inv.ID, hashToken(secret), targetID, creator.ID, inv.Email, role, inv.CreatedAt, inv.ExpiresAt); err != nil {
		return nil, "", err
	}
	boundEmail := ""
	if bound != nil {
		boundEmail = *bound
	}
	if err := s.audit.RecordTx(ctx, tx, k.created(creator.ID, inv.ID, targetID, role, boundEmail)); err != nil {
		return nil, "", err
	}
	if err := tx.Commit(); err != nil {
		return nil, "", err
	}
	return inv, secret, nil
}

// listLinks returns the pending (unspent, unrevoked, unexpired) links of
// targetID, newest first. A creator without a name is shown by their display
// name, as when the link is opened.
func (s *Service) listLinks(ctx context.Context, k linkKind, targetID string) ([]inviteLink, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT i.id, i.`+k.col+`, i.role, i.email, i.created_by, c.name, i.created_at, i.expires_at
		FROM `+k.table+` i JOIN users c ON c.id = i.created_by
		WHERE i.`+k.col+` = ? AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > ?
		ORDER BY i.created_at DESC, i.id DESC`, targetID, s.clock().UnixMilli())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []inviteLink{}
	for rows.Next() {
		var inv inviteLink
		if err := rows.Scan(&inv.ID, &inv.TargetID, &inv.Role, &inv.Email, &inv.CreatedBy, &inv.CreatedByName, &inv.CreatedAt, &inv.ExpiresAt); err != nil {
			return nil, err
		}
		inv.CreatedByName = displayName(inv.CreatedByName)
		out = append(out, inv)
	}
	return out, rows.Err()
}

// revokeLink revokes a link of targetID on behalf of actorID. A link of another
// target is ErrNotFound, an accepted one ErrInvitationSpent; revoking twice is
// a no-op.
func (s *Service) revokeLink(ctx context.Context, k linkKind, actorID, targetID, id string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var acceptedAt, revokedAt *int64
	err = tx.QueryRowContext(ctx, "SELECT accepted_at, revoked_at FROM "+k.table+" WHERE id = ? AND "+k.col+" = ?", id, targetID).Scan(&acceptedAt, &revokedAt)
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
	if _, err := tx.ExecContext(ctx, "UPDATE "+k.table+" SET revoked_at = ? WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL",
		s.clock().UnixMilli(), id); err != nil {
		return err
	}
	if err := s.audit.RecordTx(ctx, tx, k.revoked(actorID, id, targetID)); err != nil {
		return err
	}
	return tx.Commit()
}

// lookupLink resolves a secret to its pending link. Every failure (malformed,
// unknown, expired, revoked, accepted) is ErrInvitationInvalid.
func lookupLink(ctx context.Context, k linkKind, q rowQuerier, secret string, now int64) (*pendingLink, error) {
	secret = strings.TrimSpace(secret)
	if !strings.HasPrefix(secret, k.prefix) || len(secret) > 128 {
		return nil, ErrInvitationInvalid
	}
	want := hashToken(secret)
	var p pendingLink
	var stored string
	var deactivated sql.NullInt64
	err := q.QueryRowContext(ctx, `SELECT i.id, i.token_hash, i.`+k.col+`, i.role, i.email, i.created_by, c.name, c.role,
			i.created_at, i.expires_at, st.deactivated_at
		FROM `+k.table+` i
		JOIN users c ON c.id = i.created_by
		LEFT JOIN user_status st ON st.user_id = c.id
		WHERE i.token_hash = ? AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > ?`, want, now).
		Scan(&p.ID, &stored, &p.TargetID, &p.Role, &p.Email, &p.CreatedBy, &p.CreatedByName, &p.CreatorRole,
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

// checkLink validates a secret inside an acceptance transaction: the link is
// pending, its creator is active, and a bound email matches.
func checkLink(ctx context.Context, k linkKind, tx *sql.Tx, secret, email string, now int64) (*pendingLink, error) {
	inv, err := lookupLink(ctx, k, tx, secret, now)
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

// joinLink runs the joiner, spends the link and records the event in tx. A
// spend that changes no row means another acceptance won (or the link changed
// state), and the caller rolls back.
func (s *Service) joinLink(ctx context.Context, k linkKind, tx *sql.Tx, inv *pendingLink, userID string, now int64, join linkJoiner) ([]string, error) {
	audience, err := join(ctx, tx, inv.CreatedBy, inv.TargetID, userID, inv.Role)
	if err != nil {
		return nil, err
	}
	res, err := tx.ExecContext(ctx, `UPDATE `+k.table+` SET accepted_at = ?, accepted_by = ?
		WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?`, now, userID, inv.ID, now)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n != 1 {
		return nil, ErrInvitationInvalid
	}
	if err := s.audit.RecordTx(ctx, tx, k.accepted(userID, inv.CreatedBy, inv.ID, inv.TargetID, inv.Role)); err != nil {
		return nil, err
	}
	return audience, nil
}

// acceptLink adds the signed-in user to the link's target. A bound email must
// match the account's (case-insensitively). The membership, the spend and the
// audit event commit together; any failure leaves the link pending.
func (s *Service) acceptLink(ctx context.Context, k linkKind, secret string, user *User, join linkJoiner) (*pendingLink, []string, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, nil, err
	}
	defer tx.Rollback()
	now := s.clock().UnixMilli()
	inv, err := checkLink(ctx, k, tx, secret, user.Email, now)
	if err != nil {
		return nil, nil, err
	}
	audience, err := s.joinLink(ctx, k, tx, inv, user.ID, now, join)
	if err != nil {
		return nil, nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, nil, err
	}
	return inv, audience, nil
}

// registerWithLink creates a member account and joins it to the link's target
// in one transaction, so a link creates at most one account and one
// membership. membersAllowed is the owner switch; the creator's server role is
// read inside the transaction. Refusals leave the link pending and create
// nothing. Sign-up being closed does not matter when the link may create
// accounts.
func (s *Service) registerWithLink(ctx context.Context, k linkKind, email, name, password, secret string, membersAllowed bool, join linkJoiner) (*User, *pendingLink, []string, error) {
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
		_, err := s.admitLink(ctx, k, tx, email, secret, membersAllowed, s.clock().UnixMilli())
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
	inv, err := s.admitLink(ctx, k, tx, email, secret, membersAllowed, now)
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
	audience, err := s.joinLink(ctx, k, tx, inv, u.ID, now, join)
	if err != nil {
		return nil, nil, nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, nil, nil, err
	}
	return u, inv, audience, nil
}

// admitLink checks inside tx that a link may create the account: an owner
// exists, the link is pending and matches the email, its creator may invite
// new people, and the member limit has room.
func (s *Service) admitLink(ctx context.Context, k linkKind, tx *sql.Tx, email, secret string, membersAllowed bool, now int64) (*pendingLink, error) {
	var n int
	if err := tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM users").Scan(&n); err != nil {
		return nil, err
	}
	if n == 0 {
		// The first account is the owner and is created by setup, never by a link.
		return nil, ErrInvitationInvalid
	}
	inv, err := checkLink(ctx, k, tx, secret, email, now)
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
