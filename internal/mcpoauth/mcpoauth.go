// Package mcpoauth is the storage and the cryptography of the OAuth 2.1
// authorization server in front of the MCP endpoint (OpenSpec change
// `mcp-oauth`): registered clients, single-use authorization codes, grants with
// a refresh token that never rotates, and the PKCE check.
//
// It holds no HTTP and no policy: internal/httpapi owns the endpoints and mints
// the access tokens through internal/auth, so an OAuth access token is an
// ordinary API token (design D2).
package mcpoauth

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/ids"
	"github.com/OpenTodoApp/opentodo/internal/textutil"
)

// Scopes a client may hold (design D7). They are the API token scopes the MCP
// endpoint already understands: `read` reaches the read tools, `agent` reaches
// the write tools behind the owner's and the person's switches.
const (
	ScopeRead  = "read"
	ScopeAgent = "agent"
)

// CodeTTL is how long a pending authorization may be exchanged (design D4).
const CodeTTL = 60 * time.Second

// AccessTTL is the lifetime of an access token minted by an exchange
// (design D6).
const AccessTTL = time.Hour

// RefreshTTL is the lifetime of a grant's refresh token. It is extended on
// every refresh, and the token itself never changes (design D6).
const RefreshTTL = 180 * 24 * time.Hour

var (
	// ErrNotFound is an unknown client, code or grant.
	ErrNotFound = errors.New("not found")
	// ErrBadSecret is a client id whose secret does not match.
	ErrBadSecret = errors.New("the client secret is wrong")
	// ErrExpired is a code or grant past its expiry.
	ErrExpired = errors.New("expired")
	// ErrRevoked is a grant that was revoked.
	ErrRevoked = errors.New("revoked")
	// ErrInvalidScope is a scope other than read or agent.
	ErrInvalidScope = errors.New("scope must be read or agent")
	// ErrInvalidRedirect is a redirect address this client may not use.
	ErrInvalidRedirect = errors.New("the redirect address is not registered for this client")
)

// ValidScope reports whether scope may be given to a client.
func ValidScope(scope string) bool { return scope == ScopeRead || scope == ScopeAgent }

// Client is one registered OAuth client. The secret is never carried here.
type Client struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	RedirectURIs []string `json:"redirect_uris"`
	Scope        string   `json:"scope"`
	Dynamic      bool     `json:"dynamic"`
	CreatedBy    string   `json:"created_by"`
	CreatedAt    int64    `json:"created_at"`
	LastUsedAt   *int64   `json:"last_used_at"`
	// SecretSet reports a stored secret without revealing it.
	SecretSet bool `json:"secret_set"`

	secretHash string
}

// Code is one pending authorization (design D4).
type Code struct {
	ClientID    string
	UserID      string
	RedirectURI string
	Scope       string
	Challenge   string
	ExpiresAt   int64
}

// Grant is one person's authorization of one client (design D6).
type Grant struct {
	ID               string
	ClientID         string
	UserID           string
	Scope            string
	TokenID          string
	AccessExpiresAt  int64
	RefreshExpiresAt int64
	RevokedAt        int64
	CreatedAt        int64
}

// Revoked reports whether the grant was revoked.
func (g Grant) Revoked() bool { return g.RevokedAt > 0 }

// Store is the OAuth state in the database.
type Store struct {
	db  *sql.DB
	now func() time.Time
}

// New returns a store over db. The clock is the server's time source; tests
// replace it through SetClock.
func New(db *sql.DB) *Store {
	return &Store{db: db, now: time.Now}
}

// SetClock replaces the time source (tests).
func (s *Store) SetClock(now func() time.Time) {
	if now != nil {
		s.now = now
	}
}

// HashSecret is how client secrets, codes and refresh tokens are stored:
// SHA-256 hex, so a database dump carries nothing replayable (design D9).
func HashSecret(plain string) string {
	sum := sha256.Sum256([]byte(plain))
	return hex.EncodeToString(sum[:])
}

