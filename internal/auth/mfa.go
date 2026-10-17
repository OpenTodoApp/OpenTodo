package auth

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"database/sql"
	"errors"
	"strings"
	"sync"
	"time"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/ids"
)

// Second factor (OpenSpec change `mfa-totp`): enrolment, recovery codes, the
// two-step sign-in challenge, trusted devices, session freshness, the owner
// policy and resets. Everything here is server-side account data; nothing is
// written to the op log or synced.

const (
	// EnrollmentTTL is how long a pending secret can be confirmed.
	EnrollmentTTL = 10 * time.Minute
	// LoginChallengeTTL and LoginChallengeAttempts bound the second sign-in step.
	LoginChallengeTTL      = 5 * time.Minute
	LoginChallengeAttempts = 5
	// TrustedDeviceTTL is the fixed lifetime of a remembered browser.
	TrustedDeviceTTL = 30 * 24 * time.Hour
	// RecoveryCodeCount codes of RecoveryCodeLength base32 characters each.
	RecoveryCodeCount  = 10
	RecoveryCodeLength = 10

	// MFAMethodTOTP is the method name used in audit events.
	MFAMethodTOTP = "totp"
	// KeyMFARequired is the policy key in the shared settings table.
	KeyMFARequired = "mfa.required"
)

// Policy says which accounts must have a second factor.
type Policy string

const (
	PolicyNone  Policy = "none"
	PolicyOwner Policy = "owner"
	PolicyAll   Policy = "all"
)

// ParsePolicy validates a policy value.
func ParsePolicy(v string) (Policy, error) {
	switch p := Policy(strings.Trim(strings.TrimSpace(v), `"`)); p {
	case PolicyNone, PolicyOwner, PolicyAll:
		return p, nil
	}
	return "", ErrInvalidPolicy
}

// Applies reports whether the policy requires a second factor for role.
func (p Policy) Applies(role string) bool {
	return p == PolicyAll || (p == PolicyOwner && role == "owner")
}

var (
	ErrMFACodeInvalid      = errors.New("the code is not valid, check your authenticator app and try again")
	ErrMFAChallengeInvalid = errors.New("the sign-in attempt expired or had too many wrong codes, enter your password again")
	ErrMFAAlreadyEnrolled  = errors.New("two-factor authentication is already enabled for this account")
	ErrMFANotEnrolled      = errors.New("two-factor authentication is not enabled for this account")
	ErrMFARequiredByPolicy = errors.New("the server owner requires two-factor authentication for this account")
	ErrInvalidPolicy       = errors.New("required must be one of none, owner, all")
)

// MFAFailure is returned for a wrong code. It matches ErrMFACodeInvalid with
// errors.Is and carries the account and a short reason for the audit log; the
// submitted code is never part of it.
type MFAFailure struct {
	UserID string
	Reason string // wrong_code, wrong_recovery_code, expired_enrolment
}

func (f *MFAFailure) Error() string        { return ErrMFACodeInvalid.Error() }
func (f *MFAFailure) Is(target error) bool { return target == ErrMFACodeInvalid }

// MFAStatus is the second-factor state of an account as the client sees it in
// the profile response and in Settings.
type MFAStatus struct {
	Enrolled               bool   `json:"enrolled"`
	RecoveryCodesRemaining int    `json:"recoveryCodesRemaining"`
	Policy                 Policy `json:"policy"`
	// Required is true when the policy requires a second factor for this account.
	Required bool `json:"required"`
	// Restricted is true when this session may only enrol (required, not enrolled).
	Restricted bool `json:"restricted"`
}

// Session is a resolved browser session with its freshness.
type Session struct {
	User      *User
	TokenHash string
	MFAAt     *int64 // second factor satisfied at, nil when never
	ReauthAt  *int64 // last proof of identity, nil for sessions older than this change
	Enrolled  bool   // the account has a confirmed second factor
	Policy    Policy
}

// Restricted reports whether the policy requires a second factor that the
// account does not have yet (design D7).
func (s *Session) Restricted() bool { return s.Policy.Applies(s.User.Role) && !s.Enrolled }

