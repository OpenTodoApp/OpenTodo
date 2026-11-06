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
