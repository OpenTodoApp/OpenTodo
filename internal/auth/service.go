// Package auth owns users, browser sessions and API tokens.
package auth

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"errors"
	"net/mail"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/ids"
	"github.com/pixari/opentodo/internal/webauthn"
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
	Scope      string `json:"scope"`
	CreatedAt  int64  `json:"createdAt"`
	LastUsedAt *int64 `json:"lastUsedAt"`
}

// Token scopes (OpenSpec changes `mcp-server` D2 and `mcp-write-tools` D2). A
// `read` token is refused on every route that writes; tokens created before
// scopes existed have no scope row and keep full access. An `agent` token is
// refused on every REST write like `read` and is the only scope that may call
// MCP write tools (behind the owner's and the user's switches). It is stored
// as a `read` scope row plus a marker row in api_token_agent, so a binary that
// does not know the marker treats it as read-only (downgrades fail safe).
//
// An `admin` token (OpenSpec change `route-authorization-policy`) can do
// everything a `full` token can and is the only scope accepted on the
// credential and administration routes (second factor, passkeys, tokens, app
// passwords, user administration, single sign-on, encryption key records and
// settings that hold secrets). It is stored like an agent token: a `read` row
// plus a marker row in api_token_admin.
const (
	ScopeFull  = "full"
	ScopeRead  = "read"
	ScopeAgent = "agent"
	ScopeAdmin = "admin"
)

// ValidScope reports whether scope can be given to a new token.
func ValidScope(scope string) bool {
	return scope == ScopeFull || scope == ScopeRead || scope == ScopeAgent || scope == ScopeAdmin
}

// FullAccess reports whether a token scope may use every regular route that
// writes: `full` and `admin`.
func FullAccess(scope string) bool { return scope == ScopeFull || scope == ScopeAdmin }

// ErrInvalidScope is returned by CreateTokenScoped for an unknown scope.
var ErrInvalidScope = errors.New("scope must be full, read, agent or admin")

// TokenInfo identifies the API token a request was authenticated with.
type TokenInfo struct {
	ID    string
	Name  string
	Scope string
}

// scopeExpr reads a token's effective scope from api_tokens t, api_token_scopes
// sc, api_token_agent ag and api_token_admin ad (joined by scopeJoins): a
// missing scope row is full, a read row with the agent marker is agent and one
// with the admin marker is admin.
const scopeExpr = `CASE WHEN ad.token_id IS NOT NULL AND sc.scope = 'read' THEN 'admin' WHEN ag.token_id IS NOT NULL AND sc.scope = 'read' THEN 'agent' ELSE COALESCE(sc.scope,'full') END`

// scopeJoins are the side tables scopeExpr reads.
const scopeJoins = ` LEFT JOIN api_token_scopes sc ON sc.token_id = t.id LEFT JOIN api_token_agent ag ON ag.token_id = t.id LEFT JOIN api_token_admin ad ON ad.token_id = t.id `

var (
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrEmailTaken         = errors.New("an account with this email already exists")
	ErrSignupClosed       = errors.New("sign-up is disabled on this server")
	// ErrSetupTokenInvalid refuses the first registration when a setup token is
	// configured and the request lacks it or carries another (owner-bootstrap).
	ErrSetupTokenInvalid = errors.New("the setup token is missing or wrong")
	ErrInvalidEmail      = errors.New("invalid email address")
	ErrNotFound          = errors.New("not found")
)

