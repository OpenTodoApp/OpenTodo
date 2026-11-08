package mcpoauth

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
)

// ValidVerifier reports whether a PKCE verifier has the shape RFC 7636 allows:
// 43 to 128 characters of unreserved ASCII.
func ValidVerifier(v string) bool {
	if len(v) < 43 || len(v) > 128 {
		return false
	}
	for i := 0; i < len(v); i++ {
		c := v[i]
		switch {
		case c >= 'A' && c <= 'Z', c >= 'a' && c <= 'z', c >= '0' && c <= '9':
		case c == '-', c == '.', c == '_', c == '~':
		default:
			return false
		}
	}
	return true
}

// VerifyS256 reports whether verifier hashes to challenge in the S256 form of
// RFC 7636, which is the only challenge method the server accepts (design D4).
func VerifyS256(challenge, verifier string) bool {
	if !ValidVerifier(verifier) || challenge == "" {
		return false
	}
	sum := sha256.Sum256([]byte(verifier))
	got := base64.RawURLEncoding.EncodeToString(sum[:])
	return subtle.ConstantTimeCompare([]byte(got), []byte(challenge)) == 1
}
