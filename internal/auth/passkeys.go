package auth

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/ids"
	"github.com/pixari/opentodo/internal/webauthn"
)

// Passkey is the public view of a registered WebAuthn credential.
type Passkey struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	CreatedAt    int64  `json:"createdAt"`
	LastUsedAt   *int64 `json:"lastUsedAt"`
	SuspiciousAt *int64 `json:"suspiciousAt"`
	BackedUp     bool   `json:"backedUp"`
}

var (
	// ErrPasskeysUnavailable is returned when no relying party is configured
	// (the public base URL is not https or a localhost origin).
	ErrPasskeysUnavailable = errors.New("passkeys are not available on this server: OPENTODO_BASE_URL must be https")
	// ErrChallengeInvalid is returned when a ceremony carries an unknown,
	// expired, reused or foreign challenge.
	ErrChallengeInvalid = errors.New("passkey challenge is expired or was already used, try again")
	// ErrInvalidInput wraps verification failures caused by the client's data.
	ErrInvalidInput = errors.New("invalid passkey response")
)

// rpName is shown by authenticators next to the credential.
const rpName = "OpenTodo"

// ConfigurePasskeys enables passkey ceremonies for the given relying party.
func (s *Service) ConfigurePasskeys(rpID, origin string) {
	s.rp = &webauthn.RelyingParty{ID: rpID, Origin: origin}
	s.challenges = webauthn.NewChallenges(webauthn.ChallengeTTL)
}

// PasskeysAvailable reports whether ConfigurePasskeys was called.
func (s *Service) PasskeysAvailable() bool { return s.rp != nil }

// CredentialDescriptor names a credential in ceremony options.
type CredentialDescriptor struct {
	Type string `json:"type"`
	ID   string `json:"id"`
}

// RegistrationOptions is the PublicKeyCredentialCreationOptions JSON handed to
// navigator.credentials.create(); binary fields are base64url strings.
type RegistrationOptions struct {
	Challenge              string                 `json:"challenge"`
	RP                     map[string]string      `json:"rp"`
	User                   map[string]string      `json:"user"`
	PubKeyCredParams       []map[string]any       `json:"pubKeyCredParams"`
	AuthenticatorSelection map[string]any         `json:"authenticatorSelection"`
	Timeout                int64                  `json:"timeout"`
	Attestation            string                 `json:"attestation"`
	ExcludeCredentials     []CredentialDescriptor `json:"excludeCredentials"`
}

// LoginOptions is the PublicKeyCredentialRequestOptions JSON for
// navigator.credentials.get(); no allowCredentials so the authenticator picks
// a discoverable credential.
type LoginOptions struct {
	Challenge        string                 `json:"challenge"`
	RPID             string                 `json:"rpId"`
	UserVerification string                 `json:"userVerification"`
	Timeout          int64                  `json:"timeout"`
	AllowCredentials []CredentialDescriptor `json:"allowCredentials"`
}

