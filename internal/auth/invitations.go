package auth

import (
	"context"
	"database/sql"
	"errors"
	"net/mail"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/ids"
)

// Invitation expiry bounds (OpenSpec `invitations`): one hour to 30 days, default seven days.
const (
	MinInvitationTTL     = time.Hour
	MaxInvitationTTL     = 30 * 24 * time.Hour
	DefaultInvitationTTL = 7 * 24 * time.Hour
)

// Invitation status values, derived from timestamps (see invitationStatus).
const (
	InvitationPending  = "pending"
	InvitationAccepted = "accepted"
	InvitationExpired  = "expired"
	InvitationRevoked  = "revoked"
)

var (
	ErrInvitationInvalid       = errors.New("this invitation link is not valid")
	ErrInvitationEmailMismatch = errors.New("this invitation was issued for a different email address")
	ErrInvitationSpent         = errors.New("this invitation has already been accepted")
	ErrInvalidExpiry           = errors.New("expiresInHours must be between 1 and 720")
)

// Invitation is the owner's view of an invitation. It never carries the secret.
type Invitation struct {
	ID            string      `json:"id"`
	Status        string      `json:"status"`
	Email         *string     `json:"email"`
	Role          string      `json:"role"`
	CreatedBy     string      `json:"createdBy"`
	CreatedByName string      `json:"createdByName"`
	CreatedAt     int64       `json:"createdAt"`
	ExpiresAt     int64       `json:"expiresAt"`
	AcceptedAt    *int64      `json:"acceptedAt"`
	AcceptedBy    *AccountRef `json:"acceptedBy"`
	RevokedAt     *int64      `json:"revokedAt"`
}

// AccountRef identifies the account that accepted an invitation.
type AccountRef struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
}

// InvitationPreview is what an anonymous invitee may learn about an invitation.
type InvitationPreview struct {
	InviterName string  `json:"inviterName"`
	Email       *string `json:"email"`
	ExpiresAt   int64   `json:"expiresAt"`
}

// CanInvite is the single place that decides who may create, list and revoke
// invitations. A future admin role extends this function only.
func (s *Service) CanInvite(u *User) bool {
	return u != nil && u.Role == "owner"
}

// CreateInvitation mints a single-use invitation. email may be empty (open
// invitation). The plaintext secret is returned exactly once; only its hash is
// stored. The invitation and its invitation.created audit event commit together.
func (s *Service) CreateInvitation(ctx context.Context, creator *User, email string, ttl time.Duration) (*Invitation, string, error) {
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
	secret := "oti_" + ids.Secret(32)
	now := time.Now()
	inv := &Invitation{
		ID: ids.New(), Status: InvitationPending, Email: bound, Role: "member",
		CreatedBy: creator.ID, CreatedByName: creator.Name,
		CreatedAt: now.UnixMilli(), ExpiresAt: now.Add(ttl).UnixMilli(),
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, "", err
	}
	defer tx.Rollback()
	_, err = tx.ExecContext(ctx, `INSERT INTO invitations(id,token_hash,created_by,email,role,created_at,expires_at)
		VALUES(?,?,?,?,?,?,?)`, inv.ID, hashToken(secret), inv.CreatedBy, inv.Email, inv.Role, inv.CreatedAt, inv.ExpiresAt)
	if err != nil {
		return nil, "", err
	}
	boundEmail := ""
	if bound != nil {
		boundEmail = *bound
	}
	if err := s.audit.RecordTx(ctx, tx, audit.InvitationCreated(creator.ID, inv.ID, boundEmail)); err != nil {
		return nil, "", err
	}
	if err := tx.Commit(); err != nil {
		return nil, "", err
	}
	return inv, secret, nil
}

// ListInvitations returns every invitation, newest first, with derived status.
func (s *Service) ListInvitations(ctx context.Context) ([]Invitation, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT i.id, i.email, i.role, i.created_by, c.name, i.created_at, i.expires_at,
			i.accepted_at, i.revoked_at, a.id, a.email, a.name
		FROM invitations i
		JOIN users c ON c.id = i.created_by
		LEFT JOIN users a ON a.id = i.accepted_by
		ORDER BY i.created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	now := time.Now().UnixMilli()
	out := []Invitation{}
	for rows.Next() {
		var inv Invitation
		var acceptedID, acceptedEmail, acceptedName sql.NullString
		if err := rows.Scan(&inv.ID, &inv.Email, &inv.Role, &inv.CreatedBy, &inv.CreatedByName, &inv.CreatedAt, &inv.ExpiresAt,
			&inv.AcceptedAt, &inv.RevokedAt, &acceptedID, &acceptedEmail, &acceptedName); err != nil {
			return nil, err
		}
		if acceptedID.Valid {
			inv.AcceptedBy = &AccountRef{ID: acceptedID.String, Email: acceptedEmail.String, Name: acceptedName.String}
		}
		inv.Status = invitationStatus(inv.RevokedAt, inv.AcceptedAt, inv.ExpiresAt, now)
		out = append(out, inv)
	}
	return out, rows.Err()
}