// Service implements account operations on top of the database.
type Service struct {
	db          *sql.DB
	sessionTTL  time.Duration
	allowSignup bool
	audit       *audit.Recorder

	// afterTokenInsert, when set by tests, runs inside CreateToken's transaction
	// right after the token row is written; an error aborts the transaction.
	afterTokenInsert func() error

	// rp and challenges are set by ConfigurePasskeys (see passkeys.go); nil
	// means passkeys are unavailable on this server.
	rp         *webauthn.RelyingParty
	challenges *webauthn.Challenges

	// mfaChallenges holds the second sign-in step's challenges (mfa.go); clock
	// is the time source of the second-factor code, replaceable by tests.
	mfaChallenges *loginChallenges
	clock         func() time.Time

	// beforeDelete removes an account's synced data inside DeleteUser's
	// transaction (users.go); nil leaves ops and fields alone.
	beforeDelete AccountDataHook
	// ssoOnly reports SSO-only mode (oidc.go); nil means never.
	ssoOnly func(ctx context.Context) bool
	// setupToken, when non-empty, must accompany the first registration
	// (OPENTODO_SETUP_TOKEN, OpenSpec change owner-bootstrap).
	setupToken string
	// maxMembers caps active accounts on a hosted tenant (limits.go); 0: none.
	maxMembers int
}

// NewService wires a Service. It owns the audit recorder for the same database,
// so every state change it makes is recorded in the same transaction.
func NewService(db *sql.DB, sessionTTL time.Duration, allowSignup bool) *Service {
	return &Service{db: db, sessionTTL: sessionTTL, allowSignup: allowSignup, audit: audit.New(db, nil),
		mfaChallenges: newLoginChallenges(), clock: time.Now}
}

// SetSetupToken configures the token the first registration must carry; empty
// disables the requirement.
func (s *Service) SetSetupToken(token string) { s.setupToken = token }

// SetupTokenRequired reports whether a setup token is configured. It matters only
// while no account exists.
func (s *Service) SetupTokenRequired() bool { return s.setupToken != "" }

// setupTokenMatches compares in constant time; hashing first hides the length.
func (s *Service) setupTokenMatches(given string) bool {
	want := sha256.Sum256([]byte(s.setupToken))
	got := sha256.Sum256([]byte(given))
	return subtle.ConstantTimeCompare(want[:], got[:]) == 1
}

// SetClock replaces the time source of second-factor checks and session
// freshness (tests only).
func (s *Service) SetClock(now func() time.Time) { s.clock = now }

// Audit returns the recorder used by the service, for the HTTP layer's
// observations (sign-in, sign-out, export), the audit routes and the pruner.
func (s *Service) Audit() *audit.Recorder { return s.audit }

// IsOwner reports whether u holds the owner role (audit log access, settings).
func (s *Service) IsOwner(u *User) bool { return u != nil && u.Role == "owner" }

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
	return s.RegisterWithSetupToken(ctx, email, name, password, invitation, "")
}

// RegisterWithSetupToken is Register with the setup token a first registration
// must carry when one is configured. After the first account it is ignored.
func (s *Service) RegisterWithSetupToken(ctx context.Context, email, name, password, invitation, setupToken string) (*User, error) {
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
	var invitationID string
	switch {
	case n == 0:
		if s.setupToken != "" && !s.setupTokenMatches(strings.TrimSpace(setupToken)) {
			return nil, ErrSetupTokenInvalid
		}
		u.Role = "owner"
	case invitation != "":
		// Validate before inserting so a bad link is reported ahead of email_taken,
		// and the invitation stays pending whenever the account is not created.
		role, id, err := s.checkInvitation(ctx, tx, invitation, email, now)
		if err != nil {
			return nil, err
		}
		u.Role, invitationID = role, id
	case !s.allowSignup:
		return nil, ErrSignupClosed
	}
	if n > 0 {
		if err := s.checkMemberLimit(ctx, tx); err != nil {
			return nil, err
		}
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
		if err := s.audit.RecordTx(ctx, tx, audit.InvitationAccepted(u.ID, u.Email, invitationID)); err != nil {
			return nil, err
		}
	}
	return u, tx.Commit()
}

// LoginFailure is the error Authenticate returns for refused credentials. It
// matches ErrInvalidCredentials with errors.Is, so the HTTP response never
// reveals which case applied, while the audit log can record the account and
// reason. The submitted password is never part of it.
type LoginFailure struct {
	UserID string // empty when no account has the email
	Email  string // the account's email; empty when no account has the email
	Reason string // audit.ReasonUnknownAccount or audit.ReasonWrongPassword
}

