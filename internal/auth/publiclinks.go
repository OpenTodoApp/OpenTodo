package auth

import (
	"context"
	"crypto/subtle"
	"database/sql"
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/ids"
)

// Public links (OpenSpec change `public-links`): reusable, revocable links that
// show one project to anyone who has them and, with `tick` rights, let them
// complete its tasks. Server-side data like project invite links: never ops,
// never synced, only a hash of the secret stored.

// PublicLinkSecretPrefix marks public link secrets.
const PublicLinkSecretPrefix = "otl_"

// MaxPublicLinkDays is the longest expiry; 0 means no expiry.
const MaxPublicLinkDays = 90

var (
	// ErrPublicLinkInvalid covers every unusable secret.
	ErrPublicLinkInvalid = errors.New("this link is no longer valid")
	// ErrInvalidPublicLink is a create request with bad rights, name or expiry.
	ErrInvalidPublicLink = errors.New("invalid public link")
)

// PublicLink is a manager's view of a link. It never carries the secret.
type PublicLink struct {
	ID        string  `json:"id"`
	ProjectID string  `json:"projectId"`
	Rights    string  `json:"rights"`
	Name      *string `json:"name"`
	CreatedBy string  `json:"createdBy"`
	// CreatedByName is the creator's display name (lists only).
	CreatedByName string `json:"createdByName,omitempty"`
	CreatedAt     int64  `json:"createdAt"`
	ExpiresAt     *int64 `json:"expiresAt"`
	LastUsedAt    *int64 `json:"lastUsedAt"`
}

// ResolvedPublicLink is an active link found by its secret, with the creator's
// state for the use-time checks. Never sent to a guest.
type ResolvedPublicLink struct {
	PublicLink
	CreatorDeactivated bool
}

// CreatePublicLink mints a link for projectID (the caller checked that creator
// manages the project). rights is view or tick; name is optional (at most 60
// characters); expiresInDays 1–90, or 0 for no expiry. The secret is
// returned once; the row and its audit event commit together.
func (s *Service) CreatePublicLink(ctx context.Context, creator *User, projectID, rights, name string, expiresInDays int) (*PublicLink, string, error) {
	if rights != "view" && rights != "tick" {
		return nil, "", ErrInvalidPublicLink
	}
	name = strings.TrimSpace(name)
	if utf8.RuneCountInString(name) > 60 || strings.ContainsAny(name, "\r\n") {
		return nil, "", ErrInvalidPublicLink
	}
	if expiresInDays < 0 || expiresInDays > MaxPublicLinkDays {
		return nil, "", ErrInvalidPublicLink
	}
	now := s.clock()
	l := &PublicLink{ID: ids.New(), ProjectID: projectID, Rights: rights, CreatedBy: creator.ID, CreatedAt: now.UnixMilli()}
	if name != "" {
		l.Name = &name
	}
	if expiresInDays > 0 {
		at := now.Add(time.Duration(expiresInDays) * 24 * time.Hour).UnixMilli()
		l.ExpiresAt = &at
	}
	secret := PublicLinkSecretPrefix + ids.Secret(32)
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, "", err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `INSERT INTO public_links(id,token_hash,project_id,created_by,rights,name,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)`,
		l.ID, hashToken(secret), projectID, creator.ID, rights, l.Name, l.CreatedAt, l.ExpiresAt); err != nil {
		return nil, "", err
	}
	if err := s.audit.RecordTx(ctx, tx, audit.PublicLinkCreated(creator.ID, l.ID, projectID, rights)); err != nil {
		return nil, "", err
	}
	if err := tx.Commit(); err != nil {
		return nil, "", err
	}
	return l, secret, nil
}

