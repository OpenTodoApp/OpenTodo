package auth

import (
	"context"
	"database/sql"
	"errors"
	"net/mail"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/ids"
)

// Verified open sign-up (OpenSpec `outgoing-email` D4): the account is created
// only when the mailed link is used.

// SignupTTL is how long a verification link stays valid.
const SignupTTL = 24 * time.Hour

// ErrVerificationInvalid covers every unusable verification token (unknown,
// expired, replaced or used), so the answer never says which.
var ErrVerificationInvalid = errors.New("this confirmation link is no longer valid")

// PendingSignup is what the verification screen shows.
type PendingSignup struct {
	Email     string `json:"email"`
	ExpiresAt int64  `json:"expiresAt"`
}

// BeginSignup stores a pending sign-up for email, replacing an earlier one, and
// returns the link secret. When the address already has an account nothing is
// stored and existing is true, so the caller sends the other message with the
// same answer. Callers use it only while open sign-up applies.
func (s *Service) BeginSignup(ctx context.Context, email, name, password, lang string) (secret string, existing bool, err error) {
	email = normalizeEmail(email)
	if _, err := mail.ParseAddress(email); err != nil || email == "" {
		return "", false, ErrInvalidEmail
	}
	if err := CheckPasswordPolicy(password); err != nil {
		return "", false, err
	}
	hash, err := HashPassword(password)
	if err != nil {
		return "", false, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", false, err
	}
	defer tx.Rollback()
	var n int
	if err := tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM users WHERE email = ?", email).Scan(&n); err != nil {
		return "", false, err
	}
	if n > 0 {
		return "", true, nil
	}
	now := s.clock()
	secret = "otv_" + ids.Secret(32)
	if _, err := tx.ExecContext(ctx, "DELETE FROM signup_verifications WHERE email = ?", email); err != nil {
		return "", false, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO signup_verifications(id,token_hash,email,name,password_hash,lang,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)`,
		ids.New(), hashToken(secret), email, truncate(strings.TrimSpace(name), 200), hash, lang, now.UnixMilli(), now.Add(SignupTTL).UnixMilli()); err != nil {
		return "", false, err
	}
	return secret, false, tx.Commit()
}

// PreviewSignup resolves a pending verification token.
func (s *Service) PreviewSignup(ctx context.Context, secret string) (*PendingSignup, error) {
	var p PendingSignup
	err := s.db.QueryRowContext(ctx, "SELECT email, expires_at FROM signup_verifications WHERE token_hash = ? AND expires_at > ?",
		hashToken(secret), s.clock().UnixMilli()).Scan(&p.Email, &p.ExpiresAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrVerificationInvalid
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// CompleteSignup creates the member account of a pending sign-up and consumes
// the token in one transaction. The policy and the unique address are checked
// again: open sign-up turned off answers ErrSignupClosed, an account created
// meanwhile (by an invitation) ErrEmailTaken, and both discard the pending row.
func (s *Service) CompleteSignup(ctx context.Context, secret string) (*User, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var id, email, name, hash string
	err = tx.QueryRowContext(ctx, "SELECT id, email, name, password_hash FROM signup_verifications WHERE token_hash = ? AND expires_at > ?",
		hashToken(secret), s.clock().UnixMilli()).Scan(&id, &email, &name, &hash)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrVerificationInvalid
	}
	if err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM signup_verifications WHERE id = ?", id); err != nil {
		return nil, err
	}
	discard := func(e error) (*User, error) {
		if err := tx.Commit(); err != nil {
			return nil, err
		}
		return nil, e
	}
	if !s.allowSignup {
		return discard(ErrSignupClosed)
	}
	var n int
	if err := tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM users WHERE email = ?", email).Scan(&n); err != nil {
		return nil, err
	}
	if n > 0 {
		return discard(ErrEmailTaken)
	}
	// The pending sign-up stays: the link works again once there is room.
	if err := s.checkMemberLimit(ctx, tx); err != nil {
		return nil, err
	}
	u := &User{ID: ids.New(), Email: email, Name: name, Role: "member", CreatedAt: s.clock().UnixMilli()}
	if _, err := tx.ExecContext(ctx, "INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)",
		u.ID, u.Email, u.Name, hash, u.Role, u.CreatedAt); err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			return nil, ErrEmailTaken
		}
		return nil, err
	}
	return u, tx.Commit()
}

// PruneSignups deletes expired pending sign-ups (run with the hourly pruner).
func (s *Service) PruneSignups(ctx context.Context) (int64, error) {
	res, err := s.db.ExecContext(ctx, "DELETE FROM signup_verifications WHERE expires_at <= ?", s.clock().UnixMilli())
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// OpenSignup reports whether the operator enabled open sign-up.
func (s *Service) OpenSignup() bool { return s.allowSignup }

// CancelSignup discards a pending sign-up whose message could not be sent.
func (s *Service) CancelSignup(ctx context.Context, secret string) error {
	_, err := s.db.ExecContext(ctx, "DELETE FROM signup_verifications WHERE token_hash = ?", hashToken(secret))
	return err
}
