package auth

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/ids"
)

// App passwords (OpenSpec change `caldav`, design D2) are CalDAV-only
// credentials: a calendar client sends the account email and one of them with
// HTTP Basic. They are never accepted by the REST API (UserByToken looks only at
// api_tokens), and account passwords and API tokens are never accepted by the
// CalDAV endpoint (UserByAppPassword looks only at app_passwords).

// AppPasswordPrefix starts every app password secret.
const AppPasswordPrefix = "otap_"

// AppPassword is the public view of an app password (never the secret).
type AppPassword struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	CreatedAt  int64  `json:"createdAt"`
	LastUsedAt *int64 `json:"lastUsedAt"`
	RevokedAt  *int64 `json:"revokedAt"`
}

// CreateAppPassword issues an app password; the secret is returned exactly once.
// The row and its app_password.created audit event share one transaction.
func (s *Service) CreateAppPassword(ctx context.Context, userID, name string) (*AppPassword, string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		name = "Calendar app"
	}
	plain := AppPasswordPrefix + ids.Secret(32)
	p := &AppPassword{ID: ids.New(), Name: truncate(name, 100), CreatedAt: time.Now().UnixMilli()}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, "", err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `INSERT INTO app_passwords(id,user_id,name,hash,created_at) VALUES(?,?,?,?,?)`,
		p.ID, userID, p.Name, hashToken(plain), p.CreatedAt); err != nil {
		return nil, "", err
	}
	if err := s.audit.RecordTx(ctx, tx, audit.AppPasswordCreated(userID, p.ID, p.Name)); err != nil {
		return nil, "", err
	}
	if err := tx.Commit(); err != nil {
		return nil, "", err
	}
	return p, plain, nil
}

// ListAppPasswords returns a user's app passwords, newest first, revoked ones included.
func (s *Service) ListAppPasswords(ctx context.Context, userID string) ([]AppPassword, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,name,created_at,last_used_at,revoked_at FROM app_passwords
		WHERE user_id = ? ORDER BY created_at DESC, id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AppPassword{}
	for rows.Next() {
		var p AppPassword
		if err := rows.Scan(&p.ID, &p.Name, &p.CreatedAt, &p.LastUsedAt, &p.RevokedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// RevokeAppPassword revokes one of the user's app passwords (ErrNotFound for a
// foreign, unknown or already revoked one), recording app_password.revoked.
func (s *Service) RevokeAppPassword(ctx context.Context, userID, id string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var name string
	err = tx.QueryRowContext(ctx, `SELECT name FROM app_passwords WHERE id = ? AND user_id = ? AND revoked_at IS NULL`, id, userID).Scan(&name)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE app_passwords SET revoked_at = ? WHERE id = ?`, time.Now().UnixMilli(), id); err != nil {
		return err
	}
	if err := s.audit.RecordTx(ctx, tx, audit.AppPasswordRevoked(userID, id, name)); err != nil {
		return err
	}
	return tx.Commit()
}

// UserByAppPassword resolves Basic credentials (account email and app password)
// to the account and the app password's id, or ErrNotFound. Revoked passwords,
// deactivated accounts, a mismatched email and anything that is not an app
// password (account passwords, API tokens) are all ErrNotFound. A success
// updates the password's last-use time, at most once per LastUseInterval.
func (s *Service) UserByAppPassword(ctx context.Context, email, secret string) (*User, string, error) {
	if !strings.HasPrefix(secret, AppPasswordPrefix) {
		return nil, "", ErrNotFound
	}
	var u User
	var id string
	var lastUsed sql.NullInt64
	err := s.db.QueryRowContext(ctx, `SELECT p.id,p.last_used_at,u.id,u.email,u.name,u.role,u.created_at FROM app_passwords p
		JOIN users u ON u.id = p.user_id WHERE p.hash = ? AND p.revoked_at IS NULL
		AND u.id NOT IN (SELECT user_id FROM user_status WHERE deactivated_at IS NOT NULL)`, hashToken(secret)).
		Scan(&id, &lastUsed, &u.ID, &u.Email, &u.Name, &u.Role, &u.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, "", ErrNotFound
	}
	if err != nil {
		return nil, "", err
	}
	if normalizeEmail(email) != u.Email {
		return nil, "", ErrNotFound
	}
	if now := time.Now().UnixMilli(); lastUseStale(lastUsed, now) {
		_, _ = s.db.ExecContext(ctx, `UPDATE app_passwords SET last_used_at = ? WHERE id = ?`, now, id)
	}
	return &u, id, nil
}
