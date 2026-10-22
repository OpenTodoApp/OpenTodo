package oidc

import (
	"crypto"
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/elliptic"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"
)

// Identity-token verification (design D1): a compact JWS whose signature is
// checked with a key from the provider's JWKS, then the OpenID Connect claims.
// Only the algorithms below are accepted; "none", HMAC and anything else is
// refused before a key is even looked up.

// Leeway tolerates provider clock skew on exp, iat and nbf.
const Leeway = 60 * time.Second

// maxTokenSize bounds what is parsed at all.
const maxTokenSize = 16 << 10

// Supported signature algorithms.
var supportedAlgs = map[string]bool{"RS256": true, "PS256": true, "ES256": true, "EdDSA": true}

// ErrInvalidToken wraps every verification failure; the wrapped text names the
// failed step for logs and is never shown to users.
var ErrInvalidToken = errors.New("oidc: invalid identity token")

func invalid(format string, a ...any) error {
	return fmt.Errorf("%w: %s", ErrInvalidToken, fmt.Sprintf(format, a...))
}

// JWK is one key of a JSON Web Key Set. Only the members needed to verify
// signatures are read.
type JWK struct {
	Kty string `json:"kty"`
	Kid string `json:"kid"`
	Use string `json:"use,omitempty"`
	Alg string `json:"alg,omitempty"`
	N   string `json:"n,omitempty"`
	E   string `json:"e,omitempty"`
	Crv string `json:"crv,omitempty"`
	X   string `json:"x,omitempty"`
	Y   string `json:"y,omitempty"`
}

// JWKS is a JSON Web Key Set document.
type JWKS struct {
	Keys []JWK `json:"keys"`
}

// publicKey converts the JWK into a Go public key.
func (k JWK) publicKey() (crypto.PublicKey, error) {
	switch k.Kty {
	case "RSA":
		n, err := b64(k.N)
		if err != nil || len(n) == 0 {
			return nil, errors.New("bad RSA modulus")
		}
		e, err := b64(k.E)
		if err != nil || len(e) == 0 || len(e) > 4 {
			return nil, errors.New("bad RSA exponent")
		}
		var exp int
		for _, c := range e {
			exp = exp<<8 | int(c)
		}
		pub := &rsa.PublicKey{N: new(big.Int).SetBytes(n), E: exp}
		if pub.N.BitLen() < 2048 || exp < 3 || exp%2 == 0 {
			return nil, errors.New("RSA key too small or bad exponent")
		}
		return pub, nil
	case "EC":
		if k.Crv != "P-256" {
			return nil, fmt.Errorf("unsupported curve %q", k.Crv)
		}
		x, err1 := b64(k.X)
		y, err2 := b64(k.Y)
		if err1 != nil || err2 != nil || len(x) != 32 || len(y) != 32 {
			return nil, errors.New("bad EC point")
		}
		// Uncompressed point encoding; ecdh-style parsing rejects points off the curve.
		raw := append(append([]byte{4}, x...), y...)
		pub, err := ecdsa.ParseUncompressedPublicKey(elliptic.P256(), raw)
		if err != nil {
			return nil, errors.New("EC point not on curve")
		}
		return pub, nil
	case "OKP":
		if k.Crv != "Ed25519" {
			return nil, fmt.Errorf("unsupported curve %q", k.Crv)
		}
		x, err := b64(k.X)
		if err != nil || len(x) != ed25519.PublicKeySize {
			return nil, errors.New("bad Ed25519 key")
		}
		return ed25519.PublicKey(x), nil
	}
	return nil, fmt.Errorf("unsupported key type %q", k.Kty)
}

// verifySignature checks sig over signingInput with key for alg.
func verifySignature(alg string, key crypto.PublicKey, signingInput, sig []byte) error {
	switch alg {
	case "RS256", "PS256":
		pub, ok := key.(*rsa.PublicKey)
		if !ok {
			return errors.New("key type does not match alg")
		}
		h := sha256.Sum256(signingInput)
		if alg == "RS256" {
			return rsa.VerifyPKCS1v15(pub, crypto.SHA256, h[:], sig)
		}
		return rsa.VerifyPSS(pub, crypto.SHA256, h[:], sig, &rsa.PSSOptions{SaltLength: rsa.PSSSaltLengthEqualsHash})
	case "ES256":
		pub, ok := key.(*ecdsa.PublicKey)
		if !ok || pub.Curve != elliptic.P256() {
			return errors.New("key type does not match alg")
		}
		if len(sig) != 64 {
			return errors.New("bad ES256 signature length")
		}
		h := sha256.Sum256(signingInput)
		r, s := new(big.Int).SetBytes(sig[:32]), new(big.Int).SetBytes(sig[32:])
		if !ecdsa.Verify(pub, h[:], r, s) {
			return errors.New("signature mismatch")
		}
		return nil
	case "EdDSA":
		pub, ok := key.(ed25519.PublicKey)
		if !ok {
			return errors.New("key type does not match alg")
		}
		if !ed25519.Verify(pub, signingInput, sig) {
			return errors.New("signature mismatch")
		}
		return nil
	}
	return fmt.Errorf("unsupported alg %q", alg)
}

// keyMatchesAlg reports whether a JWK may be used with alg.
func keyMatchesAlg(k JWK, alg string) bool {
	if k.Use != "" && k.Use != "sig" {
		return false
	}
	if k.Alg != "" && k.Alg != alg {
		return false
	}
	switch alg {
	case "RS256", "PS256":
		return k.Kty == "RSA"
	case "ES256":
		return k.Kty == "EC"
	case "EdDSA":
		return k.Kty == "OKP"
	}
	return false
}

// Claims are the identity-token claims OpenTodo reads.
type Claims struct {
	Issuer            string   `json:"iss"`
	Subject           string   `json:"sub"`
	Audience          audience `json:"aud"`
	AuthorizedParty   string   `json:"azp"`
	Expiry            numeric  `json:"exp"`
	IssuedAt          numeric  `json:"iat"`
	NotBefore         numeric  `json:"nbf"`
	Nonce             string   `json:"nonce"`
	Email             string   `json:"email"`
	EmailVerified     flexBool `json:"email_verified"`
	Name              string   `json:"name"`
	PreferredUsername string   `json:"preferred_username"`
	// Picture is the profile picture URL of the `profile` scope (OpenID Connect
	// Core 5.1), used only when the owner turned on "Use profile pictures from
	// the provider" (issue #233).
	Picture string `json:"picture"`
}

// audience accepts a single string or an array (RFC 7519 4.1.3).
type audience []string

func (a *audience) UnmarshalJSON(b []byte) error {
	var one string
	if err := json.Unmarshal(b, &one); err == nil {
		*a = audience{one}
		return nil
	}
	var many []string
	if err := json.Unmarshal(b, &many); err != nil {
		return errors.New("aud must be a string or an array of strings")
	}
	*a = many
	return nil
}

func (a audience) contains(v string) bool {
	for _, x := range a {
		if x == v {
			return true
		}
	}
	return false
}

// numeric is a NumericDate (seconds, possibly fractional).
type numeric int64

func (n *numeric) UnmarshalJSON(b []byte) error {
	var f float64
	if err := json.Unmarshal(b, &f); err != nil {
		return errors.New("date claim must be a number")
	}
	*n = numeric(int64(f))
	return nil
}

// flexBool accepts true/false and, as some providers send, "true"/"false".
type flexBool bool

func (f *flexBool) UnmarshalJSON(b []byte) error {
	var v bool
	if err := json.Unmarshal(b, &v); err == nil {
		*f = flexBool(v)
		return nil
	}
	var s string
	if err := json.Unmarshal(b, &s); err != nil {
		return errors.New("email_verified must be a boolean")
	}
	*f = flexBool(s == "true")
	return nil
}

// VerifyOptions are the expectations an identity token must meet.
type VerifyOptions struct {
	Issuer   string // exact iss
	ClientID string // must be in aud
	Nonce    string // must equal the nonce claim
	Now      time.Time
}

// KeyLookup returns the candidate keys for a key id; it may refresh the key
// set when the id is unknown.
type KeyLookup func(kid string) ([]JWK, error)

// VerifyIDToken checks the token's signature and claims and returns the claims.
func VerifyIDToken(raw string, keys KeyLookup, opts VerifyOptions) (*Claims, error) {
	if len(raw) > maxTokenSize {
		return nil, invalid("token too large")
	}
	parts := strings.Split(raw, ".")
	if len(parts) != 3 {
		return nil, invalid("not a compact JWS")
	}
	hb, err := b64(parts[0])
	if err != nil {
		return nil, invalid("bad header encoding")
	}
	var hdr struct {
		Alg  string `json:"alg"`
		Kid  string `json:"kid"`
		Crit []any  `json:"crit"`
	}
	if err := json.Unmarshal(hb, &hdr); err != nil {
		return nil, invalid("bad header")
	}
	if !supportedAlgs[hdr.Alg] {
		return nil, invalid("alg %q not allowed", hdr.Alg)
	}
	if len(hdr.Crit) > 0 {
		return nil, invalid("crit header not supported")
	}
	if hdr.Kid == "" {
		return nil, invalid("kid missing")
	}
	sig, err := b64(parts[2])
	if err != nil {
		return nil, invalid("bad signature encoding")
	}
	candidates, err := keys(hdr.Kid)
	if err != nil {
		return nil, invalid("key lookup: %v", err)
	}
	signingInput := []byte(parts[0] + "." + parts[1])
	verified := false
	for _, k := range candidates {
		if k.Kid != hdr.Kid || !keyMatchesAlg(k, hdr.Alg) {
			continue
		}
		pub, err := k.publicKey()
		if err != nil {
			continue
		}
		if verifySignature(hdr.Alg, pub, signingInput, sig) == nil {
			verified = true
			break
		}
	}
	if !verified {
		return nil, invalid("signature not verified by any key with kid %q", hdr.Kid)
	}
	pb, err := b64(parts[1])
	if err != nil {
		return nil, invalid("bad payload encoding")
	}
	var c Claims
	if err := json.Unmarshal(pb, &c); err != nil {
		return nil, invalid("bad claims: %v", err)
	}
	if err := checkClaims(&c, opts); err != nil {
		return nil, err
	}
	return &c, nil
}

func checkClaims(c *Claims, o VerifyOptions) error {
	now := o.Now
	if now.IsZero() {
		now = time.Now()
	}
	sec := now.Unix()
	lee := int64(Leeway / time.Second)
	switch {
	case o.Issuer == "" || c.Issuer != o.Issuer:
		return invalid("issuer %q does not match", c.Issuer)
	case c.Subject == "":
		return invalid("sub missing")
	case o.ClientID == "" || !c.Audience.contains(o.ClientID):
		return invalid("audience does not contain the client id")
	case len(c.Audience) > 1 && c.AuthorizedParty != o.ClientID:
		return invalid("azp does not match the client id")
	case c.AuthorizedParty != "" && c.AuthorizedParty != o.ClientID:
		return invalid("azp does not match the client id")
	case c.Expiry == 0 || int64(c.Expiry)+lee < sec:
		return invalid("token expired")
	case c.IssuedAt == 0 || int64(c.IssuedAt)-lee > sec:
		return invalid("iat missing or in the future")
	case c.NotBefore != 0 && int64(c.NotBefore)-lee > sec:
		return invalid("token not yet valid")
	case o.Nonce == "" || c.Nonce != o.Nonce:
		return invalid("nonce mismatch")
	}
	return nil
}

// b64 decodes base64url with or without padding.
func b64(s string) ([]byte, error) {
	return base64.RawURLEncoding.DecodeString(strings.TrimRight(s, "="))
}
