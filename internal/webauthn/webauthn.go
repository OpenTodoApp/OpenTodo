// Package webauthn verifies passkey registrations and assertions.
//
// It implements the server side of the WebAuthn ceremonies that OpenTodo uses
// (OpenSpec change `passkeys`): parsing of clientDataJSON, authenticator data
// and the attestation object, COSE public keys for ES256, RS256 and Ed25519,
// and signature verification over authData || sha256(clientDataJSON). The
// attestation statement is never inspected; the relying party requests
// attestation "none" and only needs the public key.
package webauthn

import (
	"bytes"
	"crypto"
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/elliptic"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"

	"github.com/fxamacker/cbor/v2"
)

// COSE algorithm identifiers (RFC 9053).
const (
	AlgES256 int64 = -7
	AlgEdDSA int64 = -8
	AlgRS256 int64 = -257
)

// SupportedAlgorithms lists the algorithms offered to authenticators, most preferred first.
var SupportedAlgorithms = []int64{AlgES256, AlgEdDSA, AlgRS256}

// Authenticator data flag bits.
const (
	flagUserPresent    = 0x01
	flagUserVerified   = 0x04
	flagBackupEligible = 0x08
	flagBackedUp       = 0x10
	flagAttestedCred   = 0x40
	flagExtensions     = 0x80
)

var (
	// ErrMalformed marks input that could not be parsed.
	ErrMalformed = errors.New("malformed webauthn response")
	// ErrChallengeMismatch marks a client data challenge that differs from the issued one.
	ErrChallengeMismatch = errors.New("challenge mismatch")
	// ErrOriginMismatch marks a ceremony performed on another origin.
	ErrOriginMismatch = errors.New("origin mismatch")
	// ErrRPIDMismatch marks authenticator data bound to another relying party.
	ErrRPIDMismatch = errors.New("relying party id mismatch")
	// ErrUserNotPresent marks authenticator data without the user-presence flag.
	ErrUserNotPresent = errors.New("user presence not asserted")
	// ErrUnsupportedAlgorithm marks a credential key the server cannot verify.
	ErrUnsupportedAlgorithm = errors.New("unsupported signature algorithm")
	// ErrBadSignature marks an assertion signature that does not verify.
	ErrBadSignature = errors.New("signature verification failed")
)

// RelyingParty identifies this server to authenticators.
type RelyingParty struct {
	// ID is the relying-party identifier, the host of the public base URL.
	ID string
	// Origin is the exact origin (scheme://host[:port]) ceremonies must come from.
	Origin string
}

// ClientData is the subset of clientDataJSON the server checks.
type ClientData struct {
	Type      string `json:"type"`
	Challenge string `json:"challenge"`
	Origin    string `json:"origin"`
}

// ParseClientData decodes clientDataJSON.
func ParseClientData(raw []byte) (ClientData, error) {
	var cd ClientData
	if err := json.Unmarshal(raw, &cd); err != nil {
		return cd, fmt.Errorf("%w: clientDataJSON: %v", ErrMalformed, err)
	}
	if cd.Type == "" || cd.Challenge == "" || cd.Origin == "" {
		return cd, fmt.Errorf("%w: clientDataJSON lacks type, challenge or origin", ErrMalformed)
	}
	return cd, nil
}

// ChallengeBytes decodes the base64url challenge carried by client data.
func (cd ClientData) ChallengeBytes() ([]byte, error) {
	b, err := DecodeBase64URL(cd.Challenge)
	if err != nil {
		return nil, fmt.Errorf("%w: challenge is not base64url", ErrMalformed)
	}
	return b, nil
}

// AuthData is the parsed authenticator data structure.
type AuthData struct {
	RPIDHash [32]byte
	Flags    byte
	Counter  uint32
	// The following are present only when Flags has the attested-credential bit.
	AAGUID       [16]byte
	CredentialID []byte
	// PublicKey is the raw COSE_Key of the new credential.
	PublicKey []byte
}

func (a *AuthData) UserPresent() bool    { return a.Flags&flagUserPresent != 0 }
func (a *AuthData) UserVerified() bool   { return a.Flags&flagUserVerified != 0 }
func (a *AuthData) BackupEligible() bool { return a.Flags&flagBackupEligible != 0 }
func (a *AuthData) BackedUp() bool       { return a.Flags&flagBackedUp != 0 }
func (a *AuthData) HasCredential() bool  { return a.Flags&flagAttestedCred != 0 }

