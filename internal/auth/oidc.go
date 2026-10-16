package auth

import (
	"context"
	"database/sql"
	"errors"
	"net/mail"
	"strings"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/ids"
)

// Single sign-on accounts (OpenSpec change `oidc-login`): mapping provider
// identities to accounts, just-in-time provisioning under the sign-up policy,
// linking and unlinking, and the SSO-only rule for local credentials. The
// provider protocol itself lives in internal/oidc. Nothing here is synced.

var (
	ErrIdentityTaken   = errors.New("this identity is already linked to another account")
	ErrEmailUnverified = errors.New("the provider did not confirm a verified email address for this identity")
	ErrLastCredential  = errors.New("this is the last way to sign in to the account; add another before removing it")
	ErrSSORequired     = errors.New("this server requires signing in with single sign-on")
)

// ExternalIdentity is what a verified identity token says about the user.
type ExternalIdentity struct {
	Issuer        string
	Subject       string
	Email         string
	EmailVerified bool
	Name          string
}

// Identity is the public view of a linked identity.
type Identity struct {
	ID          string `json:"id"`
	Issuer      string `json:"issuer"`
	Email       string `json:"email"`
	CreatedAt   int64  `json:"createdAt"`
	LastLoginAt *int64 `json:"lastLoginAt"`
}

// SetSSOOnly installs the check for SSO-only mode (wired by the HTTP layer to
// the provider configuration). Without it local sign-in is always allowed.
func (s *Service) SetSSOOnly(fn func(ctx context.Context) bool) { s.ssoOnly = fn }

// SSOOnly reports whether SSO-only mode is in force.
func (s *Service) SSOOnly(ctx context.Context) bool { return s.ssoOnly != nil && s.ssoOnly(ctx) }

// LocalLoginAllowed reports whether u may sign in with a password or passkey
// (design D6): always, unless SSO-only mode is on and u is not the owner. The
// owner's local credentials are the break-glass access. Bearer tokens never
// reach this check.
func (s *Service) LocalLoginAllowed(ctx context.Context, u *User) bool {
	if u != nil && u.Role == "owner" {
		return true
	}
	return !s.SSOOnly(ctx)
}

// identityUser resolves (issuer, subject) to its account.
func identityUser(ctx context.Context, q rowQuerier, issuer, subject string) (*User, string, error) {
	var u User
	var identityID string
	err := q.QueryRowContext(ctx, `SELECT i.id,u.id,u.email,u.name,u.role,u.created_at FROM identities i
		JOIN users u ON u.id = i.user_id WHERE i.issuer = ? AND i.subject = ?`, issuer, subject).
		Scan(&identityID, &u.ID, &u.Email, &u.Name, &u.Role, &u.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, "", nil
	}
	if err != nil {
		return nil, "", err
	}
	return &u, identityID, nil
}

// MatchOrProvision maps a verified identity to an account (design D3):
//  1. a linked (issuer, subject) signs in to its account, whatever its email is now;
//  2. otherwise a verified email equal to an account's email links to it;
//  3. otherwise a member account is created when open sign-up or allowProvision allows it;
//  4. otherwise ErrSignupClosed.
//
// An absent or unverified email never links or provisions (ErrEmailUnverified).
// created reports a new account; linked reports a new link.
func (s *Service) MatchOrProvision(ctx context.Context, id ExternalIdentity, allowProvision bool, provider string) (u *User, created, linked bool, err error) {
	if id.Issuer == "" || id.Subject == "" {
		return nil, false, false, errors.New("identity without issuer or subject")
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, false, false, err
	}
	defer tx.Rollback()
	now := s.clock().UnixMilli()
	u, identityID, err := identityUser(ctx, tx, id.Issuer, id.Subject)
	if err != nil {
		return nil, false, false, err
	}
	email := normalizeEmail(id.Email)
	if u != nil {
		if _, err := tx.ExecContext(ctx, "UPDATE identities SET last_login_at = ?, email = ? WHERE id = ?", now, truncate(email, 320), identityID); err != nil {
			return nil, false, false, err
		}
		return u, false, false, tx.Commit()
	}
	if email == "" || !id.EmailVerified {
		return nil, false, false, ErrEmailUnverified
	}
	if _, err := mail.ParseAddress(email); err != nil {
		return nil, false, false, ErrEmailUnverified
	}
	var existing User
	err = tx.QueryRowContext(ctx, "SELECT id,email,name,role,created_at FROM users WHERE email = ?", email).
		Scan(&existing.ID, &existing.Email, &existing.Name, &existing.Role, &existing.CreatedAt)
	switch {
	case err == nil:
		u = &existing
	case errors.Is(err, sql.ErrNoRows):
		if !s.allowSignup && !allowProvision {
			return nil, false, false, ErrSignupClosed
		}
		if err := s.checkMemberLimit(ctx, tx); err != nil {
			return nil, false, false, err
		}
		name := strings.TrimSpace(id.Name)
		u = &User{ID: ids.New(), Email: email, Name: truncate(name, 100), Role: "member", CreatedAt: now}
		// No password: the account signs in through the provider (an empty hash
		// never verifies). It can add a passkey later.
		if _, err := tx.ExecContext(ctx, "INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)",
			u.ID, u.Email, u.Name, "", u.Role, u.CreatedAt); err != nil {
			if strings.Contains(err.Error(), "UNIQUE") {
				return nil, false, false, ErrEmailTaken
			}
			return nil, false, false, err
		}
		created = true
	default:
		return nil, false, false, err
	}
	if err := s.insertIdentity(ctx, tx, u.ID, id, now, provider); err != nil {
		return nil, false, false, err
	}
	return u, created, true, tx.Commit()
}

