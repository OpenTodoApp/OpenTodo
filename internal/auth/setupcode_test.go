package auth

import (
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/store/storetest"
)

// TestSetupCode (trusted-client-identity): a fresh server without a setup token
// gets a code; a public first registration needs it, a local one does not, and
// the code is discarded once the owner exists.
func TestSetupCode(t *testing.T) {
	db, err := storetest.OpenDir(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	s := NewService(db, time.Hour, false)
	s.SetSetupCodeRequired(true) // OPENTODO_SETUP_CODE=required (auth-hardening D6)
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
	if _, err := s.RegisterFrom(t.Context(), "o@example.com", "", "correct horse battery", "", "", SetupFrom{}); err != ErrSetupCodeInvalid {
		t.Fatalf("public without code: %v", err)
	}
	if _, err := s.RegisterFrom(t.Context(), "o@example.com", "", "correct horse battery", "", "AAAA-AAAA-AAAA-AAAA", SetupFrom{}); err != ErrSetupCodeInvalid {
		t.Fatalf("public with a wrong code: %v", err)
	}
	u, err := s.RegisterFrom(t.Context(), "o@example.com", "", "correct horse battery", "", strings.ToLower(code), SetupFrom{})
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
	db2, _ := storetest.OpenDir(t.TempDir())
	t.Cleanup(func() { db2.Close() })
	local := NewService(db2, time.Hour, false)
	if _, err := local.PrepareSetupCode(t.Context()); err != nil {
		t.Fatal(err)
	}
	if u, err := local.RegisterFrom(t.Context(), "o@example.com", "", "correct horse battery", "", "", SetupFrom{Local: true}); err != nil || u.Role != "owner" {
		t.Fatalf("local: %v %v", u, err)
	}
	db3, _ := storetest.OpenDir(t.TempDir())
	t.Cleanup(func() { db3.Close() })
	tok := NewService(db3, time.Hour, false)
	tok.SetSetupToken("0123456789abcdef-setup")
	if c, _ := tok.PrepareSetupCode(t.Context()); c != "" || tok.SetupCodeRequired() {
		t.Fatalf("code with a token: %q", c)
	}
	if _, err := tok.RegisterFrom(t.Context(), "o@example.com", "", "correct horse battery", "", "0123456789abcdef-setup", SetupFrom{}); err != nil {
		t.Fatalf("token from a public address: %v", err)
	}
}

// TestSetupCodeOffByDefault (auth-hardening D6): without OPENTODO_SETUP_CODE no
// code is generated and a first registration from anywhere needs none; a
// setup token is still required when set, whatever the code setting says.
func TestSetupCodeOffByDefault(t *testing.T) {
	db, err := storetest.OpenDir(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	s := NewService(db, time.Hour, false)
	if code, err := s.PrepareSetupCode(t.Context()); err != nil || code != "" || s.SetupCodeRequired() {
		t.Fatalf("code %q %v required=%v", code, err, s.SetupCodeRequired())
	}
	tok := NewService(db, time.Hour, false)
	tok.SetSetupCodeRequired(true)
	tok.SetSetupToken("a-setup-token-of-some-length")
	if tok.SetupCodeRequired() {
		t.Fatal("a token must replace the code")
	}
	if _, err := tok.RegisterFrom(t.Context(), "o@example.com", "", "correct horse battery", "", "", SetupFrom{}); err != ErrSetupTokenInvalid {
		t.Fatalf("token server without the token: %v", err)
	}
	u, err := s.RegisterFrom(t.Context(), "o@example.com", "", "correct horse battery", "", "", SetupFrom{})
	if err != nil || u.Role != "owner" {
		t.Fatalf("public without a code: %v %v", u, err)
	}
}

// TestSetupHostCheck (host-check-without-base-url): with no base URL and the
// code off, a code is still generated; a first registration addressed to an
// unverified host needs it, even over loopback, while one addressed to a
// verified host needs nothing. A setup token replaces the code.
func TestSetupHostCheck(t *testing.T) {
	newSvc := func() *Service {
		db, err := storetest.OpenDir(t.TempDir())
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { db.Close() })
		s := NewService(db, time.Hour, false)
		s.SetSetupHostCheck(true)
		return s
	}
	s := newSvc()
	code, err := s.PrepareSetupCode(t.Context())
	if err != nil || code == "" || s.SetupCodeRequired() || !s.SetupCodeOnlyForHosts() {
		t.Fatalf("code %q %v required=%v", code, err, s.SetupCodeRequired())
	}
	rebound := SetupFrom{Local: true, UnverifiedHost: true}
	if !s.SetupCodeNeeded(rebound) || s.SetupCodeNeeded(SetupFrom{}) {
		t.Fatal("only the unverified host needs the code")
	}
	if _, err := s.RegisterFrom(t.Context(), "o@example.com", "", "correct horse battery", "", "", rebound); err != ErrSetupHostUnverified {
		t.Fatalf("unverified host without the code: %v", err)
	}
	if u, err := s.RegisterFrom(t.Context(), "o@example.com", "", "correct horse battery", "", code, rebound); err != nil || u.Role != "owner" {
		t.Fatalf("unverified host with the code: %v %v", u, err)
	}

	lan := newSvc()
	if u, err := lan.RegisterFrom(t.Context(), "o@example.com", "", "correct horse battery", "", "", SetupFrom{}); err != nil || u.Role != "owner" {
		t.Fatalf("verified host from the network: %v %v", u, err)
	}

	tok := newSvc()
	tok.SetSetupToken("a-setup-token-of-some-length")
	if c, _ := tok.PrepareSetupCode(t.Context()); c != "" || tok.SetupCodeNeeded(SetupFrom{UnverifiedHost: true}) {
		t.Fatal("a token must replace the code")
	}
	if _, err := tok.RegisterFrom(t.Context(), "o@example.com", "", "correct horse battery", "", "a-setup-token-of-some-length", SetupFrom{UnverifiedHost: true}); err != nil {
		t.Fatalf("token on an unverified host: %v", err)
	}

	on := newSvc()
	on.SetSetupCodeRequired(true)
	if _, err := on.PrepareSetupCode(t.Context()); err != nil {
		t.Fatal(err)
	}
	if _, err := on.RegisterFrom(t.Context(), "o@example.com", "", "correct horse battery", "", "", rebound); err != ErrSetupCodeInvalid {
		t.Fatalf("code on, unverified host over loopback: %v", err)
	}
}
