package auth

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/ids"
)

// User administration (OpenSpec change `user-management`): the role matrix,
// the user list, role changes, deactivation, deletion, password reset links,
// self-service password change and owner transfer. Everything here is
// server-side account data: nothing is written to the op log or synced.

// Account roles.
const (
	RoleOwner  = "owner"
	RoleAdmin  = "admin"
	RoleMember = "member"
)

// Account status values, derived from user_status.deactivated_at.
const (
	StatusActive      = "active"
	StatusDeactivated = "deactivated"
)

// Reset link expiry bounds (design D5): 1 to 72 hours, default 24.
const (
	MinResetTTL     = time.Hour
	MaxResetTTL     = 72 * time.Hour
	DefaultResetTTL = 24 * time.Hour
)

var (
	ErrForbidden            = errors.New("your role does not allow this action")
	ErrSelfAction           = errors.New("you cannot do this to your own account")
	ErrAccountDeactivated   = errors.New("this account is deactivated")
	ErrAccountActive        = errors.New("this account is already active")
	ErrConfirmationMismatch = errors.New("confirmEmail does not match the account's email")
	ErrResetInvalid         = errors.New("this password reset link is not valid")
	ErrInvalidRole          = errors.New("role must be admin or member (ownership moves only by transfer)")
	ErrInvalidResetExpiry   = errors.New("expiresInHours must be between 1 and 72")
)

// Action is an administrative action checked by Authorize.
type Action string

const (
	ActionInvite         Action = "invite" // also list and revoke invitations
	ActionListUsers      Action = "list_users"
	ActionDeactivate     Action = "deactivate"
	ActionReactivate     Action = "reactivate"
	ActionResetPassword  Action = "reset_password"
	ActionDelete         Action = "delete"
	ActionChangeRole     Action = "change_role"
	ActionTransfer       Action = "transfer_ownership"
	ActionChangePassword Action = "change_own_password"
)

// Actions lists every action (tests walk the full matrix).
var Actions = []Action{ActionInvite, ActionListUsers, ActionDeactivate, ActionReactivate, ActionResetPassword,
	ActionDelete, ActionChangeRole, ActionTransfer, ActionChangePassword}

// Authorize is the single role matrix (design D1). target is nil for actions
// without one. Checks run in order: a self-target gives ErrSelfAction, then an
// unauthorized actor gives ErrForbidden. Target state (deactivated or active)
// is checked by the service methods afterwards.
func Authorize(actor *User, action Action, target *User) error {
	if actor == nil {
		return ErrForbidden
	}
	switch action {
	case ActionChangePassword:
		return nil
	case ActionInvite, ActionListUsers:
		if actor.Role == RoleOwner || actor.Role == RoleAdmin {
			return nil
		}
		return ErrForbidden
	}
	if target == nil {
		return ErrForbidden
	}
	if target.ID == actor.ID {
		return ErrSelfAction
	}
	switch action {
	case ActionDeactivate, ActionReactivate, ActionResetPassword, ActionDelete:
		switch {
		case target.Role == RoleOwner:
			// The owner is never a target; the owner acting on itself was ErrSelfAction.
			return ErrForbidden
		case actor.Role == RoleOwner:
			return nil
		case actor.Role == RoleAdmin && target.Role == RoleMember:
			return nil
		}
		return ErrForbidden
	case ActionChangeRole, ActionTransfer:
		if actor.Role == RoleOwner && target.Role != RoleOwner {
			return nil
		}
		return ErrForbidden
	}
	return ErrForbidden
}

// CanInvite reports whether u may create, list and revoke invitations.
func (s *Service) CanInvite(u *User) bool { return Authorize(u, ActionInvite, nil) == nil }

// CanListUsers reports whether u may read the user list.
func (s *Service) CanListUsers(u *User) bool { return Authorize(u, ActionListUsers, nil) == nil }

// AdminUser is an entry of the user list. It never carries a credential.
type AdminUser struct {
	ID          string `json:"id"`
	Email       string `json:"email"`
	Name        string `json:"name"`
	Role        string `json:"role"`
	CreatedAt   int64  `json:"createdAt"`
	LastLoginAt *int64 `json:"lastLoginAt"`
	Status      string `json:"status"`
}

