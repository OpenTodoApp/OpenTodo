package mcpoauth

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/OpenTodoApp/opentodo/internal/store/storetest"
)

func challengeOf(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func TestVerifyS256(t *testing.T) {
	verifier := strings.Repeat("aB3-_.~", 9)
	if !VerifyS256(challengeOf(verifier), verifier) {
		t.Fatal("a matching verifier was refused")
	}
	if VerifyS256(challengeOf(verifier), strings.Repeat("zY9-_.~", 9)) {
		t.Fatal("a wrong verifier was accepted")
	}
	// The plain method of RFC 7636 is never accepted (mcp-oauth D4).
	if VerifyS256(verifier, verifier) {
		t.Fatal("the plain challenge method was accepted")
	}
	// A verifier outside 43..128 characters is refused before hashing.
	if VerifyS256(challengeOf("short"), "short") {
		t.Fatal("a short verifier was accepted")
	}
	if VerifyS256(challengeOf(strings.Repeat("a", 129)), strings.Repeat("a", 129)) {
		t.Fatal("an over-long verifier was accepted")
	}
	if !ValidVerifier(strings.Repeat("a", 43)) || ValidVerifier(strings.Repeat("a", 42)) {
		t.Fatal("the 43-character boundary is wrong")
	}
	for _, bad := range []string{strings.Repeat("a", 42) + "!", strings.Repeat("a", 42) + "+", strings.Repeat("a", 42) + "/"} {
		if ValidVerifier(bad) {
			t.Fatalf("%q was accepted", bad)
		}
	}
}

func TestGoogleRedirects(t *testing.T) {
	ok := []string{
		"https://oauth-redirect.googleusercontent.com/r/user_bound_custom-mcp-1-2",
		"https://oauth-redirect.googleusercontent.com/a/user_bound_custom-mcp-1-2",
		"https://oauth-redirect-sandbox.googleusercontent.com/r/user_bound_custom-mcp-1-2",
		"https://oauth-redirect-test.googleusercontent.com/a/user_bound_custom-mcp-1-2",
	}
	for _, u := range ok {
		if !IsGoogleRedirect(u) {
			t.Fatalf("%q was refused", u)
		}
	}
	bad := []string{
		"https://evil.example/cb",
		"https://oauth-redirect.googleusercontent.com.evil.example/r/x",
		"http://oauth-redirect.googleusercontent.com/r/x",
		"https://oauth-redirect.googleusercontent.com/r/",
		"https://oauth-redirect.googleusercontent.com/r/x/y",
		"https://oauth-redirect.googleusercontent.com/r/x?y=1",
		"https://oauth-redirect.googleusercontent.com/b/x",
	}
	for _, u := range bad {
		if IsGoogleRedirect(u) {
			t.Fatalf("%q was accepted", u)
		}
	}
}

func TestAllowsRedirect(t *testing.T) {
	c := Client{RedirectURIs: GoogleRegistration()}
	if !c.AllowsRedirect("https://oauth-redirect.googleusercontent.com/r/user_bound_custom-mcp-9-1") {
		t.Fatal("a Google connector address was refused")
	}
	if c.AllowsRedirect("https://elsewhere.example/cb") {
		t.Fatal("a foreign address was accepted")
	}
	exact := Client{RedirectURIs: []string{"https://app.example/callback"}}
	if !exact.AllowsRedirect("https://app.example/callback") {
		t.Fatal("an exactly registered address was refused")
	}
	if exact.AllowsRedirect("https://app.example/callback/extra") || exact.AllowsRedirect("") {
		t.Fatal("a near-miss was accepted")
	}
}

func TestGrantedScopeLivesInThePackage(t *testing.T) {
	if ValidScope("full") || ValidScope("") {
		t.Fatal("only read and agent are client scopes")
	}
	if !ValidScope(ScopeRead) || !ValidScope(ScopeAgent) {
		t.Fatal("read and agent must be valid")
	}
}

func TestClientNameIsCutOnACharacterBoundary(t *testing.T) {
	db, err := storetest.OpenDir(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	s := New(db)
	c, _, err := s.CreateClient(context.Background(), strings.Repeat("é", 80), GoogleRegistration(), ScopeRead, true, "")
	if err != nil {
		t.Fatal(err)
	}
	if !utf8.ValidString(c.Name) || len(c.Name) > 100 {
		t.Fatalf("name = %q (%d bytes)", c.Name, len(c.Name))
	}
}
