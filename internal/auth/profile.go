package auth

import (
	"context"
	"database/sql"
	"errors"
	"net/mail"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/ids"
)

// Profile (OpenSpec change settings-refresh, design D10): every user changes
// their own name, email and picture. Server-side account data like the name set
// at sign-up: never an op, never synced. The picture's bytes live in
// <data>/avatars (internal/httpapi/avatars.go); the account keeps its version.

var (
	ErrInvalidName = errors.New("enter a name of 1 to 80 characters")
	// ErrInvalidLink: an email change link that is unknown, used or expired.
	ErrInvalidLink = errors.New("this link is not valid any more")
	// ErrEmailManaged: the account signs in only through single sign-on, so its
	// email comes from the provider.
	ErrEmailManaged = errors.New("this account's email is managed by its sign-in provider")
	ErrSameEmail    = errors.New("this is already the account's email")
)

// EmailChangeTTL is how long an email change link stays valid.
const EmailChangeTTL = 24 * time.Hour

// MaxNameLength is the longest display name, in characters.
const MaxNameLength = 80

// ProfileInfo is the account data the Profile card shows beyond the User.
type ProfileInfo struct {
	// AvatarVersion is 0 without a picture; it is part of the picture's address.
	AvatarVersion int `json:"avatarVersion"`
	// PendingEmail waits for the link sent to it, when there is one.
	PendingEmail string `json:"pendingEmail,omitempty"`
	// EmailManagedBy names the sign-in provider of an account that signs in only
	// through single sign-on; such an account cannot change its email here.
	EmailManagedBy string `json:"emailManagedBy,omitempty"`
}

// Profile reads the account's profile data; pending changes past their link's
// expiry are not reported.
func (s *Service) Profile(ctx context.Context, u *User) (*ProfileInfo, error) {
	var p ProfileInfo
	var pending sql.NullString
	var sentAt sql.NullInt64
	err := s.db.QueryRowContext(ctx, "SELECT MAX(avatar_version, 0), pending_email, pending_email_sent_at FROM users WHERE id = ?", u.ID).
		Scan(&p.AvatarVersion, &pending, &sentAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if pending.Valid && sentAt.Valid && s.clock().Before(time.UnixMilli(sentAt.Int64).Add(EmailChangeTTL)) {
		p.PendingEmail = pending.String
	}
	if p.EmailManagedBy, err = s.emailManagedBy(ctx, u); err != nil {
		return nil, err
	}
	return &p, nil
}

// emailManagedBy returns the issuer of a linked identity when the account can
// sign in only through single sign-on: it has no password, or SSO-only mode
// keeps it from signing in locally.
func (s *Service) emailManagedBy(ctx context.Context, u *User) (string, error) {
	var issuer, hash string
	err := s.db.QueryRowContext(ctx, `SELECT i.issuer, u.password_hash FROM identities i JOIN users u ON u.id = i.user_id
		WHERE i.user_id = ? ORDER BY i.created_at LIMIT 1`, u.ID).Scan(&issuer, &hash)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	if hash == "" || !s.LocalLoginAllowed(ctx, u) {
		return issuer, nil
	}
	return "", nil
}

// CleanName trims a display name and checks it: 1 to 80 characters, no control
// characters.
func CleanName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" || utf8.RuneCountInString(name) > MaxNameLength || strings.IndexFunc(name, unicode.IsControl) >= 0 {
		return "", ErrInvalidName
	}
	return name, nil
}

// SetName changes the account's display name and records account.name_changed.
func (s *Service) SetName(ctx context.Context, userID, name string) (*User, error) {
	name, err := CleanName(name)
	if err != nil {
		return nil, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	res, err := tx.ExecContext(ctx, "UPDATE users SET name = ? WHERE id = ?", name, userID)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, ErrNotFound
	}
	if err := s.audit.RecordTx(ctx, tx, audit.NameChanged(userID)); err != nil {
		return nil, err
	}
	u, err := userByID(ctx, tx, userID)
	if err != nil {
		return nil, err
	}
	return u, tx.Commit()
}

// checkNewEmail normalizes and validates a new address for u and checks that no
// other account uses it.
func (s *Service) checkNewEmail(ctx context.Context, q rowQuerier, u *User, email string) (string, error) {
	email = normalizeEmail(email)
	if addr, err := mail.ParseAddress(email); err != nil || addr.Name != "" || addr.Address != email || len(email) > 320 {
		return "", ErrInvalidEmail
	}
	if email == normalizeEmail(u.Email) {
		return "", ErrSameEmail
	}
	var n int
	if err := q.QueryRowContext(ctx, "SELECT COUNT(*) FROM users WHERE email = ? AND id <> ?", email, u.ID).Scan(&n); err != nil {
		return "", err
	}
	if n > 0 {
		return "", ErrEmailTaken
	}
	return email, nil
}