// account is a user with its status, read inside a transaction.
type account struct {
	User
	deactivatedAt *int64
	lastLoginAt   *int64
}

func (a *account) deactivated() bool { return a.deactivatedAt != nil }

func (a *account) admin() *AdminUser {
	st := StatusActive
	if a.deactivated() {
		st = StatusDeactivated
	}
	return &AdminUser{ID: a.ID, Email: a.Email, Name: a.Name, Role: a.Role, CreatedAt: a.CreatedAt, LastLoginAt: a.lastLoginAt, Status: st}
}

const accountColumns = `u.id,u.email,u.name,u.role,u.created_at,st.deactivated_at,st.last_login_at
	FROM users u LEFT JOIN user_status st ON st.user_id = u.id`

func scanAccount(row interface{ Scan(...any) error }) (*account, error) {
	var a account
	err := row.Scan(&a.ID, &a.Email, &a.Name, &a.Role, &a.CreatedAt, &a.deactivatedAt, &a.lastLoginAt)
	return &a, err
}

func loadAccount(ctx context.Context, q rowQuerier, id string) (*account, error) {
	a, err := scanAccount(q.QueryRowContext(ctx, "SELECT "+accountColumns+" WHERE u.id = ?", id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return a, err
}

// assertOneOwner is the single-owner guard run at the end of every role or
// status transaction (design D7); the database also refuses a second owner.
func assertOneOwner(ctx context.Context, tx *sql.Tx) error {
	var n int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM users u LEFT JOIN user_status st ON st.user_id = u.id
		WHERE u.role = 'owner' AND st.deactivated_at IS NULL`).Scan(&n); err != nil {
		return err
	}
	if n != 1 {
		return errors.New("auth: single-owner invariant violated")
	}
	return nil
}

// adminTx runs fn in a transaction with the actor and target re-read inside it
// and authorized for action, so concurrent role changes cannot be bypassed.
// Unknown targets give ErrNotFound; an actor whose account vanished or was
// deactivated gives ErrForbidden.
func (s *Service) adminTx(ctx context.Context, actorID, targetID string, action Action, fn func(tx *sql.Tx, actor, target *account) error) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	actor, err := loadAccount(ctx, tx, actorID)
	if errors.Is(err, ErrNotFound) {
		return ErrForbidden
	}
	if err != nil {
		return err
	}
	if actor.deactivated() {
		return ErrForbidden
	}
	target, err := loadAccount(ctx, tx, targetID)
	if err != nil {
		return err
	}
	if err := Authorize(&actor.User, action, &target.User); err != nil {
		return err
	}
	if err := fn(tx, actor, target); err != nil {
		return err
	}
	if err := assertOneOwner(ctx, tx); err != nil {
		return err
	}
	return tx.Commit()
}

// ListUsers returns every account, oldest first, with derived status.
func (s *Service) ListUsers(ctx context.Context) ([]AdminUser, error) {
	rows, err := s.db.QueryContext(ctx, "SELECT "+accountColumns+" ORDER BY u.created_at, u.id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AdminUser{}
	for rows.Next() {
		a, err := scanAccount(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *a.admin())
	}
	return out, rows.Err()
}

// AdminUserByID returns one entry of the user list, or ErrNotFound.
func (s *Service) AdminUserByID(ctx context.Context, id string) (*AdminUser, error) {
	a, err := loadAccount(ctx, s.db, id)
	if err != nil {
		return nil, err
	}
	return a.admin(), nil
}

// SetRole moves an active account between admin and member. Owner only.
func (s *Service) SetRole(ctx context.Context, actorID, targetID, role string) (*AdminUser, error) {
	if role != RoleAdmin && role != RoleMember {
		return nil, ErrInvalidRole
	}
	var out *AdminUser
	err := s.adminTx(ctx, actorID, targetID, ActionChangeRole, func(tx *sql.Tx, actor, target *account) error {
		if target.deactivated() {
			return ErrAccountDeactivated
		}
		if target.Role != role {
			res, err := tx.ExecContext(ctx, "UPDATE users SET role = ? WHERE id = ? AND role <> 'owner'", role, target.ID)
			if err != nil {
				return err
			}
			if n, _ := res.RowsAffected(); n != 1 {
				return ErrForbidden
			}
			if err := s.audit.RecordTx(ctx, tx, audit.RoleChanged(actor.ID, target.ID, target.Role, role)); err != nil {
				return err
			}
			target.Role = role
		}
		out = target.admin()
		return nil
	})
	return out, err
}

// Deactivate blocks an account's sign-in and, in the same transaction, deletes
// all its sessions and API tokens and revokes its pending invitations and
// unused reset links (design D3). Its data is kept. The caller closes the
// account's open event streams after it returns.
func (s *Service) Deactivate(ctx context.Context, actorID, targetID string) (*AdminUser, error) {
	var out *AdminUser
	err := s.adminTx(ctx, actorID, targetID, ActionDeactivate, func(tx *sql.Tx, actor, target *account) error {
		if target.deactivated() {
			return ErrAccountDeactivated
		}
		now := s.clock().UnixMilli()
		for _, st := range []struct {
			q    string
			args []any
		}{
			{`INSERT INTO user_status(user_id, deactivated_at) VALUES(?, ?)
				ON CONFLICT(user_id) DO UPDATE SET deactivated_at = excluded.deactivated_at`, []any{target.ID, now}},
			{"DELETE FROM sessions WHERE user_id = ?", []any{target.ID}},
			{"DELETE FROM api_tokens WHERE user_id = ?", []any{target.ID}},
			// CalDAV app passwords are revoked too (OpenSpec `caldav`).
			{"UPDATE app_passwords SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL", []any{now, target.ID}},
			{"UPDATE invitations SET revoked_at = ? WHERE created_by = ? AND accepted_at IS NULL AND revoked_at IS NULL", []any{now, target.ID}},
			// Project invite links too (OpenSpec `project-invite-links`).
			{"UPDATE project_invites SET revoked_at = ? WHERE created_by = ? AND accepted_at IS NULL AND revoked_at IS NULL", []any{now, target.ID}},
			{"UPDATE password_resets SET revoked_at = ? WHERE user_id = ? AND used_at IS NULL AND revoked_at IS NULL", []any{now, target.ID}},
			// Public links too (OpenSpec `public-links`).
			{"UPDATE public_links SET revoked_at = ? WHERE created_by = ? AND revoked_at IS NULL", []any{now, target.ID}},
		} {
			if _, err := tx.ExecContext(ctx, st.q, st.args...); err != nil {
				return err
			}
		}
		if err := s.audit.RecordTx(ctx, tx, audit.UserDeactivated(actor.ID, target.ID)); err != nil {
			return err
		}
		target.deactivatedAt = &now
		out = target.admin()
		return nil
	})
	return out, err
}

// Reactivate lifts a deactivation. Revoked credentials are not restored.
func (s *Service) Reactivate(ctx context.Context, actorID, targetID string) (*AdminUser, error) {
	var out *AdminUser
	err := s.adminTx(ctx, actorID, targetID, ActionReactivate, func(tx *sql.Tx, actor, target *account) error {
		if !target.deactivated() {
			return ErrAccountActive
		}
		if _, err := tx.ExecContext(ctx, "UPDATE user_status SET deactivated_at = NULL WHERE user_id = ?", target.ID); err != nil {
			return err
		}
		if err := s.audit.RecordTx(ctx, tx, audit.UserReactivated(actor.ID, target.ID)); err != nil {
			return err
		}
		target.deactivatedAt = nil
		out = target.admin()
		return nil
	})
	return out, err
}

// AccountDataHook removes an account's synced data inside the deletion
// transaction and returns the other accounts whose devices must be told
// (design D4's beforeDelete hook, filled in by project-sharing).
type AccountDataHook func(ctx context.Context, tx *sql.Tx, userID string) ([]string, error)

// SetBeforeDelete installs the hook run by DeleteUser before the account row is
// deleted. Call it during wiring.
func (s *Service) SetBeforeDelete(h AccountDataHook) { s.beforeDelete = h }

// DeleteUser permanently removes an account and all its server data in one
// transaction: the beforeDelete hook removes ops and fields, and deleting the
// users row cascades to sessions, tokens, reset links, passkeys, invitations it
// created and the rest. confirmEmail must match the account's email,
// case-insensitively. It returns the other accounts whose devices must sync.
func (s *Service) DeleteUser(ctx context.Context, actorID, targetID, confirmEmail string) ([]string, error) {
	var notify []string
	err := s.adminTx(ctx, actorID, targetID, ActionDelete, func(tx *sql.Tx, actor, target *account) error {
		if !strings.EqualFold(strings.TrimSpace(confirmEmail), target.Email) {
			return ErrConfirmationMismatch
		}
		if s.beforeDelete != nil {
			var err error
			if notify, err = s.beforeDelete(ctx, tx, target.ID); err != nil {
				return err
			}
		}
		if _, err := tx.ExecContext(ctx, "DELETE FROM users WHERE id = ?", target.ID); err != nil {
			return err
		}
		return s.audit.RecordTx(ctx, tx, audit.UserDeleted(actor.ID, target.ID, target.Email))
	})
	return notify, err
}

// PasswordReset describes an issued reset link (never its secret).
type PasswordReset struct {
	ID        string `json:"id"`
	UserID    string `json:"userId"`
	ExpiresAt int64  `json:"expiresAt"`
}

// ResetPreview is what the holder of a reset link may learn.
type ResetPreview struct {
	Email     string `json:"email"`
	ExpiresAt int64  `json:"expiresAt"`
}

// IssuePasswordReset creates a single-use reset link for an active account on
// behalf of actorID, revoking earlier unused links in the same transaction. The
// plaintext secret is returned exactly once; only its hash is stored.
func (s *Service) IssuePasswordReset(ctx context.Context, actorID, targetID string, ttl time.Duration) (*PasswordReset, string, error) {
	if ttl == 0 {
		ttl = DefaultResetTTL
	}
	if ttl < MinResetTTL || ttl > MaxResetTTL {
		return nil, "", ErrInvalidResetExpiry
	}
	var pr *PasswordReset
	var secret string
	err := s.adminTx(ctx, actorID, targetID, ActionResetPassword, func(tx *sql.Tx, actor, target *account) error {
		var err error
		pr, secret, err = s.issueResetTx(ctx, tx, actor.ID, target, ttl)
		return err
	})
	return pr, secret, err
}

func (s *Service) issueResetTx(ctx context.Context, tx *sql.Tx, actorID string, target *account, ttl time.Duration) (*PasswordReset, string, error) {
	if target.deactivated() {
		return nil, "", ErrAccountDeactivated
	}
	now := s.clock()
	if _, err := tx.ExecContext(ctx, "UPDATE password_resets SET revoked_at = ? WHERE user_id = ? AND used_at IS NULL AND revoked_at IS NULL",
		now.UnixMilli(), target.ID); err != nil {
		return nil, "", err
	}
	secret := "otr_" + ids.Secret(32)
	pr := &PasswordReset{ID: ids.New(), UserID: target.ID, ExpiresAt: now.Add(ttl).UnixMilli()}
	var createdBy any
	if actorID != "" {
		createdBy = actorID
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO password_resets(id,token_hash,user_id,created_by,created_at,expires_at) VALUES(?,?,?,?,?,?)`,
		pr.ID, hashToken(secret), target.ID, createdBy, now.UnixMilli(), pr.ExpiresAt); err != nil {
		return nil, "", err
	}
	if err := s.audit.RecordTx(ctx, tx, audit.PasswordResetIssued(actorID, target.ID, pr.ID)); err != nil {
		return nil, "", err
	}
	return pr, secret, nil
}

// RequestPasswordReset issues a 24-hour reset link for the active account with
// email, for the self-service request (OpenSpec `outgoing-email` D5). An
// unknown or deactivated address returns a nil user and no error, so the caller
// answers the same way. The event has no actor.
func (s *Service) RequestPasswordReset(ctx context.Context, email string) (*User, *PasswordReset, string, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, nil, "", err
	}
	defer tx.Rollback()
	a, err := scanAccount(tx.QueryRowContext(ctx, "SELECT "+accountColumns+" WHERE u.email = ?", normalizeEmail(email)))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil, "", nil
	}
	if err != nil {
		return nil, nil, "", err
	}
	if a.deactivated() {
		return nil, nil, "", nil
	}
	pr, secret, err := s.issueResetTx(ctx, tx, "", a, DefaultResetTTL)
	if err != nil {
		return nil, nil, "", err
	}
	if err := tx.Commit(); err != nil {
		return nil, nil, "", err
	}
	return &a.User, pr, secret, nil
}