// DeactivatedLogin is the error Authenticate returns for the correct password
// of a deactivated account. It matches ErrAccountDeactivated with errors.Is and
// carries the account for the audit log.
type DeactivatedLogin struct {
	UserID string
	Email  string
}

func (d *DeactivatedLogin) Error() string        { return ErrAccountDeactivated.Error() }
func (d *DeactivatedLogin) Is(target error) bool { return target == ErrAccountDeactivated }

func (f *LoginFailure) Error() string        { return ErrInvalidCredentials.Error() }
func (f *LoginFailure) Is(target error) bool { return target == ErrInvalidCredentials }

// Authenticate checks credentials and returns the user. Refused credentials
// return a *LoginFailure. Deactivation is checked only after the password
// matched (user-management D3), so it is revealed only to someone who knows the
// password: then the error is a *DeactivatedLogin.
func (s *Service) Authenticate(ctx context.Context, email, password string) (*User, error) {
	email = normalizeEmail(email)
	var u User
	var hash string
	err := s.db.QueryRowContext(ctx, "SELECT id,email,name,role,created_at,password_hash FROM users WHERE email = ?", email).
		Scan(&u.ID, &u.Email, &u.Name, &u.Role, &u.CreatedAt, &hash)
	if errors.Is(err, sql.ErrNoRows) {
		// Burn comparable time so timing does not reveal whether the account exists.
		VerifyPassword("$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", password)
		return nil, &LoginFailure{Reason: audit.ReasonUnknownAccount}
	}
	if err != nil {
		return nil, err
	}
	if !VerifyPassword(hash, password) {
		return nil, &LoginFailure{UserID: u.ID, Email: u.Email, Reason: audit.ReasonWrongPassword}
	}
	if off, err := s.isDeactivated(ctx, s.db, u.ID); err != nil {
		return nil, err
	} else if off {
		return nil, &DeactivatedLogin{UserID: u.ID, Email: u.Email}
	}
	return &u, nil
}

// CreateSession issues a browser session and returns the opaque cookie value.
// The session counts as freshly authenticated; see CreateSessionMFA.
func (s *Service) CreateSession(ctx context.Context, userID, userAgent string) (string, time.Time, error) {
	return s.CreateSessionMFA(ctx, userID, userAgent, false)
}

// UserBySession resolves a cookie value to a user, or ErrNotFound.
func (s *Service) UserBySession(ctx context.Context, secret string) (*User, error) {
	var u User
	err := s.db.QueryRowContext(ctx, `SELECT u.id,u.email,u.name,u.role,u.created_at FROM sessions s
		JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?
		AND u.id NOT IN (SELECT user_id FROM user_status WHERE deactivated_at IS NOT NULL)`,
		hashToken(secret), time.Now().UnixMilli()).Scan(&u.ID, &u.Email, &u.Name, &u.Role, &u.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &u, err
}

// SessionHash returns the stored identifier of the session behind a cookie
// value, so other tables (push subscriptions) can reference the session and be
// removed with it when it is revoked.
func SessionHash(secret string) string { return hashToken(secret) }

// UserByEmail looks an account up by its exact email (case-insensitive), or
// returns ErrNotFound. Used to add project members; there is no listing route.
func (s *Service) UserByEmail(ctx context.Context, email string) (*User, error) {
	var u User
	err := s.db.QueryRowContext(ctx, `SELECT id,email,name,role,created_at FROM users WHERE email = ?`,
		strings.TrimSpace(email)).Scan(&u.ID, &u.Email, &u.Name, &u.Role, &u.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &u, err
}

// CreateAccount creates a local account with the given role ("member" or
// "owner") without consulting the sign-up policy or an invitation. It exists
// for server-side provisioning (OpenSpec change `demo-mode`: the demo accounts
// and the hidden owner) and is never reachable from a route. An "owner" is
// refused when an account already exists, so there is still exactly one owner.
func (s *Service) CreateAccount(ctx context.Context, email, name, password, role string) (*User, error) {
	email = normalizeEmail(email)
	if _, err := mail.ParseAddress(email); err != nil || email == "" {
		return nil, ErrInvalidEmail
	}
	if role != "member" && role != "owner" {
		return nil, errors.New("role must be member or owner")
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
	if role == "owner" {
		var n int
		if err := tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM users").Scan(&n); err != nil {
			return nil, err
		}
		if n > 0 {
			return nil, errors.New("an owner can only be created on an empty server")
		}
	}
	u := &User{ID: ids.New(), Email: email, Name: strings.TrimSpace(name), Role: role, CreatedAt: time.Now().UnixMilli()}
	if _, err := tx.ExecContext(ctx, "INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)",
		u.ID, u.Email, u.Name, hash, u.Role, u.CreatedAt); err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			return nil, ErrEmailTaken
		}
		return nil, err
	}
	return u, tx.Commit()
}