// ParseAuthData decodes authenticator data as defined in WebAuthn §6.1.
func ParseAuthData(b []byte) (*AuthData, error) {
	if len(b) < 37 {
		return nil, fmt.Errorf("%w: authenticator data too short", ErrMalformed)
	}
	a := &AuthData{}
	copy(a.RPIDHash[:], b[:32])
	a.Flags = b[32]
	a.Counter = binary.BigEndian.Uint32(b[33:37])
	rest := b[37:]
	if a.HasCredential() {
		if len(rest) < 18 {
			return nil, fmt.Errorf("%w: attested credential data too short", ErrMalformed)
		}
		copy(a.AAGUID[:], rest[:16])
		n := int(binary.BigEndian.Uint16(rest[16:18]))
		rest = rest[18:]
		if n == 0 || n > 1023 || len(rest) < n {
			return nil, fmt.Errorf("%w: credential id length %d", ErrMalformed, n)
		}
		a.CredentialID = append([]byte(nil), rest[:n]...)
		rest = rest[n:]
		dec := cbor.NewDecoder(bytes.NewReader(rest))
		var key cbor.RawMessage
		if err := dec.Decode(&key); err != nil {
			return nil, fmt.Errorf("%w: credential public key: %v", ErrMalformed, err)
		}
		used := dec.NumBytesRead()
		a.PublicKey = append([]byte(nil), rest[:used]...)
		rest = rest[used:]
	}
	if len(rest) > 0 && a.Flags&flagExtensions == 0 {
		return nil, fmt.Errorf("%w: trailing bytes in authenticator data", ErrMalformed)
	}
	return a, nil
}

// AttestationObject is the CBOR structure returned by a registration ceremony.
type AttestationObject struct {
	Format   string          `cbor:"fmt"`
	AuthData []byte          `cbor:"authData"`
	AttStmt  cbor.RawMessage `cbor:"attStmt"`
}

// ParseAttestationObject decodes an attestation object. The statement is kept
// opaque; only authData is used.
func ParseAttestationObject(b []byte) (*AttestationObject, error) {
	var att AttestationObject
	if err := cborDecoder.Unmarshal(b, &att); err != nil {
		return nil, fmt.Errorf("%w: attestation object: %v", ErrMalformed, err)
	}
	if att.Format == "" || len(att.AuthData) == 0 {
		return nil, fmt.Errorf("%w: attestation object lacks fmt or authData", ErrMalformed)
	}
	return &att, nil
}

// cborDecoder rejects duplicate map keys and indefinite-length items; both are
// forbidden by the CTAP2 canonical encoding authenticators must use.
var cborDecoder = func() cbor.DecMode {
	dm, err := cbor.DecOptions{
		DupMapKey:       cbor.DupMapKeyEnforcedAPF,
		IndefLength:     cbor.IndefLengthForbidden,
		MaxNestedLevels: 8,
	}.DecMode()
	if err != nil {
		panic(err)
	}
	return dm
}()