// FreshWithin reports whether the session proved identity within d of now.
func (s *Session) FreshWithin(d time.Duration, now time.Time) bool {
	return s.ReauthAt != nil && now.UnixMilli()-*s.ReauthAt <= d.Milliseconds()
}

// ---- in-memory login challenges (design D3) ----

type loginChallenge struct {
	userID   string
	first    string // first factor: password or passkey
	expires  time.Time
	attempts int
}

type loginChallenges struct {
	mu sync.Mutex
	m  map[string]*loginChallenge
}

func newLoginChallenges() *loginChallenges { return &loginChallenges{m: map[string]*loginChallenge{}} }

func (c *loginChallenges) issue(userID, first string, now time.Time) string {
	c.mu.Lock()
	defer c.mu.Unlock()
	for k, v := range c.m {
		if now.After(v.expires) {
			delete(c.m, k)
		}
	}
	id := ids.Secret(32)
	c.m[id] = &loginChallenge{userID: userID, first: first, expires: now.Add(LoginChallengeTTL)}
	return id
}

func (c *loginChallenges) user(id string, now time.Time) (string, string, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	ch, ok := c.m[id]
	if !ok || now.After(ch.expires) {
		delete(c.m, id)
		return "", "", false
	}
	return ch.userID, ch.first, true
}

// fail counts a wrong code; the challenge is burnt after the last attempt.
func (c *loginChallenges) fail(id string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if ch, ok := c.m[id]; ok {
		ch.attempts++
		if ch.attempts >= LoginChallengeAttempts {
			delete(c.m, id)
		}
	}
}

func (c *loginChallenges) consume(id string) {
	c.mu.Lock()
	delete(c.m, id)
	c.mu.Unlock()
}

// ---- sessions with freshness ----

// Now is the service's time source (time.Now outside tests); the HTTP layer
// uses it for freshness checks so both sides agree.
func (s *Service) Now() time.Time { return s.clock() }

