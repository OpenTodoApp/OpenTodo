package mcpoauth

import (
	"context"
	"crypto/subtle"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/ids"
	"github.com/OpenTodoApp/opentodo/internal/textutil"
)

// App sign-in (OpenSpec change native-app-foundation, design D5): the OpenTodo
// app signs in through the system browser with an authorization code and PKCE.
// Its codes (app_sign_in_code) belong to the built-in public client
// AppClientID; its grants are one per device in app_sign_in_grant, and their
// refresh tokens always rotate, with reuse detection.

const (
	// AppClientID is the built-in public client of the OpenTodo app: a seeded
	// row with no secret and no redirect address, so the MCP endpoints never
	// accept it, independent of the owner's MCP switch.
	AppClientID = "opentodo-app"
	// ScopeApp is the scope of the app's grants and access tokens.
	ScopeApp = "app"
	// AppRedirect is where the confirmation sends the code: the app's scheme.
	AppRedirect = "opentodo://signed-in"
	// MaxDevice is the longest device name kept, in bytes.
	MaxDevice = 100
	// MaxState is the longest state value accepted, in bytes.
	MaxState = 512
)

// AppGrant is one signed-in app on one device.
type AppGrant struct {
	ID               string
	UserID           string
	Device           string
	TokenID          string
	RefreshExpiresAt int64
	CreatedAt        int64
	LastUsedAt       int64
}

// BuiltIn reports whether the client is the app's built-in one, which no MCP
// endpoint serves.
func (c Client) BuiltIn() bool { return c.ID == AppClientID }

// CleanDevice is the device name as stored: trimmed, without control
// characters, at most MaxDevice bytes.
func CleanDevice(device string) string {
	device = strings.Map(func(r rune) rune {
		if r < 0x20 || r == 0x7f {
			return -1
		}
		return r
	}, device)
	return textutil.Truncate(strings.TrimSpace(device), MaxDevice)
}

// ValidChallenge reports whether challenge has the shape of an S256 challenge:
// 43 characters of base64url without padding (RFC 7636 §4.2).
func ValidChallenge(challenge string) bool {
	if len(challenge) != 43 {
		return false
	}
	for i := 0; i < len(challenge); i++ {
		c := challenge[i]
		switch {
		case c >= 'A' && c <= 'Z', c >= 'a' && c <= 'z', c >= '0' && c <= '9', c == '-', c == '_':
		default:
			return false
		}
	}
	return true
}

// AppCode is a confirmed sign-in taken by its exchange.
type AppCode struct {
	UserID string
	Device string
}

// CreateAppCode stores a confirmed app sign-in for userID and returns the
// plain code: single use, valid for CodeTTL, bound to the challenge and the
// state. Codes expired for an hour are removed on the way.
func (s *Store) CreateAppCode(ctx context.Context, userID, challenge, state, device string) (string, error) {
	plain := ids.Secret(32)
	_, err := s.db.ExecContext(ctx, `INSERT INTO app_sign_in_code(code_hash,user_id,challenge,state_hash,device,expires_at)
		VALUES(?,?,?,?,?,?)`,
		HashSecret(plain), userID, challenge, HashSecret(state), CleanDevice(device), s.now().Add(CodeTTL).UnixMilli())
	if err != nil {
		return "", err
	}
	_, _ = s.db.ExecContext(ctx, `DELETE FROM app_sign_in_code WHERE expires_at < ?`, s.now().Add(-time.Hour).UnixMilli())
	return plain, nil
}

// ConsumeAppCode takes a confirmed app sign-in, deleting it in the same
// statement whatever follows, so a code is tried once and a racing request
// finds nothing, and checks it against the verifier and the state: ErrNotFound
// for an unknown or used code, ErrExpired, or ErrMismatch.
func (s *Store) ConsumeAppCode(ctx context.Context, plain, verifier, state string) (AppCode, error) {
	var c AppCode
	var challenge, stateHash string
	var expires int64
	err := s.db.QueryRowContext(ctx, `DELETE FROM app_sign_in_code WHERE code_hash = ?
		RETURNING user_id,device,challenge,state_hash,expires_at`, HashSecret(plain)).Scan(&c.UserID, &c.Device, &challenge, &stateHash, &expires)
	switch {
	case errors.Is(err, sql.ErrNoRows):
		return AppCode{}, ErrNotFound
	case err != nil:
		return AppCode{}, err
	case expires < s.now().UnixMilli():
		return AppCode{}, ErrExpired
	case !VerifyS256(challenge, verifier) || subtle.ConstantTimeCompare([]byte(HashSecret(state)), []byte(stateHash)) != 1:
		return AppCode{}, ErrMismatch
	}
	return c, nil
}

// ErrMismatch is a code presented with a verifier or a state it is not bound to.
var ErrMismatch = errors.New("the code_verifier or state does not match")

