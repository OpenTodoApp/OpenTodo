package auth

import (
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/store"
)

// TestSetupCode (trusted-client-identity): a fresh server without a setup token
// gets a code; a public first registration needs it, a local one does not, and
// the code is discarded once the owner exists.
func TestSetupCode(t *testing.T) {
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	s := NewService(db, time.Hour, false)
	code, err := s.PrepareSetupCode(t.Context())
	if err != nil || !regexp.MustCompile(`^[A-Z2-7]{4}(-[A-Z2-7]{4}){3}$`).MatchString(code) {
		t.Fatalf("code %q, %v", code, err)
	}
	if again, _ := s.PrepareSetupCode(t.Context()); again != code {
		t.Fatalf("second call changed the code: %q", again)
	}
	if other := NewService(db, time.Hour, false); other.setupCode.matches(code) {
		t.Fatal("codes are not per service")
	}
	if _, err := s.RegisterFrom(t.Context(), "o@example.com", "", "correct horse battery", "", "", false); err != ErrSetupCodeInvalid {
		t.Fatalf("public without code: %v", err)
	}
	if _, err := s.RegisterFrom(t.Context(), "o@example.com", "", "correct horse battery", "", "AAAA-AAAA-AAAA-AAAA", false); err != ErrSetupCodeInvalid {
		t.Fatalf("public with a wrong code: %v", err)
	}
	u, err := s.RegisterFrom(t.Context(), "o@example.com", "", "correct horse battery", "", strings.ToLower(code), false)
	if err != nil || u.Role != "owner" {
		t.Fatalf("public with the code: %v %v", u, err)
	}
	if s.setupCode.matches(code) {
		t.Fatal("code kept after the owner exists")
	}
	if again, _ := s.PrepareSetupCode(t.Context()); again != "" {
		t.Fatalf("code generated with an owner: %q", again)
	}

	// Local clients need no code; a configured token means no code at all.
	db2, _ := store.Open(t.TempDir())
	t.Cleanup(func() { db2.Close() })
	local := NewService(db2, time.Hour, false)
	if _, err := local.PrepareSetupCode(t.Context()); err != nil {
		t.Fatal(err)
	}
	if u, err := local.RegisterFrom(t.Context(), "o@example.com", "", "correct horse battery", "", "", true); err != nil || u.Role != "owner" {
		t.Fatalf("local: %v %v", u, err)
	}
	db3, _ := store.Open(t.TempDir())
	t.Cleanup(func() { db3.Close() })
	tok := NewService(db3, time.Hour, false)
	tok.SetSetupToken("0123456789abcdef-setup")
	if c, _ := tok.PrepareSetupCode(t.Context()); c != "" || tok.SetupCodeRequired() {
		t.Fatalf("code with a token: %q", c)
	}
	if _, err := tok.RegisterFrom(t.Context(), "o@example.com", "", "correct horse battery", "", "0123456789abcdef-setup", false); err != nil {
		t.Fatalf("token from a public address: %v", err)
	}
}