// RequestEmailChange stores email as the account's pending address and returns
// the secret of a 24-hour confirmation link; a newer request replaces earlier
// ones. Records account.email_change_requested. CancelEmailChange drops the
// request again when the link could not be sent.
func (s *Service) RequestEmailChange(ctx context.Context, u *User, email string) (secret, normalized string, err error) {
	if by, err := s.emailManagedBy(ctx, u); err != nil {
		return "", "", err
	} else if by != "" {
		return "", "", ErrEmailManaged
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", "", err
	}
	defer tx.Rollback()
	if normalized, err = s.checkNewEmail(ctx, tx, u, email); err != nil {
		return "", "", err
	}
	now := s.clock()
	if _, err := tx.ExecContext(ctx, "DELETE FROM email_changes WHERE user_id = ?", u.ID); err != nil {
		return "", "", err
	}
	secret = "ote_" + ids.Secret(32)
	if _, err := tx.ExecContext(ctx, "INSERT INTO email_changes(token_hash,user_id,email,created_at,expires_at) VALUES(?,?,?,?,?)",
		hashToken(secret), u.ID, normalized, now.UnixMilli(), now.Add(EmailChangeTTL).UnixMilli()); err != nil {
		return "", "", err
	}
	if _, err := tx.ExecContext(ctx, "UPDATE users SET pending_email = ?, pending_email_sent_at = ? WHERE id = ?", normalized, now.UnixMilli(), u.ID); err != nil {
		return "", "", err
	}
	if err := s.audit.RecordTx(ctx, tx, audit.EmailChangeRequested(u.ID)); err != nil {
		return "", "", err
	}
	return secret, normalized, tx.Commit()
}

// CancelEmailChange forgets the account's pending address and its links.
func (s *Service) CancelEmailChange(ctx context.Context, userID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, "DELETE FROM email_changes WHERE user_id = ?", userID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "UPDATE users SET pending_email = NULL, pending_email_sent_at = NULL WHERE id = ?", userID); err != nil {
		return err
	}
	return tx.Commit()
}

// ConfirmEmailChange applies the change a link names, for the account it was
// sent for: ErrInvalidLink when the link is unknown, used or expired, and
// ErrForbidden when another account opens it. Sessions stay signed in.
func (s *Service) ConfirmEmailChange(ctx context.Context, u *User, secret string) (*User, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var owner, email string
	var expires int64
	err = tx.QueryRowContext(ctx, "SELECT user_id, email, expires_at FROM email_changes WHERE token_hash = ?", hashToken(secret)).Scan(&owner, &email, &expires)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && s.clock().UnixMilli() >= expires) {
		return nil, ErrInvalidLink
	}
	if err != nil {
		return nil, err
	}
	if owner != u.ID {
		return nil, ErrForbidden
	}
	if _, err := s.checkNewEmail(ctx, tx, u, email); err != nil {
		return nil, err
	}
	out, err := s.applyEmailTx(ctx, tx, u.ID, email)
	if err != nil {
		return nil, err
	}
	return out, tx.Commit()
}

// ChangeEmailNow changes the account's email at once, for a server without
// outgoing email: the recent confirmation the route requires is the guard.
func (s *Service) ChangeEmailNow(ctx context.Context, u *User, email string) (*User, error) {
	if by, err := s.emailManagedBy(ctx, u); err != nil {
		return nil, err
	} else if by != "" {
		return nil, ErrEmailManaged
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	email, err = s.checkNewEmail(ctx, tx, u, email)
	if err != nil {
		return nil, err
	}
	out, err := s.applyEmailTx(ctx, tx, u.ID, email)
	if err != nil {
		return nil, err
	}
	return out, tx.Commit()
}

func (s *Service) applyEmailTx(ctx context.Context, tx *sql.Tx, userID, email string) (*User, error) {
	if _, err := tx.ExecContext(ctx, "UPDATE users SET email = ?, pending_email = NULL, pending_email_sent_at = NULL WHERE id = ?", email, userID); err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			return nil, ErrEmailTaken
		}
		return nil, err
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM email_changes WHERE user_id = ?", userID); err != nil {
		return nil, err
	}
	if err := s.audit.RecordTx(ctx, tx, audit.EmailChanged(userID)); err != nil {
		return nil, err
	}
	return userByID(ctx, tx, userID)
}

// BumpAvatar records that the account's picture was set or removed: set says
// which, and the new version is returned (0 when removed). Records
// account.avatar_changed. The caller writes or deletes the file first.
func (s *Service) BumpAvatar(ctx context.Context, userID string, set bool) (int, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	var version int
	if err := tx.QueryRowContext(ctx, "SELECT avatar_version FROM users WHERE id = ?", userID).Scan(&version); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0, ErrNotFound
		}
		return 0, err
	}
	if version < 0 {
		version = -version
	}
	// A removed picture keeps its last version negated, so the next one gets a
	// new address even after a remove.
	next := version + 1
	stored := next
	if !set {
		stored, next = -version, 0
	}
	if _, err := tx.ExecContext(ctx, "UPDATE users SET avatar_version = ? WHERE id = ?", stored, userID); err != nil {
		return 0, err
	}
	if err := s.audit.RecordTx(ctx, tx, audit.AvatarChanged(userID)); err != nil {
		return 0, err
	}
	return next, tx.Commit()
}

// AvatarVersion is the account's picture version, 0 without a picture.
func (s *Service) AvatarVersion(ctx context.Context, userID string) (int, error) {
	var v int
	err := s.db.QueryRowContext(ctx, "SELECT MAX(avatar_version, 0) FROM users WHERE id = ?", userID).Scan(&v)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, ErrNotFound
	}
	return v, err
}

func userByID(ctx context.Context, q rowQuerier, id string) (*User, error) {
	var u User
	err := q.QueryRowContext(ctx, "SELECT id,email,name,role,created_at FROM users WHERE id = ?", id).
		Scan(&u.ID, &u.Email, &u.Name, &u.Role, &u.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &u, err
}