// ListPublicLinks returns the active links of a project, newest first.
func (s *Service) ListPublicLinks(ctx context.Context, projectID string) ([]PublicLink, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT p.id, p.project_id, p.rights, p.name, p.created_by, u.name, p.created_at, p.expires_at, p.last_used_at
		FROM public_links p JOIN users u ON u.id = p.created_by
		WHERE p.project_id = ? AND p.revoked_at IS NULL AND (p.expires_at IS NULL OR p.expires_at > ?) ORDER BY p.created_at DESC, p.id DESC`, projectID, s.clock().UnixMilli())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PublicLink{}
	for rows.Next() {
		var l PublicLink
		if err := rows.Scan(&l.ID, &l.ProjectID, &l.Rights, &l.Name, &l.CreatedBy, &l.CreatedByName, &l.CreatedAt, &l.ExpiresAt, &l.LastUsedAt); err != nil {
			return nil, err
		}
		l.CreatedByName = displayName(l.CreatedByName)
		out = append(out, l)
	}
	return out, rows.Err()
}

// RevokePublicLink revokes a link of projectID. A link of another project is
// ErrNotFound; revoking twice is a no-op.
func (s *Service) RevokePublicLink(ctx context.Context, actorID, projectID, id string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var revoked sql.NullInt64
	err = tx.QueryRowContext(ctx, "SELECT revoked_at FROM public_links WHERE id = ? AND project_id = ?", id, projectID).Scan(&revoked)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if revoked.Valid {
		return nil
	}
	if _, err := tx.ExecContext(ctx, "UPDATE public_links SET revoked_at = ? WHERE id = ?", s.clock().UnixMilli(), id); err != nil {
		return err
	}
	if err := s.audit.RecordTx(ctx, tx, audit.PublicLinkRevoked(actorID, id, projectID)); err != nil {
		return err
	}
	return tx.Commit()
}

// LookupPublicLink resolves a secret to its active link; every failure is
// ErrPublicLinkInvalid.
func (s *Service) LookupPublicLink(ctx context.Context, secret string) (*ResolvedPublicLink, error) {
	secret = strings.TrimSpace(secret)
	if !strings.HasPrefix(secret, PublicLinkSecretPrefix) || len(secret) > 128 {
		return nil, ErrPublicLinkInvalid
	}
	want := hashToken(secret)
	var l ResolvedPublicLink
	var stored string
	var deactivated sql.NullInt64
	err := s.db.QueryRowContext(ctx, `SELECT p.id, p.token_hash, p.project_id, p.rights, p.name, p.created_by, p.created_at, p.expires_at, p.last_used_at, st.deactivated_at
		FROM public_links p LEFT JOIN user_status st ON st.user_id = p.created_by
		WHERE p.token_hash = ? AND p.revoked_at IS NULL AND (p.expires_at IS NULL OR p.expires_at > ?)`, want, s.clock().UnixMilli()).
		Scan(&l.ID, &stored, &l.ProjectID, &l.Rights, &l.Name, &l.CreatedBy, &l.CreatedAt, &l.ExpiresAt, &l.LastUsedAt, &deactivated)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrPublicLinkInvalid
	}
	if err != nil {
		return nil, err
	}
	if subtle.ConstantTimeCompare([]byte(stored), []byte(want)) != 1 {
		return nil, ErrPublicLinkInvalid
	}
	l.CreatorDeactivated = deactivated.Valid
	return &l, nil
}

// TouchPublicLink stamps last_used_at, at most once a minute, so polling does
// not write on every request.
func (s *Service) TouchPublicLink(ctx context.Context, id string) error {
	now := s.clock().UnixMilli()
	_, err := s.db.ExecContext(ctx, `UPDATE public_links SET last_used_at = ? WHERE id = ? AND (last_used_at IS NULL OR last_used_at < ?)`, now, id, now-60_000)
	return err
}

// PublicLinkInfo is what labels need of a link.
type PublicLinkInfo struct{ Name, ProjectID string }

// PublicLinkNames maps link ids to their names and projects ("" for unnamed),
// for labels in history and activity. Revoked links keep their names.
func (s *Service) PublicLinkNames(ctx context.Context, ids []string) (map[string]PublicLinkInfo, error) {
	out := map[string]PublicLinkInfo{}
	if len(ids) == 0 {
		return out, nil
	}
	q := "SELECT id, COALESCE(name,''), project_id FROM public_links WHERE id IN (?" + strings.Repeat(",?", len(ids)-1) + ")"
	args := make([]any, len(ids))
	for i, id := range ids {
		args[i] = id
	}
	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id, name, project string
		if err := rows.Scan(&id, &name, &project); err != nil {
			return nil, err
		}
		out[id] = PublicLinkInfo{Name: name, ProjectID: project}
	}
	return out, rows.Err()
}