func (s *Service) insertIdentity(ctx context.Context, tx *sql.Tx, userID string, id ExternalIdentity, now int64, provider string) error {
	if _, err := tx.ExecContext(ctx, `INSERT INTO identities(id,user_id,issuer,subject,email,created_at,last_login_at)
		VALUES(?,?,?,?,?,?,?)`, ids.New(), userID, id.Issuer, id.Subject, truncate(normalizeEmail(id.Email), 320), now, now); err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			return ErrIdentityTaken
		}
		return err
	}
	return s.audit.RecordTx(ctx, tx, audit.IdentityLinked(userID, provider))
}

// LinkIdentity links id to the signed-in account userID (the flow started from
// Settings). already reports that it was linked to this account before; an
// identity linked to another account is ErrIdentityTaken. The email is not
// required to be verified: the user proved both sides in one session.
func (s *Service) LinkIdentity(ctx context.Context, userID string, id ExternalIdentity, provider string) (already bool, err error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer tx.Rollback()
	u, identityID, err := identityUser(ctx, tx, id.Issuer, id.Subject)
	if err != nil {
		return false, err
	}
	now := s.clock().UnixMilli()
	if u != nil {
		if u.ID != userID {
			return false, ErrIdentityTaken
		}
		if _, err := tx.ExecContext(ctx, "UPDATE identities SET last_login_at = ? WHERE id = ?", now, identityID); err != nil {
			return false, err
		}
		return true, tx.Commit()
	}
	if err := s.insertIdentity(ctx, tx, userID, id, now, provider); err != nil {
		return false, err
	}
	return false, tx.Commit()
}

// ListIdentities returns the identities linked to an account.
func (s *Service) ListIdentities(ctx context.Context, userID string) ([]Identity, error) {
	rows, err := s.db.QueryContext(ctx, "SELECT id,issuer,email,created_at,last_login_at FROM identities WHERE user_id = ? ORDER BY created_at", userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Identity{}
	for rows.Next() {
		var i Identity
		if err := rows.Scan(&i.ID, &i.Issuer, &i.Email, &i.CreatedAt, &i.LastLoginAt); err != nil {
			return nil, err
		}
		out = append(out, i)
	}
	return out, rows.Err()
}

// UnlinkIdentity removes one of the account's identities unless that would
// leave it unable to sign in under the current mode (ErrLastCredential):
// another identity counts while the provider is enabled; a password or passkey
// counts unless SSO-only mode refuses local sign-in for this account.
func (s *Service) UnlinkIdentity(ctx context.Context, u *User, identityID string, providerEnabled bool, provider string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var n int
	if err := tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM identities WHERE id = ? AND user_id = ?", identityID, u.ID).Scan(&n); err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	var others, passkeys int
	var hash string
	if err := tx.QueryRowContext(ctx, `SELECT
		(SELECT COUNT(*) FROM identities WHERE user_id = ? AND id <> ?),
		(SELECT COUNT(*) FROM passkeys WHERE user_id = ?),
		(SELECT password_hash FROM users WHERE id = ?)`, u.ID, identityID, u.ID, u.ID).Scan(&others, &passkeys, &hash); err != nil {
		return err
	}
	local := HasUsablePassword(hash) || passkeys > 0
	if !(providerEnabled && others > 0) && !(local && s.LocalLoginAllowed(ctx, u)) {
		return ErrLastCredential
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM identities WHERE id = ? AND user_id = ?", identityID, u.ID); err != nil {
		return err
	}
	if err := s.audit.RecordTx(ctx, tx, audit.IdentityUnlinked(u.ID, provider)); err != nil {
		return err
	}
	return tx.Commit()
}

// HasUsablePassword reports whether a stored hash can ever verify (accounts
// provisioned through the provider have none).
func HasUsablePassword(hash string) bool { return strings.HasPrefix(hash, "$argon2id$") }

// SetSessionIDToken keeps the identity-token hint of a provider session for
// RP-initiated sign-out (design D7). It is deleted with the session.
func (s *Service) SetSessionIDToken(ctx context.Context, secret, idToken string) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO session_oidc(token_hash,id_token) VALUES(?,?)
		ON CONFLICT(token_hash) DO UPDATE SET id_token = excluded.id_token`, hashToken(secret), idToken)
	return err
}

// SessionIDToken returns the hint stored for a session, and whether the
// session started through the provider.
func (s *Service) SessionIDToken(ctx context.Context, secret string) (string, bool, error) {
	var tok string
	err := s.db.QueryRowContext(ctx, "SELECT id_token FROM session_oidc WHERE token_hash = ?", hashToken(secret)).Scan(&tok)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	return tok, err == nil, err
}