// ParseCOSEKey decodes a COSE_Key into a Go public key and returns its algorithm.
func ParseCOSEKey(raw []byte) (crypto.PublicKey, int64, error) {
	var m map[int64]cbor.RawMessage
	if err := cborDecoder.Unmarshal(raw, &m); err != nil {
		return nil, 0, fmt.Errorf("%w: COSE key: %v", ErrMalformed, err)
	}
	var kty, alg int64
	if err := coseInt(m, 1, &kty); err != nil {
		return nil, 0, err
	}
	if err := coseInt(m, 3, &alg); err != nil {
		return nil, 0, err
	}
	switch {
	case kty == 2 && alg == AlgES256:
		var crv int64
		if err := coseInt(m, -1, &crv); err != nil {
			return nil, 0, err
		}
		if crv != 1 {
			return nil, 0, fmt.Errorf("%w: ES256 needs P-256, got curve %d", ErrUnsupportedAlgorithm, crv)
		}
		x, err := coseBytes(m, -2)
		if err != nil {
			return nil, 0, err
		}
		y, err := coseBytes(m, -3)
		if err != nil {
			return nil, 0, err
		}
		if len(x) != 32 || len(y) != 32 {
			return nil, 0, fmt.Errorf("%w: P-256 coordinates must be 32 bytes", ErrMalformed)
		}
		pub := &ecdsa.PublicKey{Curve: elliptic.P256(), X: new(big.Int).SetBytes(x), Y: new(big.Int).SetBytes(y)}
		if !pub.Curve.IsOnCurve(pub.X, pub.Y) {
			return nil, 0, fmt.Errorf("%w: point not on curve", ErrMalformed)
		}
		return pub, alg, nil
	case kty == 1 && alg == AlgEdDSA:
		var crv int64
		if err := coseInt(m, -1, &crv); err != nil {
			return nil, 0, err
		}
		if crv != 6 {
			return nil, 0, fmt.Errorf("%w: EdDSA needs Ed25519, got curve %d", ErrUnsupportedAlgorithm, crv)
		}
		x, err := coseBytes(m, -2)
		if err != nil {
			return nil, 0, err
		}
		if len(x) != ed25519.PublicKeySize {
			return nil, 0, fmt.Errorf("%w: Ed25519 key must be 32 bytes", ErrMalformed)
		}
		return ed25519.PublicKey(x), alg, nil
	case kty == 3 && alg == AlgRS256:
		n, err := coseBytes(m, -1)
		if err != nil {
			return nil, 0, err
		}
		e, err := coseBytes(m, -2)
		if err != nil {
			return nil, 0, err
		}
		if len(n) < 256 || len(e) == 0 || len(e) > 4 {
			return nil, 0, fmt.Errorf("%w: RSA key must be at least 2048 bits", ErrUnsupportedAlgorithm)
		}
		exp := new(big.Int).SetBytes(e)
		if !exp.IsInt64() || exp.Int64() < 3 {
			return nil, 0, fmt.Errorf("%w: bad RSA exponent", ErrMalformed)
		}
		return &rsa.PublicKey{N: new(big.Int).SetBytes(n), E: int(exp.Int64())}, alg, nil
	}
	return nil, 0, fmt.Errorf("%w: kty %d alg %d", ErrUnsupportedAlgorithm, kty, alg)
}

func coseInt(m map[int64]cbor.RawMessage, key int64, dst *int64) error {
	raw, ok := m[key]
	if !ok {
		return fmt.Errorf("%w: COSE key lacks label %d", ErrMalformed, key)
	}
	if err := cborDecoder.Unmarshal(raw, dst); err != nil {
		return fmt.Errorf("%w: COSE label %d: %v", ErrMalformed, key, err)
	}
	return nil
}

func coseBytes(m map[int64]cbor.RawMessage, key int64) ([]byte, error) {
	raw, ok := m[key]
	if !ok {
		return nil, fmt.Errorf("%w: COSE key lacks label %d", ErrMalformed, key)
	}
	var b []byte
	if err := cborDecoder.Unmarshal(raw, &b); err != nil {
		return nil, fmt.Errorf("%w: COSE label %d: %v", ErrMalformed, key, err)
	}
	return b, nil
}

// VerifySignature checks sig over authData || sha256(clientDataJSON) with the given key.
func VerifySignature(pub crypto.PublicKey, alg int64, authData, clientDataJSON, sig []byte) error {
	cdHash := sha256.Sum256(clientDataJSON)
	signed := make([]byte, 0, len(authData)+len(cdHash))
	signed = append(signed, authData...)
	signed = append(signed, cdHash[:]...)
	switch alg {
	case AlgES256:
		k, ok := pub.(*ecdsa.PublicKey)
		if !ok {
			return ErrUnsupportedAlgorithm
		}
		h := sha256.Sum256(signed)
		if !ecdsa.VerifyASN1(k, h[:], sig) {
			return ErrBadSignature
		}
	case AlgRS256:
		k, ok := pub.(*rsa.PublicKey)
		if !ok {
			return ErrUnsupportedAlgorithm
		}
		h := sha256.Sum256(signed)
		if err := rsa.VerifyPKCS1v15(k, crypto.SHA256, h[:], sig); err != nil {
			return ErrBadSignature
		}
	case AlgEdDSA:
		k, ok := pub.(ed25519.PublicKey)
		if !ok {
			return ErrUnsupportedAlgorithm
		}
		if !ed25519.Verify(k, signed, sig) {
			return ErrBadSignature
		}
	default:
		return ErrUnsupportedAlgorithm
	}
	return nil
}

// RegistrationResponse carries the authenticator's answer to a create() call.
type RegistrationResponse struct {
	ClientDataJSON    []byte
	AttestationObject []byte
	Transports        []string
}

// Credential is what the server stores after a successful registration.
type Credential struct {
	ID             []byte
	PublicKey      []byte // COSE_Key, verified to parse
	Alg            int64
	SignCount      uint32
	BackupEligible bool
	BackedUp       bool
	UserVerified   bool
	Transports     []string
}

