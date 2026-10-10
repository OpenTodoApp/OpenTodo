// Package auth owns users, browser sessions and API tokens.
package auth

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"net/mail"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/ids"
)

// User is the public view of an account.
type User struct {
	ID        string `json:"id"`
	Email     string `json:"email"`
	Name      string `json:"name"`
	Role      string `json:"role"`
	CreatedAt int64  `json:"createdAt"`
}

// Token is the public view of an API token (never includes the secret).
type Token struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	CreatedAt  int64  `json:"createdAt"`
	LastUsedAt *int64 `json:"lastUsedAt"`
}

var (
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrEmailTaken         = errors.New("an account with this email already exists")
	ErrSignupClosed       = errors.New("sign-up is disabled on this server")
	ErrInvalidEmail       = errors.New("invalid email address")
	ErrNotFound           = errors.New("not found")
)

// Service implements account operations on top of the database.
type Service struct {
	db          *sql.DB
	sessionTTL  time.Duration
	allowSignup bool
}

// NewService wires a Service.
func NewService(db *sql.DB, sessionTTL time.Duration, allowSignup bool) *Service {
	return &Service{db: db, sessionTTL: sessionTTL, allowSignup: allowSignup}
}

// UserCount returns how many accounts exist.
func (s *Service) UserCount(ctx context.Context) (int, error) {
	var n int
	err := s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users").Scan(&n)
	return n, err
}

// SignupAllowed reports whether a new account may be created right now.
// The very first account is always allowed; it becomes the owner.
func (s *Service) SignupAllowed(ctx context.Context) (bool, error) {
	n, err := s.UserCount(ctx)
	if err != nil {
		return false, err
	}
	return n == 0 || s.allowSignup, nil
}

// Register creates an account. The first account gets the owner role. After
// that, a non-empty invitation secret admits one member even while sign-up is
// closed; the invitation is consumed in the same transaction so it can create at
// most one account. Without an invitation the open sign-up policy applies.
func (s *Service) Register(ctx context.Context, email, name, password, invitation string) (*User, error) {
	email = normalizeEmail(email)
	if _, err := mail.ParseAddress(email); err != nil || email == "" {
		return nil, ErrInvalidEmail
	}
	if err := CheckPasswordPolicy(password); err != nil {
		return nil, err
	}
	hash, err := HashPassword(password)
	if err != nil {
		return nil, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var n int
	if err := tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM users").Scan(&n); err != nil {
		return nil, err
	}
	now := time.Now().UnixMilli()
	u := &User{ID: ids.New(), Email: email, Name: strings.TrimSpace(name), Role: "member", CreatedAt: now}
	invitation = strings.TrimSpace(invitation)
	switch {
	case n == 0:
		u.Role = "owner"
	case invitation != "":
		// Validate before inserting so a bad link is reported ahead of email_taken,
		// and the invitation stays pending whenever the account is not created.
		role, err := s.checkInvitation(ctx, tx, invitation, email, now)
		if err != nil {
			return nil, err
		}
		u.Role = role
	case !s.allowSignup:
		return nil, ErrSignupClosed
	}
	_, err = tx.ExecContext(ctx, "INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)",
		u.ID, u.Email, u.Name, hash, u.Role, u.CreatedAt)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			return nil, ErrEmailTaken
		}
		return nil, err
	}
	if n > 0 && invitation != "" {
		// Spent in the same transaction: either both the account and the acceptance
		// commit, or neither does.
		if err := s.markInvitationAccepted(ctx, tx, invitation, u.ID, now); err != nil {
			return nil, err
		}
	}
	return u, tx.Commit()
}

// Authenticate checks credentials and returns the user.
func (s *Service) Authenticate(ctx context.Context, email, password string) (*User, error) {
	email = normalizeEmail(email)
	var u User
	var hash string
	err := s.db.QueryRowContext(ctx, "SELECT id,email,name,role,created_at,password_hash FROM users WHERE email = ?", email).
		Scan(&u.ID, &u.Email, &u.Name, &u.Role, &u.CreatedAt, &hash)
	if errors.Is(err, sql.ErrNoRows) {
		// Burn comparable time so timing does not reveal whether the account exists.
		VerifyPassword("$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", password)
		return nil, ErrInvalidCredentials
	}
	if err != nil {
		return nil, err
	}
	if !VerifyPassword(hash, password) {
		return nil, ErrInvalidCredentials
	}
	return &u, nil
}

// CreateSession issues a browser session and returns the opaque cookie value.
func (s *Service) CreateSession(ctx context.Context, userID, userAgent string) (string, time.Time, error) {
	secret := ids.Secret(32)
	now := time.Now()
	exp := now.Add(s.sessionTTL)
	_, err := s.db.ExecContext(ctx, "INSERT INTO sessions(token_hash,user_id,created_at,expires_at,user_agent) VALUES(?,?,?,?,?)",
		hashToken(secret), userID, now.UnixMilli(), exp.UnixMilli(), truncate(userAgent, 200))
	return secret, exp, err
}

// UserBySession resolves a cookie value to a user, or ErrNotFound.
func (s *Service) UserBySession(ctx context.Context, secret string) (*User, error) {
	var u User
	err := s.db.QueryRowContext(ctx, `SELECT u.id,u.email,u.name,u.role,u.created_at FROM sessions s
		JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`,
		hashToken(secret), time.Now().UnixMilli()).Scan(&u.ID, &u.Email, &u.Name, &u.Role, &u.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &u, err
}

// DeleteSession revokes a session.
func (s *Service) DeleteSession(ctx context.Context, secret string) error {
	_, err := s.db.ExecContext(ctx, "DELETE FROM sessions WHERE token_hash = ?", hashToken(secret))
	return err
}

// CreateToken issues an API token. The plaintext is returned exactly once.
func (s *Service) CreateToken(ctx context.Context, userID, name string) (*Token, string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		name = "API token"
	}
	plain := "ot_" + ids.Secret(32)
	t := &Token{ID: ids.New(), Name: truncate(name, 100), CreatedAt: time.Now().UnixMilli()}
	_, err := s.db.ExecContext(ctx, "INSERT INTO api_tokens(id,user_id,name,token_hash,created_at) VALUES(?,?,?,?,?)",
		t.ID, userID, t.Name, hashToken(plain), t.CreatedAt)
	return t, plain, err
}

// UserByToken resolves an API token to its user, or ErrNotFound.
func (s *Service) UserByToken(ctx context.Context, plain string) (*User, error) {
	var u User
	var id string
	err := s.db.QueryRowContext(ctx, `SELECT t.id,u.id,u.email,u.name,u.role,u.created_at FROM api_tokens t
		JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?`, hashToken(plain)).
		Scan(&id, &u.ID, &u.Email, &u.Name, &u.Role, &u.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	_, _ = s.db.ExecContext(ctx, "UPDATE api_tokens SET last_used_at = ? WHERE id = ?", time.Now().UnixMilli(), id)
	return &u, nil
}

// ListTokens returns a user's tokens.
func (s *Service) ListTokens(ctx context.Context, userID string) ([]Token, error) {
	rows, err := s.db.QueryContext(ctx, "SELECT id,name,created_at,last_used_at FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC", userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Token{}
	for rows.Next() {
		var t Token
		if err := rows.Scan(&t.ID, &t.Name, &t.CreatedAt, &t.LastUsedAt); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// DeleteToken revokes a token owned by the user.
func (s *Service) DeleteToken(ctx context.Context, userID, tokenID string) error {
	res, err := s.db.ExecContext(ctx, "DELETE FROM api_tokens WHERE id = ? AND user_id = ?", tokenID, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func hashToken(secret string) string {
	sum := sha256.Sum256([]byte(secret))
	return hex.EncodeToString(sum[:])
}

func normalizeEmail(e string) string { return strings.ToLower(strings.TrimSpace(e)) }

func truncate(s string, n int) string {
	if len(s) > n {
		return s[:n]
	}
	return s
}