// RevokeInvitation marks an invitation revoked on behalf of actorID. Accepted
// invitations cannot be revoked (ErrInvitationSpent); unknown ids return
// ErrNotFound. Revoking an already revoked invitation is a no-op and records
// nothing; otherwise invitation.revoked is recorded in the same transaction.
func (s *Service) RevokeInvitation(ctx context.Context, actorID, id string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var acceptedAt, revokedAt *int64
	err = tx.QueryRowContext(ctx, "SELECT accepted_at, revoked_at FROM invitations WHERE id = ?", id).Scan(&acceptedAt, &revokedAt)
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
	if _, err := tx.ExecContext(ctx, "UPDATE invitations SET revoked_at = ? WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL",
		time.Now().UnixMilli(), id); err != nil {
		return err
	}
	if err := s.audit.RecordTx(ctx, tx, audit.InvitationRevoked(actorID, id)); err != nil {
		return err
	}
	return tx.Commit()
}

// PreviewInvitation resolves a secret to the information an invitee may see.
// Every failure mode (unknown, expired, revoked, accepted) is ErrInvitationInvalid.
func (s *Service) PreviewInvitation(ctx context.Context, secret string) (*InvitationPreview, error) {
	var p InvitationPreview
	var inviterName string
	err := s.db.QueryRowContext(ctx, `SELECT c.name, i.email, i.expires_at FROM invitations i
		JOIN users c ON c.id = i.created_by
		WHERE i.token_hash = ? AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > ?`,
		hashToken(secret), time.Now().UnixMilli()).Scan(&inviterName, &p.Email, &p.ExpiresAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrInvitationInvalid
	}
	if err != nil {
		return nil, err
	}
	p.InviterName = displayName(inviterName)
	return &p, nil
}

// checkInvitation validates a secret inside the registration transaction and
// returns the role it grants and the invitation id. It runs before the account row is inserted so that
// a bad link or an email mismatch never creates an account.
func (s *Service) checkInvitation(ctx context.Context, tx *sql.Tx, secret, email string, now int64) (string, string, error) {
	var bound *string
	var role, id string
	err := tx.QueryRowContext(ctx, `SELECT id, email, role FROM invitations
		WHERE token_hash = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?`,
		hashToken(secret), now).Scan(&id, &bound, &role)
	if errors.Is(err, sql.ErrNoRows) {
		return "", "", ErrInvitationInvalid
	}
	if err != nil {
		return "", "", err
	}
	if bound != nil && !strings.EqualFold(*bound, email) {
		return "", "", ErrInvitationEmailMismatch
	}
	if role == "" {
		role = "member"
	}
	return role, id, nil
}

// markInvitationAccepted spends the invitation in the same transaction that
// created the account. Zero rows affected means another registration won the
// race (or the state changed), and the caller rolls back.
func (s *Service) markInvitationAccepted(ctx context.Context, tx *sql.Tx, secret, userID string, now int64) error {
	res, err := tx.ExecContext(ctx, `UPDATE invitations SET accepted_at = ?, accepted_by = ?
		WHERE token_hash = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?`,
		now, userID, hashToken(secret), now)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n != 1 {
		return ErrInvitationInvalid
	}
	return nil
}

func invitationStatus(revokedAt, acceptedAt *int64, expiresAt, now int64) string {
	switch {
	case revokedAt != nil:
		return InvitationRevoked
	case acceptedAt != nil:
		return InvitationAccepted
	case expiresAt <= now:
		return InvitationExpired
	default:
		return InvitationPending
	}
}

// displayName keeps the preview free of account data beyond a name: when the
// inviter has not set one, a neutral label is shown instead of their email.
func displayName(name string) string {
	if strings.TrimSpace(name) == "" {
		return "The owner of this server"
	}
	return name
}