// CreateAppGrant starts a grant for one device and returns its first refresh
// token, or ErrNotFound for a deactivated account. The person's expired app
// grants are removed on the way.
func (s *Store) CreateAppGrant(ctx context.Context, userID, device string) (AppGrant, string, error) {
	now := s.now()
	plain := ids.Secret(32)
	g := AppGrant{
		ID: ids.New(), UserID: userID, Device: CleanDevice(device),
		RefreshExpiresAt: now.Add(RefreshTTL).UnixMilli(), CreatedAt: now.UnixMilli(), LastUsedAt: now.UnixMilli(),
	}
	if _, err := s.db.ExecContext(ctx, `DELETE FROM app_sign_in_grant WHERE user_id = ? AND refresh_expires_at < ?`, userID, g.CreatedAt); err != nil {
		return AppGrant{}, "", err
	}
	// A deactivated account gets no grant: deactivation removed its grants,
	// and one made from a code confirmed just before would outlive it.
	res, err := s.db.ExecContext(ctx, `INSERT INTO app_sign_in_grant(id,user_id,device,refresh_hash,refresh_expires_at,created_at,last_used_at)
		SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM user_status WHERE user_id = ? AND deactivated_at IS NOT NULL)`,
		g.ID, g.UserID, g.Device, HashSecret(plain), g.RefreshExpiresAt, g.CreatedAt, g.LastUsedAt, g.UserID)
	if err != nil {
		return AppGrant{}, "", err
	}
	if n, err := res.RowsAffected(); err != nil {
		return AppGrant{}, "", err
	} else if n == 0 {
		return AppGrant{}, "", ErrNotFound
	}
	return g, plain, nil
}

const appGrantCols = `g.id,g.user_id,g.device,g.token_id,g.refresh_expires_at,g.created_at,g.last_used_at`

// AppGrantByRefresh resolves a plain refresh token that a grant holds now.
func (s *Store) AppGrantByRefresh(ctx context.Context, plain string) (AppGrant, error) {
	return scanAppGrant(s.db.QueryRowContext(ctx, `SELECT `+appGrantCols+` FROM app_sign_in_grant g WHERE g.refresh_hash = ?`, HashSecret(plain)))
}

// AppGrantByUsedRefresh resolves a refresh token a grant already exchanged.
func (s *Store) AppGrantByUsedRefresh(ctx context.Context, plain string) (AppGrant, error) {
	return scanAppGrant(s.db.QueryRowContext(ctx, `SELECT `+appGrantCols+` FROM app_sign_in_refresh_used u
		JOIN app_sign_in_grant g ON g.id = u.grant_id WHERE u.refresh_hash = ?`, HashSecret(plain)))
}

// AppGrantByToken resolves the grant whose current access token is tokenID.
func (s *Store) AppGrantByToken(ctx context.Context, tokenID string) (AppGrant, error) {
	if tokenID == "" {
		return AppGrant{}, ErrNotFound
	}
	return scanAppGrant(s.db.QueryRowContext(ctx, `SELECT `+appGrantCols+` FROM app_sign_in_grant g WHERE g.token_id = ?`, tokenID))
}

// AppGrantByID reads one grant.
func (s *Store) AppGrantByID(ctx context.Context, id string) (AppGrant, error) {
	return scanAppGrant(s.db.QueryRowContext(ctx, `SELECT `+appGrantCols+` FROM app_sign_in_grant g WHERE g.id = ?`, id))
}

// LiveApp reports whether an app grant's refresh token may still be used.
func (s *Store) LiveApp(g AppGrant) error {
	if g.RefreshExpiresAt < s.now().UnixMilli() {
		return ErrExpired
	}
	return nil
}

// RotateAppRefresh replaces the grant's refresh token plain with a new one and
// remembers plain as used, in one transaction. Like RotateRefresh it succeeds
// only while the grant still holds plain: ErrReused when another request
// exchanged it first, ErrNotFound when the grant is gone.
func (s *Store) RotateAppRefresh(ctx context.Context, grantID, plain string) (string, error) {
	return s.rotate(ctx, appTables, grantID, plain)
}

// SwapAppToken records the access token an exchange or a refresh minted,
// replacing previous, and the time of use. False when the grant no longer
// holds previous or is gone: the caller drops the token it minted.
func (s *Store) SwapAppToken(ctx context.Context, grantID, previous, tokenID string) (bool, error) {
	res, err := s.db.ExecContext(ctx, `UPDATE app_sign_in_grant SET token_id = ?, last_used_at = ? WHERE id = ? AND token_id = ?`,
		tokenID, s.now().UnixMilli(), grantID, previous)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n == 1, err
}

// RevokeAppGrant ends one of userID's grants and returns its current access
// token's id, which the caller deletes. ErrNotFound for a grant that is not
// the person's.
func (s *Store) RevokeAppGrant(ctx context.Context, userID, grantID string) (string, error) {
	var tokenID string
	err := s.db.QueryRowContext(ctx, `DELETE FROM app_sign_in_grant WHERE id = ? AND user_id = ? RETURNING token_id`, grantID, userID).Scan(&tokenID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotFound
	}
	return tokenID, err
}

// AppGrants lists a person's signed-in apps, most recently used first. The
// last use is the later of the grant's last exchange and its access token's
// last request.
func (s *Store) AppGrants(ctx context.Context, userID string) ([]AppGrant, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT g.id,g.user_id,g.device,g.token_id,g.refresh_expires_at,g.created_at,
		MAX(g.last_used_at, COALESCE(t.last_used_at, 0)) AS used
		FROM app_sign_in_grant g LEFT JOIN api_tokens t ON t.id = g.token_id
		WHERE g.user_id = ? AND g.refresh_expires_at >= ? ORDER BY used DESC, g.id`, userID, s.now().UnixMilli())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AppGrant{}
	for rows.Next() {
		g, err := scanAppGrant(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

func scanAppGrant(row interface{ Scan(...any) error }) (AppGrant, error) {
	var g AppGrant
	if err := row.Scan(&g.ID, &g.UserID, &g.Device, &g.TokenID, &g.RefreshExpiresAt, &g.CreatedAt, &g.LastUsedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return AppGrant{}, ErrNotFound
		}
		return AppGrant{}, err
	}
	return g, nil
}
