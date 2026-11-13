package auth

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"github.com/OpenTodoApp/opentodo/internal/audit"
	"github.com/OpenTodoApp/opentodo/internal/ids"
	"github.com/OpenTodoApp/opentodo/internal/syncscope"
	"github.com/OpenTodoApp/opentodo/internal/textutil"
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
	// Scope is the part of the account the password reaches (sync-scope).
	Scope syncscope.Scope `json:"scope"`
	// Events serves the calendars as events instead of to-dos (caldav-events).
	Events bool `json:"events"`
}

// CreateAppPassword issues an app password; the secret is returned exactly once.
// The row and its app_password.created audit event share one transaction.
func (s *Service) CreateAppPassword(ctx context.Context, userID, name string) (*AppPassword, string, error) {
	return s.CreateScopedAppPassword(ctx, userID, name, syncscope.Everything())
}

// CreateScopedAppPassword is CreateAppPassword with a normalized scope.
func (s *Service) CreateScopedAppPassword(ctx context.Context, userID, name string, scope syncscope.Scope) (*AppPassword, string, error) {
	return s.CreateAppPasswordAs(ctx, userID, name, scope, false)
}

// CreateAppPasswordAs is CreateScopedAppPassword that, with events, shows the
// calendars as events instead of to-dos (caldav-events D1), fixed for the
// password's life.
func (s *Service) CreateAppPasswordAs(ctx context.Context, userID, name string, scope syncscope.Scope, events bool) (*AppPassword, string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		name = "Calendar app"
	}
	plain := AppPasswordPrefix + ids.Secret(32)
	p := &AppPassword{ID: ids.New(), Name: textutil.Truncate(name, 100), CreatedAt: s.clock().UnixMilli(), Scope: syncscope.Parse(scope.Text()), Events: events}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, "", err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `INSERT INTO app_passwords(id,user_id,name,hash,created_at) VALUES(?,?,?,?,?)`,
		p.ID, userID, p.Name, hashToken(plain), p.CreatedAt); err != nil {
		return nil, "", err
	}
	if !p.Scope.IsAll() {
		if _, err := tx.ExecContext(ctx, `INSERT INTO app_password_scopes(app_password_id,scope) VALUES(?,?)`, p.ID, p.Scope.Text()); err != nil {
			return nil, "", err
		}
	}
	if events {
		if _, err := tx.ExecContext(ctx, `INSERT INTO app_password_events(app_password_id) VALUES(?)`, p.ID); err != nil {
			return nil, "", err
		}
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
	rows, err := s.db.QueryContext(ctx, `SELECT p.id,p.name,p.created_at,p.last_used_at,p.revoked_at,COALESCE(sc.scope,''),ev.app_password_id IS NOT NULL FROM app_passwords p
		LEFT JOIN app_password_scopes sc ON sc.app_password_id = p.id LEFT JOIN app_password_events ev ON ev.app_password_id = p.id
		WHERE p.user_id = ? ORDER BY p.created_at DESC, p.id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AppPassword{}
	for rows.Next() {
		var p AppPassword
		var scope string
		if err := rows.Scan(&p.ID, &p.Name, &p.CreatedAt, &p.LastUsedAt, &p.RevokedAt, &scope, &p.Events); err != nil {
			return nil, err
		}
		p.Scope = syncscope.Parse(scope)
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
	if _, err := tx.ExecContext(ctx, `UPDATE app_passwords SET revoked_at = ? WHERE id = ?`, s.clock().UnixMilli(), id); err != nil {
		return err
	}
	if err := s.audit.RecordTx(ctx, tx, audit.AppPasswordRevoked(userID, id, name)); err != nil {
		return err
	}
	return tx.Commit()
}

// SetAppPasswordScope changes the scope of one of the user's live app
// passwords (ErrNotFound for a foreign, unknown or revoked one). It takes
// effect on the password's next request.
func (s *Service) SetAppPasswordScope(ctx context.Context, userID, id string, scope syncscope.Scope) (*AppPassword, error) {
	var n int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM app_passwords WHERE id = ? AND user_id = ? AND revoked_at IS NULL`, id, userID).Scan(&n); err != nil {
		return nil, err
	}
	if n == 0 {
		return nil, ErrNotFound
	}
	var err error
	if scope.IsAll() {
		_, err = s.db.ExecContext(ctx, `DELETE FROM app_password_scopes WHERE app_password_id = ?`, id)
	} else {
		_, err = s.db.ExecContext(ctx, `INSERT INTO app_password_scopes(app_password_id,scope) VALUES(?,?)
			ON CONFLICT(app_password_id) DO UPDATE SET scope = excluded.scope`, id, scope.Text())
	}
	if err != nil {
		return nil, err
	}
	list, err := s.ListAppPasswords(ctx, userID)
	if err != nil {
		return nil, err
	}
	for i := range list {
		if list[i].ID == id {
			return &list[i], nil
		}
	}
	return nil, ErrNotFound
}

// UserByAppPassword resolves Basic credentials (account email and app password)
// to the account and the app password's id, or ErrNotFound. Revoked passwords,
// deactivated accounts, a mismatched email and anything that is not an app
// password (account passwords, API tokens) are all ErrNotFound. A success
// updates the password's last-use time, at most once per LastUseInterval.
func (s *Service) UserByAppPassword(ctx context.Context, email, secret string) (*User, string, error) {
	u, p, err := s.AppPasswordUser(ctx, email, secret)
	if err != nil {
		return nil, "", err
	}
	return u, p.ID, nil
}

// AppPasswordUser is UserByAppPassword returning the app password's id and
// scope (sync-scope).
func (s *Service) AppPasswordUser(ctx context.Context, email, secret string) (*User, *AppPassword, error) {
	if !strings.HasPrefix(secret, AppPasswordPrefix) {
		return nil, nil, ErrNotFound
	}
	var u User
	var id, scope string
	var events bool
	var lastUsed sql.NullInt64
	err := s.db.QueryRowContext(ctx, `SELECT p.id,p.last_used_at,COALESCE(sc.scope,''),ev.app_password_id IS NOT NULL,u.id,u.email,u.name,u.role,u.created_at FROM app_passwords p
		JOIN users u ON u.id = p.user_id LEFT JOIN app_password_scopes sc ON sc.app_password_id = p.id
		LEFT JOIN app_password_events ev ON ev.app_password_id = p.id WHERE p.hash = ? AND p.revoked_at IS NULL
		AND u.id NOT IN (SELECT user_id FROM user_status WHERE deactivated_at IS NOT NULL)`, hashToken(secret)).
		Scan(&id, &lastUsed, &scope, &events, &u.ID, &u.Email, &u.Name, &u.Role, &u.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil, ErrNotFound
	}
	if err != nil {
		return nil, nil, err
	}
	if normalizeEmail(email) != u.Email {
		return nil, nil, ErrNotFound
	}
	if now := s.clock().UnixMilli(); lastUseStale(lastUsed, now) {
		_, _ = s.db.ExecContext(ctx, `UPDATE app_passwords SET last_used_at = ? WHERE id = ?`, now, id)
	}
	return &u, &AppPassword{ID: id, Scope: syncscope.Parse(scope), Events: events}, nil
}