// CreateClient registers a confidential client. Its secret is returned exactly
// once and only its hash is stored.
func (s *Store) CreateClient(ctx context.Context, name string, redirects []string, scope string, dynamic bool, createdBy string) (Client, string, error) {
	if !ValidScope(scope) {
		return Client{}, "", ErrInvalidScope
	}
	name = textutil.Truncate(strings.TrimSpace(name), 100)
	if name == "" {
		name = "MCP client"
	}
	redirects = cleanRedirects(redirects)
	if len(redirects) == 0 {
		return Client{}, "", ErrInvalidRedirect
	}
	encoded, err := json.Marshal(redirects)
	if err != nil {
		return Client{}, "", err
	}
	c := Client{
		ID:           ids.New(),
		Name:         name,
		RedirectURIs: redirects,
		Scope:        scope,
		Dynamic:      dynamic,
		CreatedBy:    createdBy,
		CreatedAt:    s.now().UnixMilli(),
	}
	plain := ids.Secret(32)
	c.secretHash = HashSecret(plain)
	c.SecretSet = true
	_, err = s.db.ExecContext(ctx, `INSERT INTO mcp_oauth_client(id,name,secret_hash,redirect_uris,scope,dynamic,created_by,created_at)
		VALUES(?,?,?,?,?,?,?,?)`,
		c.ID, c.Name, c.secretHash, string(encoded), c.Scope, boolInt(c.Dynamic), c.CreatedBy, c.CreatedAt)
	if err != nil {
		return Client{}, "", err
	}
	return c, plain, nil
}

// Client reads one client by id.
func (s *Store) Client(ctx context.Context, id string) (Client, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id,name,secret_hash,redirect_uris,scope,dynamic,created_by,created_at,last_used_at
		FROM mcp_oauth_client WHERE id = ?`, id)
	return scanClient(row)
}

// Authenticate checks a client's secret in constant time. Every client holds a
// secret; a row without one, or an empty secret, never authenticates.
func (s *Store) Authenticate(ctx context.Context, id, secret string) (Client, error) {
	c, err := s.Client(ctx, id)
	if err != nil {
		return Client{}, err
	}
	if c.secretHash == "" || secret == "" {
		return Client{}, ErrBadSecret
	}
	if subtle.ConstantTimeCompare([]byte(HashSecret(secret)), []byte(c.secretHash)) != 1 {
		return Client{}, ErrBadSecret
	}
	return c, nil
}

// ListClients returns every client, newest first.
func (s *Store) ListClients(ctx context.Context) ([]Client, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,name,secret_hash,redirect_uris,scope,dynamic,created_by,created_at,last_used_at
		FROM mcp_oauth_client ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Client{}
	for rows.Next() {
		c, err := scanClient(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// IssuedToken names an access token a grant was minted for and the person it
// belongs to, which is what revoking it needs.
type IssuedToken struct {
	TokenID string
	UserID  string
}

// DeleteClient removes a client and every grant and code issued for it in one
// transaction, returning the access tokens the caller has to revoke (design
// D8). A refresh that races it cannot attach a new token to a grant that is
// gone: SwapGrantToken finds no row and the caller drops what it minted.
func (s *Store) DeleteClient(ctx context.Context, id string) ([]IssuedToken, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	rows, err := tx.QueryContext(ctx, `SELECT token_id,user_id FROM mcp_oauth_grant WHERE client_id = ? AND token_id <> ''`, id)
	if err != nil {
		return nil, err
	}
	var tokens []IssuedToken
	for rows.Next() {
		var t IssuedToken
		if err := rows.Scan(&t.TokenID, &t.UserID); err != nil {
			rows.Close()
			return nil, err
		}
		tokens = append(tokens, t)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for _, q := range []string{`DELETE FROM mcp_oauth_grant WHERE client_id = ?`, `DELETE FROM mcp_oauth_code WHERE client_id = ?`} {
		if _, err := tx.ExecContext(ctx, q, id); err != nil {
			return nil, err
		}
	}
	res, err := tx.ExecContext(ctx, `DELETE FROM mcp_oauth_client WHERE id = ?`, id)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, ErrNotFound
	}
	return tokens, tx.Commit()
}

// MaxDynamicClients caps the clients dynamic registration may hold at once
// (design D3): registration is anonymous, so the cap is what keeps a script
// from growing the table and the owner's client list without bound.
const MaxDynamicClients = 200

// StaleDynamicClient is how long a dynamically registered client may sit with
// no grant before registration removes it.
const StaleDynamicClient = 24 * time.Hour

// PruneDynamicClients removes dynamically registered clients that nobody has
// authorized within StaleDynamicClient, and reports how many dynamic clients
// remain.
func (s *Store) PruneDynamicClients(ctx context.Context) (int, error) {
	cutoff := s.now().Add(-StaleDynamicClient).UnixMilli()
	if _, err := s.db.ExecContext(ctx, `DELETE FROM mcp_oauth_client WHERE dynamic = 1 AND created_at < ?
		AND id NOT IN (SELECT client_id FROM mcp_oauth_grant)`, cutoff); err != nil {
		return 0, err
	}
	var n int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM mcp_oauth_client WHERE dynamic = 1`).Scan(&n)
	return n, err
}

// TouchClient records that a client authenticated, at most once a minute, so
// the settings list can show it was in use.
func (s *Store) TouchClient(ctx context.Context, id string) {
	now := s.now().UnixMilli()
	_, _ = s.db.ExecContext(ctx, `UPDATE mcp_oauth_client SET last_used_at = ?
		WHERE id = ? AND (last_used_at IS NULL OR last_used_at < ?)`, now, id, now-int64(time.Minute/time.Millisecond))
}

// CreateCode stores a pending authorization and returns the plain code, which
// is never stored (design D4).
func (s *Store) CreateCode(ctx context.Context, c Code) (string, error) {
	if !ValidScope(c.Scope) {
		return "", ErrInvalidScope
	}
	plain := ids.Secret(32)
	c.ExpiresAt = s.now().Add(CodeTTL).UnixMilli()
	_, err := s.db.ExecContext(ctx, `INSERT INTO mcp_oauth_code(code_hash,client_id,user_id,redirect_uri,scope,challenge,expires_at)
		VALUES(?,?,?,?,?,?,?)`,
		HashSecret(plain), c.ClientID, c.UserID, c.RedirectURI, c.Scope, c.Challenge, c.ExpiresAt)
	if err != nil {
		return "", err
	}
	_, _ = s.db.ExecContext(ctx, `DELETE FROM mcp_oauth_code WHERE expires_at < ?`, s.now().Add(-time.Hour).UnixMilli())
	return plain, nil
}

// ConsumeCode takes a pending authorization and deletes it in the same
// statement, so a code cannot be replayed by a racing request.
func (s *Store) ConsumeCode(ctx context.Context, plain string) (Code, error) {
	var c Code
	row := s.db.QueryRowContext(ctx, `DELETE FROM mcp_oauth_code WHERE code_hash = ?
		RETURNING client_id,user_id,redirect_uri,scope,challenge,expires_at`, HashSecret(plain))
	if err := row.Scan(&c.ClientID, &c.UserID, &c.RedirectURI, &c.Scope, &c.Challenge, &c.ExpiresAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Code{}, ErrNotFound
		}
		return Code{}, err
	}
	if c.ExpiresAt < s.now().UnixMilli() {
		return Code{}, ErrExpired
	}
	return c, nil
}

// UpsertGrant authorizes a client for a person and returns a fresh refresh
// token. A second authorization of the same client by the same person reuses
// the grant row and replaces its refresh token, so the client always leaves the
// exchange with a usable one; unlike a refresh, a re-authorization is a
// deliberate act and may rotate (design D6). One statement, so two exchanges
// racing for the same person and client cannot both insert.
func (s *Store) UpsertGrant(ctx context.Context, clientID, userID, scope string) (Grant, string, error) {
	if !ValidScope(scope) {
		return Grant{}, "", ErrInvalidScope
	}
	now := s.now()
	plain := ids.Secret(32)
	refreshAt := now.Add(RefreshTTL).UnixMilli()
	if _, err := s.db.ExecContext(ctx, `INSERT INTO mcp_oauth_grant(id,client_id,user_id,scope,refresh_hash,access_expires_at,refresh_expires_at,created_at)
		VALUES(?,?,?,?,?,0,?,?)
		ON CONFLICT(client_id,user_id) DO UPDATE SET scope = excluded.scope, revoked_at = 0,
			refresh_hash = excluded.refresh_hash, refresh_expires_at = excluded.refresh_expires_at`,
		ids.New(), clientID, userID, scope, HashSecret(plain), refreshAt, now.UnixMilli()); err != nil {
		return Grant{}, "", err
	}
	g, err := s.grantFor(ctx, clientID, userID)
	if err != nil {
		return Grant{}, "", err
	}
	return g, plain, nil
}

// grantFor reads the grant of a client and person.
func (s *Store) grantFor(ctx context.Context, clientID, userID string) (Grant, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id,client_id,user_id,scope,token_id,access_expires_at,refresh_expires_at,COALESCE(revoked_at,0),created_at
		FROM mcp_oauth_grant WHERE client_id = ? AND user_id = ?`, clientID, userID)
	return scanGrant(row)
}

// GrantByRefresh resolves a plain refresh token.
func (s *Store) GrantByRefresh(ctx context.Context, plain string) (Grant, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id,client_id,user_id,scope,token_id,access_expires_at,refresh_expires_at,COALESCE(revoked_at,0),created_at
		FROM mcp_oauth_grant WHERE refresh_hash = ?`, HashSecret(plain))
	return scanGrant(row)
}

// GrantByToken resolves the grant an access token was minted for, if any.
func (s *Store) GrantByToken(ctx context.Context, tokenID string) (Grant, error) {
	if tokenID == "" {
		return Grant{}, ErrNotFound
	}
	row := s.db.QueryRowContext(ctx, `SELECT id,client_id,user_id,scope,token_id,access_expires_at,refresh_expires_at,COALESCE(revoked_at,0),created_at
		FROM mcp_oauth_grant WHERE token_id = ?`, tokenID)
	return scanGrant(row)
}

// SwapGrantToken records the access token an exchange or a refresh minted,
// replacing previous, and extends the refresh token (design D6: the token
// itself never changes). It only succeeds while the grant is live and still
// holds previous: a request that lost a race with another refresh, a
// revocation or the client's deletion gets false and must drop the token it
// minted, so no access token is ever left without a grant pointing to it.
func (s *Store) SwapGrantToken(ctx context.Context, grantID, previous, tokenID string) (bool, error) {
	now := s.now()
	res, err := s.db.ExecContext(ctx, `UPDATE mcp_oauth_grant SET token_id = ?, access_expires_at = ?, refresh_expires_at = ?
		WHERE id = ? AND token_id = ? AND revoked_at = 0`,
		tokenID, now.Add(AccessTTL).UnixMilli(), now.Add(RefreshTTL).UnixMilli(), grantID, previous)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n == 1, err
}

// RevokeGrant marks a grant revoked and clears its access token in one
// transaction, returning the api_tokens id the caller has to delete.
func (s *Store) RevokeGrant(ctx context.Context, grantID string) (string, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()
	var tokenID string
	err = tx.QueryRowContext(ctx, `SELECT token_id FROM mcp_oauth_grant WHERE id = ?`, grantID).Scan(&tokenID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE mcp_oauth_grant SET revoked_at = ?, token_id = '' WHERE id = ?`,
		s.now().UnixMilli(), grantID); err != nil {
		return "", err
	}
	return tokenID, tx.Commit()
}

// GrantByID reads one grant.
func (s *Store) GrantByID(ctx context.Context, id string) (Grant, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id,client_id,user_id,scope,token_id,access_expires_at,refresh_expires_at,COALESCE(revoked_at,0),created_at
		FROM mcp_oauth_grant WHERE id = ?`, id)
	return scanGrant(row)
}

// Live reports whether a grant may still be used, and why not when it may not.
func (s *Store) Live(g Grant) error {
	switch {
	case g.Revoked():
		return ErrRevoked
	case g.RefreshExpiresAt < s.now().UnixMilli():
		return ErrExpired
	}
	return nil
}

func scanClient(row interface{ Scan(...any) error }) (Client, error) {
	var c Client
	var redirects string
	var dynamic int
	var lastUsed sql.NullInt64
	if err := row.Scan(&c.ID, &c.Name, &c.secretHash, &redirects, &c.Scope, &dynamic, &c.CreatedBy, &c.CreatedAt, &lastUsed); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Client{}, ErrNotFound
		}
		return Client{}, err
	}
	c.Dynamic = dynamic != 0
	c.SecretSet = c.secretHash != ""
	if lastUsed.Valid {
		v := lastUsed.Int64
		c.LastUsedAt = &v
	}
	if err := json.Unmarshal([]byte(redirects), &c.RedirectURIs); err != nil {
		return Client{}, err
	}
	return c, nil
}

func scanGrant(row interface{ Scan(...any) error }) (Grant, error) {
	var g Grant
	if err := row.Scan(&g.ID, &g.ClientID, &g.UserID, &g.Scope, &g.TokenID, &g.AccessExpiresAt, &g.RefreshExpiresAt, &g.RevokedAt, &g.CreatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Grant{}, ErrNotFound
		}
		return Grant{}, err
	}
	return g, nil
}

// AllowsRedirect reports whether uri is one of the client's registered
// addresses. Dynamic clients registered with Google's prefix form hold that
// prefix as their entry, so a per-connector suffix matches (design D3).
func (c Client) AllowsRedirect(uri string) bool {
	uri = strings.TrimSpace(uri)
	if uri == "" {
		return false
	}
	for _, r := range c.RedirectURIs {
		if r == uri {
			return true
		}
		if strings.HasSuffix(r, "/") && strings.HasPrefix(uri, r) && !strings.Contains(uri[len(r):], "/") {
			return true
		}
	}
	return false
}

// cleanRedirects trims, drops empties and de-duplicates, keeping order.
func cleanRedirects(in []string) []string {
	seen := make(map[string]bool, len(in))
	out := make([]string, 0, len(in))
	for _, r := range in {
		r = strings.TrimSpace(r)
		if r == "" || seen[r] {
			continue
		}
		seen[r] = true
		out = append(out, r)
	}
	return out
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