// CreatePasswordlessAccount creates a member account with no password: the
// stored hash is empty, so password sign-in can never succeed (an empty hash
// never verifies, as for accounts provisioned by single sign-on). It exists for
// demo sandboxes (OpenSpec change `demo-sandboxes`, design D1): the visitor's
// account is reachable only through the session issued when it is created, and
// the demo collaborator gets no session at all. Never reachable from a route.
func (s *Service) CreatePasswordlessAccount(ctx context.Context, email, name string) (*User, error) {
	email = normalizeEmail(email)
	if _, err := mail.ParseAddress(email); err != nil || email == "" {
		return nil, ErrInvalidEmail
	}
	u := &User{ID: ids.New(), Email: email, Name: strings.TrimSpace(name), Role: "member", CreatedAt: time.Now().UnixMilli()}
	if _, err := s.db.ExecContext(ctx, "INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)",
		u.ID, u.Email, u.Name, "", u.Role, u.CreatedAt); err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			return nil, ErrEmailTaken
		}
		return nil, err
	}
	return u, nil
}

// DeleteSession revokes a session.
func (s *Service) DeleteSession(ctx context.Context, secret string) error {
	_, err := s.db.ExecContext(ctx, "DELETE FROM sessions WHERE token_hash = ?", hashToken(secret))
	return err
}

// CreateToken issues a full-access API token; see CreateTokenScoped.
func (s *Service) CreateToken(ctx context.Context, userID, name string) (*Token, string, error) {
	return s.CreateTokenScoped(ctx, userID, name, ScopeFull)
}

// CreateTokenScoped issues an API token with the given scope ("" means full).
// The plaintext is returned exactly once. The token row, its scope and its
// token.created audit event are written in one transaction.
func (s *Service) CreateTokenScoped(ctx context.Context, userID, name, scope string) (*Token, string, error) {
	if scope == "" {
		scope = ScopeFull
	}
	if !ValidScope(scope) {
		return nil, "", ErrInvalidScope
	}
	name = strings.TrimSpace(name)
	if name == "" {
		name = "API token"
	}
	plain := "ot_" + ids.Secret(32)
	t := &Token{ID: ids.New(), Name: truncate(name, 100), Scope: scope, CreatedAt: time.Now().UnixMilli()}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, "", err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, "INSERT INTO api_tokens(id,user_id,name,token_hash,created_at) VALUES(?,?,?,?,?)",
		t.ID, userID, t.Name, hashToken(plain), t.CreatedAt); err != nil {
		return nil, "", err
	}
	stored := scope
	if scope == ScopeAgent || scope == ScopeAdmin {
		stored = ScopeRead // plus the marker below: read-only to older binaries
	}
	if _, err := tx.ExecContext(ctx, "INSERT INTO api_token_scopes(token_id,scope) VALUES(?,?)", t.ID, stored); err != nil {
		return nil, "", err
	}
	if scope == ScopeAgent {
		if _, err := tx.ExecContext(ctx, "INSERT INTO api_token_agent(token_id) VALUES(?)", t.ID); err != nil {
			return nil, "", err
		}
	}
	if scope == ScopeAdmin {
		if _, err := tx.ExecContext(ctx, "INSERT INTO api_token_admin(token_id) VALUES(?)", t.ID); err != nil {
			return nil, "", err
		}
	}
	if s.afterTokenInsert != nil {
		if err := s.afterTokenInsert(); err != nil {
			return nil, "", err
		}
	}
	if err := s.audit.RecordTx(ctx, tx, audit.TokenCreatedScoped(userID, t.ID, t.Name, scope)); err != nil {
		return nil, "", err
	}
	if err := tx.Commit(); err != nil {
		return nil, "", err
	}
	return t, plain, nil
}

