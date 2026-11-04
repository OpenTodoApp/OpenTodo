package mcpoauth

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"strings"
)

// GoogleRedirectPrefixes are the only redirect addresses dynamic registration
// accepts (design D3). Google registers six per connector — production,
// sandbox and test hosts, each under /r/ and /a/ — and the suffix is opaque, so
// a client stores the prefix and matches what it is asked.
//
// Source: https://developers.google.com/connected-apps/mcp/oauth
var GoogleRedirectPrefixes = []string{
	"https://oauth-redirect.googleusercontent.com/r/",
	"https://oauth-redirect.googleusercontent.com/a/",
	"https://oauth-redirect-sandbox.googleusercontent.com/r/",
	"https://oauth-redirect-sandbox.googleusercontent.com/a/",
	"https://oauth-redirect-test.googleusercontent.com/r/",
	"https://oauth-redirect-test.googleusercontent.com/a/",
}

// IsGoogleRedirect reports whether uri is one of Google's connector redirect
// addresses.
func IsGoogleRedirect(uri string) bool {
	uri = strings.TrimSpace(uri)
	for _, p := range GoogleRedirectPrefixes {
		if !strings.HasPrefix(uri, p) {
			continue
		}
		rest := uri[len(p):]
		// One opaque path segment: no further path, no query, no fragment.
		if rest == "" || strings.ContainsAny(rest, "/?#") {
			return false
		}
		return true
	}
	return false
}

// GoogleRegistration is the redirect list dynamic registration stores: the six
// prefixes, so whichever address Gemini names is accepted (design D3).
func GoogleRegistration() []string {
	out := make([]string, len(GoogleRedirectPrefixes))
	copy(out, GoogleRedirectPrefixes)
	return out
}

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