// RevokePasswordReset cancels a pending reset link (after its email could not
// be sent, so no secret stays usable that nobody received).
func (s *Service) RevokePasswordReset(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, "UPDATE password_resets SET revoked_at = ? WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL",
		s.clock().UnixMilli(), id)
	return err
}

// IssueOwnerPasswordReset creates a 24-hour reset link for the owner (the
// `opentodo reset-owner-password` subcommand, run against the data directory).
// The owner is never a target of the HTTP reset route.
func (s *Service) IssueOwnerPasswordReset(ctx context.Context) (*User, *PasswordReset, string, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, nil, "", err
	}
	defer tx.Rollback()
	a, err := scanAccount(tx.QueryRowContext(ctx, "SELECT "+accountColumns+" WHERE u.role = 'owner'"))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil, "", ErrNotFound
	}
	if err != nil {
		return nil, nil, "", err
	}
	pr, secret, err := s.issueResetTx(ctx, tx, "", a, DefaultResetTTL)
	if err != nil {
		return nil, nil, "", err
	}
	if err := tx.Commit(); err != nil {
		return nil, nil, "", err
	}
	return &a.User, pr, secret, nil
}

// PreviewPasswordReset resolves a pending reset link to the account's email.
// Every failure mode is ErrResetInvalid.
func (s *Service) PreviewPasswordReset(ctx context.Context, secret string) (*ResetPreview, error) {
	var p ResetPreview
	err := s.db.QueryRowContext(ctx, `SELECT u.email, r.expires_at FROM password_resets r JOIN users u ON u.id = r.user_id
		LEFT JOIN user_status st ON st.user_id = u.id
		WHERE r.token_hash = ? AND r.used_at IS NULL AND r.revoked_at IS NULL AND r.expires_at > ? AND st.deactivated_at IS NULL`,
		hashToken(secret), s.clock().UnixMilli()).Scan(&p.Email, &p.ExpiresAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrResetInvalid
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// ResetPassword consumes a reset link: a conditional update marks it used, the
// new password hash is stored and every session of the account is deleted, all
// in one transaction, so concurrent uses yield exactly one success. API tokens
// are kept (a reset means "forgot password", not "compromised").
func (s *Service) ResetPassword(ctx context.Context, secret, password string) error {
	if err := CheckPasswordPolicy(password); err != nil {
		return err
	}
	// An unusable link is refused before paying for a hash (SEC-5); the
	// conditional update below decides.
	if _, err := s.PreviewPasswordReset(ctx, secret); err != nil {
		return err
	}
	hash, err := HashPassword(password)
	if err != nil {
		return err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	now := s.clock().UnixMilli()
	var id, userID string
	err = tx.QueryRowContext(ctx, `UPDATE password_resets SET used_at = ?
		WHERE token_hash = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?
		AND user_id NOT IN (SELECT user_id FROM user_status WHERE deactivated_at IS NOT NULL)
		RETURNING id, user_id`, now, hashToken(secret), now).Scan(&id, &userID)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrResetInvalid
	}
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "UPDATE users SET password_hash = ? WHERE id = ?", hash, userID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM sessions WHERE user_id = ?", userID); err != nil {
		return err
	}
	// Remembered browsers skip the second factor; after a reset they must
	// prove it again (route-authorization-policy, SEC-16).
	if _, err := tx.ExecContext(ctx, "DELETE FROM trusted_devices WHERE user_id = ?", userID); err != nil {
		return err
	}
	if err := s.audit.RecordTx(ctx, tx, audit.PasswordResetCompleted(userID, id)); err != nil {
		return err
	}
	return tx.Commit()
}

// ChangePassword sets a new password after verifying the current one. Every
// other session is deleted; keepSessionHash (the current session, empty for a
// bearer-token request) stays valid. API tokens are kept. A wrong current
// password returns ErrInvalidCredentials.
func (s *Service) ChangePassword(ctx context.Context, userID, current, next, keepSessionHash string) error {
	ok, err := s.CheckPassword(ctx, userID, current)
	if err != nil {
		return err
	}
	if !ok {
		return ErrInvalidCredentials
	}
	if err := CheckPasswordPolicy(next); err != nil {
		return err
	}
	hash, err := HashPassword(next)
	if err != nil {
		return err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, "UPDATE users SET password_hash = ? WHERE id = ?", hash, userID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?", userID, keepSessionHash); err != nil {
		return err
	}
	if err := s.audit.RecordTx(ctx, tx, audit.PasswordChanged(userID)); err != nil {
		return err
	}
	return tx.Commit()
}

// SignOutEverywhere ends every session of the account, forgets its remembered
// browsers and revokes its API tokens and CalDAV app passwords, in one
// transaction with one sessions.revoked audit event (route-authorization-policy,
// SEC-16). Passkeys, the second factor and the password stay.
func (s *Service) SignOutEverywhere(ctx context.Context, userID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	now := s.clock().UnixMilli()
	counts := make([]int64, 4)
	for i, st := range []struct {
		q    string
		args []any
	}{
		{"DELETE FROM sessions WHERE user_id = ?", []any{userID}},
		{"DELETE FROM trusted_devices WHERE user_id = ?", []any{userID}},
		{"DELETE FROM api_tokens WHERE user_id = ?", []any{userID}},
		{"UPDATE app_passwords SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL", []any{now, userID}},
	} {
		res, err := tx.ExecContext(ctx, st.q, st.args...)
		if err != nil {
			return fmt.Errorf("sign out everywhere: %w", err)
		}
		counts[i], _ = res.RowsAffected()
	}
	if err := s.audit.RecordTx(ctx, tx, audit.SignedOutEverywhere(userID, counts[0], counts[1], counts[2], counts[3])); err != nil {
		return err
	}
	return tx.Commit()
}

// TransferOwnership hands ownership from the owner to another active account
// after re-verifying the owner's password (design D7). In one transaction the
// owner becomes admin and the target becomes owner; exactly one owner exists
// before and after. A sender who is no longer owner gets ErrForbidden.
func (s *Service) TransferOwnership(ctx context.Context, actorID, targetID, password string) (*AdminUser, error) {
	ok, err := s.CheckPassword(ctx, actorID, password)
	if err != nil {
		return nil, err
	}
	var out *AdminUser
	err = s.adminTx(ctx, actorID, targetID, ActionTransfer, func(tx *sql.Tx, actor, target *account) error {
		if !ok {
			return ErrInvalidCredentials
		}
		if target.deactivated() {
			return ErrAccountDeactivated
		}
		res, err := tx.ExecContext(ctx, "UPDATE users SET role = 'admin' WHERE id = ? AND role = 'owner'", actor.ID)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n != 1 {
			return ErrForbidden
		}
		res, err = tx.ExecContext(ctx, `UPDATE users SET role = 'owner' WHERE id = ? AND role <> 'owner'
			AND id NOT IN (SELECT user_id FROM user_status WHERE deactivated_at IS NOT NULL)`, target.ID)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n != 1 {
			return ErrAccountDeactivated
		}
		if err := s.audit.RecordTx(ctx, tx, audit.OwnerTransferred(actor.ID, target.ID)); err != nil {
			return err
		}
		target.Role = RoleOwner
		out = target.admin()
		return nil
	})
	return out, err
}

// isDeactivated reports whether the account is deactivated.
func (s *Service) isDeactivated(ctx context.Context, q rowQuerier, userID string) (bool, error) {
	var n int
	err := q.QueryRowContext(ctx, "SELECT COUNT(*) FROM user_status WHERE user_id = ? AND deactivated_at IS NOT NULL", userID).Scan(&n)
	return n > 0, err
}