// VerifyRegistration checks a registration response against the issued
// challenge and the relying party, returning the credential to store.
func (rp RelyingParty) VerifyRegistration(resp RegistrationResponse, challenge []byte) (*Credential, error) {
	cd, err := ParseClientData(resp.ClientDataJSON)
	if err != nil {
		return nil, err
	}
	if cd.Type != "webauthn.create" {
		return nil, fmt.Errorf("%w: client data type %q", ErrMalformed, cd.Type)
	}
	if err := rp.checkClientData(cd, challenge); err != nil {
		return nil, err
	}
	att, err := ParseAttestationObject(resp.AttestationObject)
	if err != nil {
		return nil, err
	}
	ad, err := ParseAuthData(att.AuthData)
	if err != nil {
		return nil, err
	}
	if err := rp.checkAuthData(ad); err != nil {
		return nil, err
	}
	if !ad.HasCredential() {
		return nil, fmt.Errorf("%w: no attested credential data", ErrMalformed)
	}
	_, alg, err := ParseCOSEKey(ad.PublicKey)
	if err != nil {
		return nil, err
	}
	return &Credential{
		ID:             ad.CredentialID,
		PublicKey:      ad.PublicKey,
		Alg:            alg,
		SignCount:      ad.Counter,
		BackupEligible: ad.BackupEligible(),
		BackedUp:       ad.BackedUp(),
		UserVerified:   ad.UserVerified(),
		Transports:     resp.Transports,
	}, nil
}

// AssertionResponse carries the authenticator's answer to a get() call.
type AssertionResponse struct {
	ClientDataJSON    []byte
	AuthenticatorData []byte
	Signature         []byte
}

// AssertionResult reports what a verified assertion asserted.
type AssertionResult struct {
	Counter      uint32
	UserVerified bool
	BackedUp     bool
}

// VerifyAssertion checks an assertion against the issued challenge, the
// relying party and the stored credential public key.
func (rp RelyingParty) VerifyAssertion(resp AssertionResponse, challenge, publicKey []byte, alg int64) (*AssertionResult, error) {
	cd, err := ParseClientData(resp.ClientDataJSON)
	if err != nil {
		return nil, err
	}
	if cd.Type != "webauthn.get" {
		return nil, fmt.Errorf("%w: client data type %q", ErrMalformed, cd.Type)
	}
	if err := rp.checkClientData(cd, challenge); err != nil {
		return nil, err
	}
	ad, err := ParseAuthData(resp.AuthenticatorData)
	if err != nil {
		return nil, err
	}
	if err := rp.checkAuthData(ad); err != nil {
		return nil, err
	}
	pub, keyAlg, err := ParseCOSEKey(publicKey)
	if err != nil {
		return nil, err
	}
	if keyAlg != alg {
		return nil, fmt.Errorf("%w: stored algorithm %d does not match key %d", ErrUnsupportedAlgorithm, alg, keyAlg)
	}
	if err := VerifySignature(pub, alg, resp.AuthenticatorData, resp.ClientDataJSON, resp.Signature); err != nil {
		return nil, err
	}
	return &AssertionResult{Counter: ad.Counter, UserVerified: ad.UserVerified(), BackedUp: ad.BackedUp()}, nil
}

func (rp RelyingParty) checkClientData(cd ClientData, challenge []byte) error {
	got, err := cd.ChallengeBytes()
	if err != nil {
		return err
	}
	if len(challenge) == 0 || !bytes.Equal(got, challenge) {
		return ErrChallengeMismatch
	}
	if cd.Origin != rp.Origin {
		return ErrOriginMismatch
	}
	return nil
}

func (rp RelyingParty) checkAuthData(ad *AuthData) error {
	want := sha256.Sum256([]byte(rp.ID))
	if ad.RPIDHash != want {
		return ErrRPIDMismatch
	}
	if !ad.UserPresent() {
		return ErrUserNotPresent
	}
	return nil
}

// DecodeBase64URL accepts base64url with or without padding, which is how
// browsers and the web app encode binary fields in JSON.
func DecodeBase64URL(s string) ([]byte, error) {
	if b, err := base64.RawURLEncoding.DecodeString(s); err == nil {
		return b, nil
	}
	return base64.URLEncoding.DecodeString(s)
}

// EncodeBase64URL encodes bytes as unpadded base64url.
func EncodeBase64URL(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }
