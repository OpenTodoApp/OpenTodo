package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/subtle"
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"hash"
	"net/url"
	"strings"
	"time"
)

// Time-based one-time passwords (RFC 6238) with the standard library only
// (OpenSpec change `mfa-totp`, design D1). Authenticator apps default to
// HMAC-SHA1, six digits and a 30-second period; that is what OpenTodo issues.

const (
	totpPeriod     = 30 // seconds per time step
	totpDigits     = 6
	totpSecretSize = 20 // bytes, the RFC 4226 recommended key length for SHA1
	totpSkew       = 1  // accepted steps either side of the server's current step
	totpIssuer     = "OpenTodo"
)

var b32 = base32.StdEncoding.WithPadding(base32.NoPadding)

// newTOTPSecret returns a fresh random secret.
func newTOTPSecret() []byte {
	b := make([]byte, totpSecretSize)
	if _, err := rand.Read(b); err != nil {
		panic(fmt.Sprintf("auth: crypto/rand failed: %v", err))
	}
	return b
}

// encodeTOTPSecret renders a secret the way authenticator apps expect it:
// unpadded upper-case base32.
func encodeTOTPSecret(secret []byte) string { return b32.EncodeToString(secret) }

// decodeTOTPSecret parses a stored or user-typed base32 secret, ignoring
// spaces, case and padding.
func decodeTOTPSecret(s string) ([]byte, error) {
	s = strings.ToUpper(strings.NewReplacer(" ", "", "-", "", "=", "").Replace(s))
	return b32.DecodeString(s)
}

// totpURI builds the otpauth:// provisioning URI encoded in the enrolment QR code.
func totpURI(secret []byte, account string) string {
	label := url.PathEscape(totpIssuer + ":" + account)
	q := url.Values{}
	q.Set("secret", encodeTOTPSecret(secret))
	q.Set("issuer", totpIssuer)
	q.Set("algorithm", "SHA1")
	q.Set("digits", fmt.Sprint(totpDigits))
	q.Set("period", fmt.Sprint(totpPeriod))
	return "otpauth://totp/" + label + "?" + q.Encode()
}

// totpStep is the RFC 6238 counter for t.
func totpStep(t time.Time) int64 { return t.Unix() / totpPeriod }

// hotp computes an RFC 4226 code for counter with the given hash and digit count.
func hotp(newHash func() hash.Hash, key []byte, counter int64, digits int) string {
	var msg [8]byte
	binary.BigEndian.PutUint64(msg[:], uint64(counter))
	m := hmac.New(newHash, key)
	m.Write(msg[:])
	sum := m.Sum(nil)
	off := sum[len(sum)-1] & 0x0f
	bin := (uint32(sum[off])&0x7f)<<24 | uint32(sum[off+1])<<16 | uint32(sum[off+2])<<8 | uint32(sum[off+3])
	mod := uint32(1)
	for i := 0; i < digits; i++ {
		mod *= 10
	}
	return fmt.Sprintf("%0*d", digits, bin%mod)
}

// totpCode is the six-digit SHA1 code for a time step.
func totpCode(secret []byte, step int64) string { return hotp(sha1.New, secret, step, totpDigits) }

// TOTPCodeAt returns the code an authenticator app shows at t for a base32
// secret. Exported for tests and tooling (the browser smoke test computes codes
// from the secret it was shown); the server itself verifies with matchTOTP.
func TOTPCodeAt(secretB32 string, t time.Time) (string, error) {
	secret, err := decodeTOTPSecret(secretB32)
	if err != nil {
		return "", err
	}
	return totpCode(secret, totpStep(t)), nil
}

// normalizeCode strips the spaces and dashes people type into code fields.
func normalizeCode(code string) string {
	return strings.NewReplacer(" ", "", "-", "", "\t", "").Replace(strings.TrimSpace(code))
}

// matchTOTP checks code against the steps around now, newest-first tolerant of
// one step of clock drift either side, and refuses any step at or below
// lastUsed so that one code completes at most one authentication (replay
// guard). It returns the matching step. Every candidate is compared in
// constant time.
func matchTOTP(secret []byte, code string, now time.Time, lastUsed int64) (int64, bool) {
	code = normalizeCode(code)
	if len(code) != totpDigits {
		return 0, false
	}
	cur := totpStep(now)
	var found int64
	ok := 0
	for d := int64(-totpSkew); d <= totpSkew; d++ {
		step := cur + d
		eq := subtle.ConstantTimeCompare([]byte(totpCode(secret, step)), []byte(code))
		if eq == 1 && step > lastUsed && ok == 0 {
			found, ok = step, 1
		}
	}
	return found, ok == 1
}