// UserByToken resolves an API token to its user, or ErrNotFound.
func (s *Service) UserByToken(ctx context.Context, plain string) (*User, error) {
	u, _, err := s.UserByTokenScope(ctx, plain)
	return u, err
}

// UserByTokenScope resolves an API token to its user and scope, or ErrNotFound.
// Tokens of deactivated accounts never resolve.
func (s *Service) UserByTokenScope(ctx context.Context, plain string) (*User, string, error) {
	u, info, err := s.UserByTokenInfo(ctx, plain)
	return u, info.Scope, err
}

// UserByTokenInfo resolves an API token to its user and the token's id, name
// and scope, or ErrNotFound. Tokens of deactivated accounts never resolve.
func (s *Service) UserByTokenInfo(ctx context.Context, plain string) (*User, TokenInfo, error) {
	var u User
	var info TokenInfo
	err := s.db.QueryRowContext(ctx, `SELECT t.id,t.name,`+scopeExpr+`,u.id,u.email,u.name,u.role,u.created_at FROM api_tokens t
		JOIN users u ON u.id = t.user_id`+scopeJoins+`WHERE t.token_hash = ?
		AND u.id NOT IN (SELECT user_id FROM user_status WHERE deactivated_at IS NOT NULL)`, hashToken(plain)).
		Scan(&info.ID, &info.Name, &info.Scope, &u.ID, &u.Email, &u.Name, &u.Role, &u.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, TokenInfo{}, ErrNotFound
	}
	if err != nil {
		return nil, TokenInfo{}, err
	}
	_, _ = s.db.ExecContext(ctx, "UPDATE api_tokens SET last_used_at = ? WHERE id = ?", time.Now().UnixMilli(), info.ID)
	return &u, info, nil
}

// TokenName returns the name of a token owned by userID, or "" when the token
// no longer exists or belongs to someone else (history labels, mcp-write-tools D6).
func (s *Service) TokenName(ctx context.Context, userID, tokenID string) (string, error) {
	var name string
	err := s.db.QueryRowContext(ctx, "SELECT name FROM api_tokens WHERE id = ? AND user_id = ?", tokenID, userID).Scan(&name)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return name, err
}

// ListTokens returns a user's tokens with their scopes.
func (s *Service) ListTokens(ctx context.Context, userID string) ([]Token, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT t.id,t.name,`+scopeExpr+`,t.created_at,t.last_used_at FROM api_tokens t`+scopeJoins+`
		WHERE t.user_id = ? ORDER BY t.created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Token{}
	for rows.Next() {
		var t Token
		if err := rows.Scan(&t.ID, &t.Name, &t.Scope, &t.CreatedAt, &t.LastUsedAt); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// DeleteToken revokes a token owned by the user, recording token.revoked in the
// same transaction.
func (s *Service) DeleteToken(ctx context.Context, userID, tokenID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var name string
	err = tx.QueryRowContext(ctx, "SELECT name FROM api_tokens WHERE id = ? AND user_id = ?", tokenID, userID).Scan(&name)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM api_tokens WHERE id = ? AND user_id = ?", tokenID, userID); err != nil {
		return err
	}
	if err := s.audit.RecordTx(ctx, tx, audit.TokenRevoked(userID, tokenID, name)); err != nil {
		return err
	}
	return tx.Commit()
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
