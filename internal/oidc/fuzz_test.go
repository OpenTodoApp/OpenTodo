package oidc_test

import (
	"strings"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/oidc"
	"github.com/OpenTodoApp/opentodo/internal/oidc/oidctest"
)

// FuzzVerifyIDToken feeds arbitrary compact tokens to the ID-token verifier
// (external-security-review, threat model "Authentication and sessions"): it
// must never panic, never return claims with an error, and never accept a
// token that is not a compact JWS or has no subject. The seeds are valid
// tokens for every accepted algorithm, so mutations start from real headers,
// payloads and signatures.
func FuzzVerifyIDToken(f *testing.F) {
	p := oidctest.New(f)
	now := time.Now()
	for _, alg := range []string{"RS256", "PS256", "ES256", "EdDSA"} {
		f.Add(p.Sign(baseClaims(p, now), alg))
	}
	f.Add("eyJhbGciOiJub25lIn0.e30.")
	f.Add("..")
	f.Add("")
	keys := lookup(p)
	o := opts(p, now)
	f.Fuzz(func(t *testing.T, raw string) {
		c, err := oidc.VerifyIDToken(raw, keys, o)
		if err != nil {
			if c != nil {
				t.Fatalf("claims returned with an error: %v", err)
			}
			return
		}
		if c == nil || c.Subject == "" {
			t.Fatalf("accepted without a subject: %q", raw)
		}
		if strings.Count(raw, ".") != 2 {
			t.Fatalf("accepted a token that is not a compact JWS: %q", raw)
		}
	})
}