// CreateSessionMFA issues a browser session. reauth_at is set to now (a sign-in
// is a proof of identity); mfa_at too when the second factor was satisfied.
// Every sign-in path ends here, so a deactivated account is refused with
// ErrAccountDeactivated and the account's last sign-in time is recorded in the
// same transaction (user-management).
func (s *Service) CreateSessionMFA(ctx context.Context, userID, userAgent string, mfa bool) (string, time.Time, error) {
	secret := ids.Secret(32)
	now := s.clock()
	exp := now.Add(s.sessionTTL)
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", time.Time{}, err
	}
	defer tx.Rollback()
	if off, err := s.isDeactivated(ctx, tx, userID); err != nil {
		return "", time.Time{}, err
	} else if off {
		return "", time.Time{}, ErrAccountDeactivated
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO user_status(user_id, last_login_at) VALUES(?, ?)
		ON CONFLICT(user_id) DO UPDATE SET last_login_at = excluded.last_login_at`, userID, now.UnixMilli()); err != nil {
		return "", time.Time{}, err
	}
	h := hashToken(secret)
	if _, err := tx.ExecContext(ctx, "INSERT INTO sessions(token_hash,user_id,created_at,expires_at,user_agent) VALUES(?,?,?,?,?)",
		h, userID, now.UnixMilli(), exp.UnixMilli(), truncate(userAgent, 200)); err != nil {
		return "", time.Time{}, err
	}
	var mfaAt any
	if mfa {
		mfaAt = now.UnixMilli()
	}
	if _, err := tx.ExecContext(ctx, "INSERT INTO session_auth(token_hash,mfa_at,reauth_at) VALUES(?,?,?)", h, mfaAt, now.UnixMilli()); err != nil {
		return "", time.Time{}, err
	}
	return secret, exp, tx.Commit()
}

// LookupSession resolves a cookie value to its session, account, freshness,
// enrolment and the current policy in one query, or ErrNotFound.
func (s *Service) LookupSession(ctx context.Context, secret string) (*Session, error) {
	var u User
	var mfaAt, reauthAt, confirmed sql.NullInt64
	var policy sql.NullString
	h := hashToken(secret)
	err := s.db.QueryRowContext(ctx, `SELECT u.id,u.email,u.name,u.role,u.created_at,a.mfa_at,a.reauth_at,
		(SELECT confirmed_at FROM mfa_totp WHERE user_id = u.id),
		(SELECT value FROM settings WHERE key = ?)
		FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN session_auth a ON a.token_hash = s.token_hash
		WHERE s.token_hash = ? AND s.expires_at > ?
		AND u.id NOT IN (SELECT user_id FROM user_status WHERE deactivated_at IS NOT NULL)`, KeyMFARequired, h, s.clock().UnixMilli()).
		Scan(&u.ID, &u.Email, &u.Name, &u.Role, &u.CreatedAt, &mfaAt, &reauthAt, &confirmed, &policy)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	sess := &Session{User: &u, TokenHash: h, Enrolled: confirmed.Valid, Policy: policyOrNone(policy.String)}
	if mfaAt.Valid {
		sess.MFAAt = &mfaAt.Int64
	}
	if reauthAt.Valid {
		sess.ReauthAt = &reauthAt.Int64
	}
	return sess, nil
}

// MarkReauthenticated records a fresh proof of identity on a session; mfa also
// marks the second factor as satisfied.
func (s *Service) MarkReauthenticated(ctx context.Context, tokenHash string, mfa bool) error {
	now := s.clock().UnixMilli()
	q := `INSERT INTO session_auth(token_hash,reauth_at,mfa_at) VALUES(?,?,?)
		ON CONFLICT(token_hash) DO UPDATE SET reauth_at = excluded.reauth_at`
	var mfaAt any
	if mfa {
		mfaAt = now
		q += ", mfa_at = excluded.mfa_at"
	}
	_, err := s.db.ExecContext(ctx, q, tokenHash, now, mfaAt)
	return err
}

// ---- policy ----

func policyOrNone(v string) Policy {
	if p, err := ParsePolicy(v); err == nil {
		return p
	}
	return PolicyNone
}

// MFAPolicy returns the owner's policy (default none).
func (s *Service) MFAPolicy(ctx context.Context) (Policy, error) {
	v, err := readSettingValue(ctx, s.db, KeyMFARequired)
	return policyOrNone(v), err
}

// SetMFAPolicy stores the policy and records settings.changed in the same
// transaction when it changes.
func (s *Service) SetMFAPolicy(ctx context.Context, actorID string, p Policy) (Policy, error) {
	if _, err := ParsePolicy(string(p)); err != nil {
		return "", err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()
	v, err := readSettingValue(ctx, tx, KeyMFARequired)
	if err != nil {
		return "", err
	}
	cur := policyOrNone(v)
	if cur == p {
		return p, nil
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO settings(key,value,updated_at) VALUES(?,?,?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		KeyMFARequired, string(p), s.clock().UnixMilli()); err != nil {
		return "", err
	}
	if err := s.audit.RecordTx(ctx, tx, audit.SettingsChanged(actorID, KeyMFARequired, string(cur), string(p))); err != nil {
		return "", err
	}
	return p, tx.Commit()
}

type rowQuerier interface {
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

func readSettingValue(ctx context.Context, q rowQuerier, key string) (string, error) {
	var v sql.NullString // the shared table allows NULL values
	err := q.QueryRowContext(ctx, "SELECT value FROM settings WHERE key = ?", key).Scan(&v)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return v.String, err
}

// ---- status ----

// HasConfirmedTOTP reports whether the account has an active second factor.
func (s *Service) HasConfirmedTOTP(ctx context.Context, userID string) (bool, error) {
	var n int
	err := s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM mfa_totp WHERE user_id = ? AND confirmed_at IS NOT NULL", userID).Scan(&n)
	return n > 0, err
}

// MFAStatusFor computes the second-factor state of u. restrictable is false for
// bearer-token requests, which policy never restricts.
func (s *Service) MFAStatusFor(ctx context.Context, u *User, restrictable bool) (*MFAStatus, error) {
	enrolled, err := s.HasConfirmedTOTP(ctx, u.ID)
	if err != nil {
		return nil, err
	}
	p, err := s.MFAPolicy(ctx)
	if err != nil {
		return nil, err
	}
	st := &MFAStatus{Enrolled: enrolled, Policy: p, Required: p.Applies(u.Role)}
	st.Restricted = restrictable && st.Required && !enrolled
	if enrolled {
		if err := s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM mfa_recovery_codes WHERE user_id = ? AND used_at IS NULL", u.ID).
			Scan(&st.RecoveryCodesRemaining); err != nil {
			return nil, err
		}
	}
	return st, nil
}

// ---- enrolment ----

// Enrollment is the answer of the enrol step: the only time the secret is returned.
type Enrollment struct {
	Secret    string `json:"secret"`
	URI       string `json:"uri"`
	ExpiresAt int64  `json:"expiresAt"`
}

// BeginTOTPEnrollment issues a fresh pending secret, replacing any earlier
// pending one.
func (s *Service) BeginTOTPEnrollment(ctx context.Context, u *User) (*Enrollment, error) {
	if ok, err := s.HasConfirmedTOTP(ctx, u.ID); err != nil {
		return nil, err
	} else if ok {
		return nil, ErrMFAAlreadyEnrolled
	}
	secret := newTOTPSecret()
	now := s.clock()
	if _, err := s.db.ExecContext(ctx, `INSERT INTO mfa_totp(user_id,secret,created_at,confirmed_at,last_used_step) VALUES(?,?,?,NULL,0)
		ON CONFLICT(user_id) DO UPDATE SET secret = excluded.secret, created_at = excluded.created_at, confirmed_at = NULL, last_used_step = 0
		WHERE mfa_totp.confirmed_at IS NULL`, u.ID, encodeTOTPSecret(secret), now.UnixMilli()); err != nil {
		return nil, err
	}
	return &Enrollment{Secret: encodeTOTPSecret(secret), URI: totpURI(secret, u.Email), ExpiresAt: now.Add(EnrollmentTTL).UnixMilli()}, nil
}

// ConfirmTOTPEnrollment activates the pending secret with a current code,
// generates the recovery codes and records mfa.enrolled in one transaction. The
// session that confirmed (tokenHash, may be empty) is marked as having
// satisfied the second factor.
func (s *Service) ConfirmTOTPEnrollment(ctx context.Context, u *User, code, tokenHash string) ([]string, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var secretB32 string
	var created int64
	var confirmed sql.NullInt64
	err = tx.QueryRowContext(ctx, "SELECT secret,created_at,confirmed_at FROM mfa_totp WHERE user_id = ?", u.ID).Scan(&secretB32, &created, &confirmed)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, &MFAFailure{UserID: u.ID, Reason: "no_pending_enrolment"}
	}
	if err != nil {
		return nil, err
	}
	if confirmed.Valid {
		return nil, ErrMFAAlreadyEnrolled
	}
	now := s.clock()
	if now.UnixMilli()-created > EnrollmentTTL.Milliseconds() {
		return nil, &MFAFailure{UserID: u.ID, Reason: "expired_enrolment"}
	}
	secret, err := decodeTOTPSecret(secretB32)
	if err != nil {
		return nil, err
	}
	step, ok := matchTOTP(secret, code, now, 0)
	if !ok {
		return nil, &MFAFailure{UserID: u.ID, Reason: "wrong_code"}
	}
	if _, err := tx.ExecContext(ctx, "UPDATE mfa_totp SET confirmed_at = ?, last_used_step = ? WHERE user_id = ?", now.UnixMilli(), step, u.ID); err != nil {
		return nil, err
	}
	codes, err := s.replaceRecoveryCodes(ctx, tx, u.ID)
	if err != nil {
		return nil, err
	}
	if tokenHash != "" {
		if _, err := tx.ExecContext(ctx, `INSERT INTO session_auth(token_hash,mfa_at,reauth_at) VALUES(?,?,?)
			ON CONFLICT(token_hash) DO UPDATE SET mfa_at = excluded.mfa_at, reauth_at = excluded.reauth_at`, tokenHash, now.UnixMilli(), now.UnixMilli()); err != nil {
			return nil, err
		}
	}
	if err := s.audit.RecordTx(ctx, tx, audit.MFAEnrolled(u.ID, MFAMethodTOTP)); err != nil {
		return nil, err
	}
	return codes, tx.Commit()
}

// DisableTOTP removes the account's second factor, recovery codes and trusted
// devices, unless the policy requires it for the account.
func (s *Service) DisableTOTP(ctx context.Context, u *User) error {
	p, err := s.MFAPolicy(ctx)
	if err != nil {
		return err
	}
	if p.Applies(u.Role) {
		return ErrMFARequiredByPolicy
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var confirmed sql.NullInt64
	err = tx.QueryRowContext(ctx, "SELECT confirmed_at FROM mfa_totp WHERE user_id = ?", u.ID).Scan(&confirmed)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && !confirmed.Valid) {
		return ErrMFANotEnrolled
	}
	if err != nil {
		return err
	}
	if err := clearMFA(ctx, tx, u.ID); err != nil {
		return err
	}
	if err := s.audit.RecordTx(ctx, tx, audit.MFADisabled(u.ID, u.ID, MFAMethodTOTP)); err != nil {
		return err
	}
	return tx.Commit()
}

// ResetMFA is the owner's rescue for a locked-out member (design D8): it
// removes the secret, recovery codes and trusted devices and clears the second
// factor on the member's sessions, recording mfa.reset in the same transaction.
// actorID is empty when run from the command line.
func (s *Service) ResetMFA(ctx context.Context, actorID, targetID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var n int
	if err := tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM users WHERE id = ?", targetID).Scan(&n); err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	if err := clearMFA(ctx, tx, targetID); err != nil {
		return err
	}
	if err := s.audit.RecordTx(ctx, tx, audit.MFAReset(actorID, targetID)); err != nil {
		return err
	}
	return tx.Commit()
}

// ResetMFAByEmail resets the account with email (the `opentodo mfa-reset`
// subcommand, run against the data directory while the server is stopped).
func (s *Service) ResetMFAByEmail(ctx context.Context, email string) (*User, error) {
	var u User
	err := s.db.QueryRowContext(ctx, "SELECT id,email,name,role,created_at FROM users WHERE email = ?", normalizeEmail(email)).
		Scan(&u.ID, &u.Email, &u.Name, &u.Role, &u.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &u, s.ResetMFA(ctx, "", u.ID)
}

func clearMFA(ctx context.Context, tx *sql.Tx, userID string) error {
	for _, q := range []string{
		"DELETE FROM mfa_totp WHERE user_id = ?",
		"DELETE FROM mfa_recovery_codes WHERE user_id = ?",
		"DELETE FROM trusted_devices WHERE user_id = ?",
		"UPDATE session_auth SET mfa_at = NULL WHERE token_hash IN (SELECT token_hash FROM sessions WHERE user_id = ?)",
	} {
		if _, err := tx.ExecContext(ctx, q, userID); err != nil {
			return err
		}
	}
	return nil
}

// ---- recovery codes ----

// RegenerateRecoveryCodes replaces every recovery code of an enrolled account.
func (s *Service) RegenerateRecoveryCodes(ctx context.Context, userID string) ([]string, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var n int
	if err := tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM mfa_totp WHERE user_id = ? AND confirmed_at IS NOT NULL", userID).Scan(&n); err != nil {
		return nil, err
	}
	if n == 0 {
		return nil, ErrMFANotEnrolled
	}
	codes, err := s.replaceRecoveryCodes(ctx, tx, userID)
	if err != nil {
		return nil, err
	}
	return codes, tx.Commit()
}

func (s *Service) replaceRecoveryCodes(ctx context.Context, tx *sql.Tx, userID string) ([]string, error) {
	if _, err := tx.ExecContext(ctx, "DELETE FROM mfa_recovery_codes WHERE user_id = ?", userID); err != nil {
		return nil, err
	}
	now := s.clock().UnixMilli()
	codes := make([]string, RecoveryCodeCount)
	for i := range codes {
		raw := newRecoveryCode()
		codes[i] = raw[:5] + "-" + raw[5:]
		if _, err := tx.ExecContext(ctx, "INSERT INTO mfa_recovery_codes(user_id,code_hash,created_at) VALUES(?,?,?)",
			userID, hashToken(raw), now); err != nil {
			return nil, err
		}
	}
	return codes, nil
}

// newRecoveryCode returns RecoveryCodeLength random base32 characters (50 bits).
func newRecoveryCode() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		panic("auth: crypto/rand failed: " + err.Error())
	}
	return b32.EncodeToString(b)[:RecoveryCodeLength]
}

func normalizeRecoveryCode(c string) string { return strings.ToUpper(normalizeCode(c)) }

// consumeRecoveryCode spends a matching unused code. Hashes are compared in
// constant time.
func (s *Service) consumeRecoveryCode(ctx context.Context, userID, code string) (bool, error) {
	code = normalizeRecoveryCode(code)
	if len(code) != RecoveryCodeLength {
		return false, nil
	}
	want := []byte(hashToken(code))
	rows, err := s.db.QueryContext(ctx, "SELECT id, code_hash FROM mfa_recovery_codes WHERE user_id = ? AND used_at IS NULL", userID)
	if err != nil {
		return false, err
	}
	var match int64 = -1
	for rows.Next() {
		var id int64
		var h string
		if err := rows.Scan(&id, &h); err != nil {
			rows.Close()
			return false, err
		}
		if subtle.ConstantTimeCompare([]byte(h), want) == 1 {
			match = id
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return false, err
	}
	if match < 0 {
		return false, nil
	}
	res, err := s.db.ExecContext(ctx, "UPDATE mfa_recovery_codes SET used_at = ? WHERE id = ? AND used_at IS NULL", s.clock().UnixMilli(), match)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n == 1, nil
}

// ---- verification ----

// verifyTOTP checks a code against the confirmed secret and advances the
// replay guard atomically, so concurrent requests cannot both use one code.
func (s *Service) verifyTOTP(ctx context.Context, userID, code string) (bool, error) {
	var secretB32 string
	var last int64
	err := s.db.QueryRowContext(ctx, "SELECT secret,last_used_step FROM mfa_totp WHERE user_id = ? AND confirmed_at IS NOT NULL", userID).
		Scan(&secretB32, &last)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	secret, err := decodeTOTPSecret(secretB32)
	if err != nil {
		return false, err
	}
	step, ok := matchTOTP(secret, code, s.clock(), last)
	if !ok {
		return false, nil
	}
	res, err := s.db.ExecContext(ctx, "UPDATE mfa_totp SET last_used_step = ? WHERE user_id = ? AND last_used_step < ?", step, userID, step)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n == 1, nil
}

// VerifySecondFactor checks a code from the app or, when recovery is true, a
// recovery code (consumed on success). It returns the method used for the audit
// log, or an *MFAFailure.
func (s *Service) VerifySecondFactor(ctx context.Context, userID, code string, recovery bool) (string, error) {
	if recovery {
		ok, err := s.consumeRecoveryCode(ctx, userID, code)
		if err != nil {
			return "", err
		}
		if !ok {
			return "", &MFAFailure{UserID: userID, Reason: "wrong_recovery_code"}
		}
		return "recovery_code", nil
	}
	ok, err := s.verifyTOTP(ctx, userID, code)
	if err != nil {
		return "", err
	}
	if !ok {
		return "", &MFAFailure{UserID: userID, Reason: "wrong_code"}
	}
	return MFAMethodTOTP, nil
}

// StartMFAChallenge issues the second-step challenge after a verified first
// factor (first is "password" or "passkey", used in the audit method).
func (s *Service) StartMFAChallenge(userID, first string) string {
	return s.mfaChallenges.issue(userID, first, s.clock())
}

// CompleteMFAChallenge finishes the second sign-in step. An unknown, expired or
// exhausted challenge returns ErrMFAChallengeInvalid; a wrong code counts an
// attempt and returns an *MFAFailure. On success the challenge is consumed and
// the user and the combined method (e.g. password+totp) are returned.
func (s *Service) CompleteMFAChallenge(ctx context.Context, challenge, code string, recovery bool) (*User, string, error) {
	userID, first, ok := s.mfaChallenges.user(challenge, s.clock())
	if !ok {
		return nil, "", ErrMFAChallengeInvalid
	}
	method, err := s.VerifySecondFactor(ctx, userID, code, recovery)
	if errors.Is(err, ErrMFACodeInvalid) {
		s.mfaChallenges.fail(challenge)
		return nil, "", err
	}
	if err != nil {
		return nil, "", err
	}
	s.mfaChallenges.consume(challenge)
	u, err := s.userByID(ctx, userID)
	if err != nil {
		return nil, "", err
	}
	return u, first + "+" + method, nil
}

// CheckPassword verifies the password of an existing account (re-authentication).
func (s *Service) CheckPassword(ctx context.Context, userID, password string) (bool, error) {
	var hash string
	err := s.db.QueryRowContext(ctx, "SELECT password_hash FROM users WHERE id = ?", userID).Scan(&hash)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return VerifyPassword(hash, password)
}

func (s *Service) userByID(ctx context.Context, id string) (*User, error) {
	var u User
	err := s.db.QueryRowContext(ctx, "SELECT id,email,name,role,created_at FROM users WHERE id = ?", id).
		Scan(&u.ID, &u.Email, &u.Name, &u.Role, &u.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &u, err
}

// UserByID returns the public view of an account, or ErrNotFound.
func (s *Service) UserByID(ctx context.Context, id string) (*User, error) { return s.userByID(ctx, id) }

// ---- trusted devices (design D6) ----

// TrustedDevice is the public view of a remembered browser.
type TrustedDevice struct {
	ID         string `json:"id"`
	UserAgent  string `json:"userAgent"`
	CreatedAt  int64  `json:"createdAt"`
	ExpiresAt  int64  `json:"expiresAt"`
	LastUsedAt *int64 `json:"lastUsedAt"`
}

// CreateTrustedDevice remembers this browser for TrustedDeviceTTL and returns
// the cookie value.
func (s *Service) CreateTrustedDevice(ctx context.Context, userID, userAgent string) (string, time.Time, error) {
	secret := ids.Secret(32)
	now := s.clock()
	exp := now.Add(TrustedDeviceTTL)
	_, err := s.db.ExecContext(ctx, "INSERT INTO trusted_devices(id,user_id,token_hash,user_agent,created_at,expires_at) VALUES(?,?,?,?,?,?)",
		ids.New(), userID, hashToken(secret), truncate(userAgent, 200), now.UnixMilli(), exp.UnixMilli())
	return secret, exp, err
}

// TrustedDeviceValid reports whether secret remembers this browser for userID,
// recording the use.
func (s *Service) TrustedDeviceValid(ctx context.Context, userID, secret string) (bool, error) {
	if secret == "" {
		return false, nil
	}
	now := s.clock().UnixMilli()
	res, err := s.db.ExecContext(ctx, "UPDATE trusted_devices SET last_used_at = ? WHERE token_hash = ? AND user_id = ? AND expires_at > ?",
		now, hashToken(secret), userID, now)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n == 1, nil
}

// ListTrustedDevices returns the unexpired remembered browsers of an account.
func (s *Service) ListTrustedDevices(ctx context.Context, userID string) ([]TrustedDevice, error) {
	rows, err := s.db.QueryContext(ctx, "SELECT id,user_agent,created_at,expires_at,last_used_at FROM trusted_devices WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC",
		userID, s.clock().UnixMilli())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []TrustedDevice{}
	for rows.Next() {
		var d TrustedDevice
		if err := rows.Scan(&d.ID, &d.UserAgent, &d.CreatedAt, &d.ExpiresAt, &d.LastUsedAt); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// DeleteTrustedDevice forgets one remembered browser of the account.
func (s *Service) DeleteTrustedDevice(ctx context.Context, userID, id string) error {
	res, err := s.db.ExecContext(ctx, "DELETE FROM trusted_devices WHERE id = ? AND user_id = ?", id, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// DeleteAllTrustedDevices forgets every remembered browser of the account.
func (s *Service) DeleteAllTrustedDevices(ctx context.Context, userID string) error {
	_, err := s.db.ExecContext(ctx, "DELETE FROM trusted_devices WHERE user_id = ?", userID)
	return err
}