// BeginPasskeyRegistration issues a challenge bound to the user and returns
// the creation options.
func (s *Service) BeginPasskeyRegistration(ctx context.Context, u *User) (*RegistrationOptions, error) {
	if s.rp == nil {
		return nil, ErrPasskeysUnavailable
	}
	rows, err := s.db.QueryContext(ctx, "SELECT credential_id FROM passkeys WHERE user_id = ?", u.ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	exclude := []CredentialDescriptor{}
	for rows.Next() {
		var id []byte
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		exclude = append(exclude, CredentialDescriptor{Type: "public-key", ID: webauthn.EncodeBase64URL(id)})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	params := make([]map[string]any, 0, len(webauthn.SupportedAlgorithms))
	for _, alg := range webauthn.SupportedAlgorithms {
		params = append(params, map[string]any{"type": "public-key", "alg": alg})
	}
	display := strings.TrimSpace(u.Name)
	if display == "" {
		display = u.Email
	}
	return &RegistrationOptions{
		Challenge:        webauthn.EncodeBase64URL(s.challenges.Issue(u.ID)),
		RP:               map[string]string{"id": s.rp.ID, "name": rpName},
		User:             map[string]string{"id": webauthn.EncodeBase64URL([]byte(u.ID)), "name": u.Email, "displayName": display},
		PubKeyCredParams: params,
		AuthenticatorSelection: map[string]any{
			"residentKey":        "required",
			"requireResidentKey": true,
			"userVerification":   "preferred",
		},
		Timeout:            webauthn.ChallengeTTL.Milliseconds(),
		Attestation:        "none",
		ExcludeCredentials: exclude,
	}, nil
}

// FinishPasskeyRegistration verifies the authenticator response against the
// challenge it carries and stores the credential under the given name.
func (s *Service) FinishPasskeyRegistration(ctx context.Context, userID, name string, resp webauthn.RegistrationResponse) (*Passkey, error) {
	if s.rp == nil {
		return nil, ErrPasskeysUnavailable
	}
	challenge, err := s.consumeChallenge(resp.ClientDataJSON, userID)
	if err != nil {
		return nil, err
	}
	cred, err := s.rp.VerifyRegistration(resp, challenge)
	if err != nil {
		return nil, errors.Join(ErrInvalidInput, err)
	}
	name = strings.TrimSpace(name)
	if name == "" {
		name = "Passkey"
	}
	now := time.Now().UnixMilli()
	// Registering proves possession, so it counts as the first use; Settings
	// shows the new passkey as used "just now".
	p := &Passkey{ID: ids.New(), Name: truncate(name, 100), CreatedAt: now, LastUsedAt: &now, BackedUp: cred.BackedUp}
	// The passkey and its passkey.registered audit event commit together.
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	_, err = tx.ExecContext(ctx, `INSERT INTO passkeys(id,user_id,name,credential_id,public_key,alg,sign_count,transports,backup_eligible,backed_up,created_at,last_used_at)
		VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
		p.ID, userID, p.Name, cred.ID, cred.PublicKey, cred.Alg, cred.SignCount, strings.Join(cred.Transports, ","), boolInt(cred.BackupEligible), boolInt(cred.BackedUp), p.CreatedAt, now)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			return nil, errors.Join(ErrInvalidInput, errors.New("this passkey is already registered"))
		}
		return nil, err
	}
	if err := s.audit.RecordTx(ctx, tx, audit.PasskeyRegistered(userID, p.ID, p.Name)); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return p, nil
}

// ListPasskeys returns a user's passkeys, newest first.
func (s *Service) ListPasskeys(ctx context.Context, userID string) ([]Passkey, error) {
	rows, err := s.db.QueryContext(ctx, "SELECT id,name,created_at,last_used_at,suspicious_at,backed_up FROM passkeys WHERE user_id = ? ORDER BY created_at DESC", userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Passkey{}
	for rows.Next() {
		var p Passkey
		var backedUp int
		if err := rows.Scan(&p.ID, &p.Name, &p.CreatedAt, &p.LastUsedAt, &p.SuspiciousAt, &backedUp); err != nil {
			return nil, err
		}
		p.BackedUp = backedUp != 0
		out = append(out, p)
	}
	return out, rows.Err()
}

// RenamePasskey changes the name of a passkey owned by the user.
func (s *Service) RenamePasskey(ctx context.Context, userID, passkeyID, name string) (*Passkey, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, errors.Join(ErrInvalidInput, errors.New("name is required"))
	}
	res, err := s.db.ExecContext(ctx, "UPDATE passkeys SET name = ? WHERE id = ? AND user_id = ?", truncate(name, 100), passkeyID, userID)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, ErrNotFound
	}
	return s.passkeyByID(ctx, userID, passkeyID)
}

// DeletePasskey revokes a passkey owned by the user, recording passkey.deleted
// in the same transaction.
func (s *Service) DeletePasskey(ctx context.Context, userID, passkeyID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var name string
	err = tx.QueryRowContext(ctx, "SELECT name FROM passkeys WHERE id = ? AND user_id = ?", passkeyID, userID).Scan(&name)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM passkeys WHERE id = ? AND user_id = ?", passkeyID, userID); err != nil {
		return err
	}
	if err := s.audit.RecordTx(ctx, tx, audit.PasskeyDeleted(userID, userID, passkeyID, name)); err != nil {
		return err
	}
	return tx.Commit()
}

// BeginPasskeyLogin issues an anonymous challenge and returns request options.
func (s *Service) BeginPasskeyLogin(ctx context.Context) (*LoginOptions, error) {
	if s.rp == nil {
		return nil, ErrPasskeysUnavailable
	}
	return &LoginOptions{
		Challenge:        webauthn.EncodeBase64URL(s.challenges.Issue("")),
		RPID:             s.rp.ID,
		UserVerification: "preferred",
		Timeout:          webauthn.ChallengeTTL.Milliseconds(),
		AllowCredentials: []CredentialDescriptor{},
	}, nil
}

// FinishPasskeyLogin verifies an assertion, identifies the account from the
// credential id and returns the user. Unknown, revoked or non-verifying
// credentials and counter regressions all read as ErrInvalidCredentials; the
// error is a *LoginFailure carrying the audit reason.
func (s *Service) FinishPasskeyLogin(ctx context.Context, credentialID []byte, resp webauthn.AssertionResponse) (*User, error) {
	u, _, err := s.FinishPasskeyLoginVerified(ctx, credentialID, resp)
	return u, err
}

// FinishPasskeyLoginVerified is FinishPasskeyLogin that also reports whether
// the authenticator performed user verification (biometric or PIN). A verified
// assertion is two factors and satisfies the second factor (mfa-totp D5).
func (s *Service) FinishPasskeyLoginVerified(ctx context.Context, credentialID []byte, resp webauthn.AssertionResponse) (*User, bool, error) {
	u, res, err := s.finishPasskeyLogin(ctx, credentialID, resp)
	if err != nil {
		return nil, false, err
	}
	return u, res.UserVerified, nil
}

func (s *Service) finishPasskeyLogin(ctx context.Context, credentialID []byte, resp webauthn.AssertionResponse) (*User, *webauthn.AssertionResult, error) {
	if s.rp == nil {
		return nil, nil, ErrPasskeysUnavailable
	}
	challenge, err := s.consumeChallenge(resp.ClientDataJSON, "")
	if err != nil {
		return nil, nil, err
	}
	var (
		u         User
		pkID      string
		publicKey []byte
		alg       int64
		count     int64
	)
	err = s.db.QueryRowContext(ctx, `SELECT p.id,p.public_key,p.alg,p.sign_count,u.id,u.email,u.name,u.role,u.created_at
		FROM passkeys p JOIN users u ON u.id = p.user_id WHERE p.credential_id = ?`, credentialID).
		Scan(&pkID, &publicKey, &alg, &count, &u.ID, &u.Email, &u.Name, &u.Role, &u.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil, &LoginFailure{Reason: audit.ReasonUnknownPasskey}
	}
	if err != nil {
		return nil, nil, err
	}
	res, err := s.rp.VerifyAssertion(resp, challenge, publicKey, alg)
	if err != nil {
		return nil, nil, &LoginFailure{UserID: u.ID, Email: u.Email, Reason: audit.ReasonPasskeyRejected}
	}
	now := time.Now().UnixMilli()
	// Counter regression means a cloned authenticator (design D7). Synced
	// passkeys report zero and are exempt.
	if count > 0 && int64(res.Counter) <= count {
		_, _ = s.db.ExecContext(ctx, "UPDATE passkeys SET suspicious_at = ? WHERE id = ?", now, pkID)
		return nil, nil, &LoginFailure{UserID: u.ID, Email: u.Email, Reason: audit.ReasonPasskeyCounter}
	}
	if _, err := s.db.ExecContext(ctx, "UPDATE passkeys SET sign_count = ?, last_used_at = ?, backed_up = ? WHERE id = ?",
		int64(res.Counter), now, boolInt(res.BackedUp), pkID); err != nil {
		return nil, nil, err
	}
	return &u, res, nil
}

// consumeChallenge extracts the challenge from client data and burns it.
func (s *Service) consumeChallenge(clientDataJSON []byte, userID string) ([]byte, error) {
	cd, err := webauthn.ParseClientData(clientDataJSON)
	if err != nil {
		return nil, errors.Join(ErrInvalidInput, err)
	}
	challenge, err := cd.ChallengeBytes()
	if err != nil {
		return nil, errors.Join(ErrInvalidInput, err)
	}
	if !s.challenges.Consume(challenge, userID) {
		return nil, ErrChallengeInvalid
	}
	return challenge, nil
}

func (s *Service) passkeyByID(ctx context.Context, userID, id string) (*Passkey, error) {
	var p Passkey
	var backedUp int
	err := s.db.QueryRowContext(ctx, "SELECT id,name,created_at,last_used_at,suspicious_at,backed_up FROM passkeys WHERE id = ? AND user_id = ?", id, userID).
		Scan(&p.ID, &p.Name, &p.CreatedAt, &p.LastUsedAt, &p.SuspiciousAt, &backedUp)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	p.BackedUp = backedUp != 0
	return &p, nil
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
