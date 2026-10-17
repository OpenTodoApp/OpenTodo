package auth

import (
	"context"
	"errors"
	"strings"
	"sync/atomic"
	"testing"
)

// countArgon replaces the key derivation with a counting wrapper for one test.
func countArgon(t *testing.T) *atomic.Int64 {
	t.Helper()
	var n atomic.Int64
	orig := argonKey
	argonKey = func(password, salt []byte, time, memory uint32, threads uint8, keyLen uint32) []byte {
		n.Add(1)
		return orig(password, salt, time, memory, threads, keyLen)
	}
	t.Cleanup(func() { argonKey = orig })
	return &n
}

// TestRegisterChecksPolicyBeforeHashing (SEC-5): a refused registration never
// pays for a password hash.
func TestRegisterChecksPolicyBeforeHashing(t *testing.T) {
	ctx := context.Background()
	s, _ := newService(t, false)
	mustOwner(t, s)
	n := countArgon(t)
	if _, err := s.Register(ctx, "a@example.com", "A", "correct horse battery", ""); !errors.Is(err, ErrSignupClosed) {
		t.Fatalf("closed sign-up: %v", err)
	}
	if _, err := s.Register(ctx, "a@example.com", "A", "correct horse battery", "oti_unknown"); !errors.Is(err, ErrInvitationInvalid) {
		t.Fatalf("unknown invitation: %v", err)
	}
	if _, _, _, err := s.RegisterWithProjectInvite(ctx, "a@example.com", "A", "correct horse battery", "otp_unknown", true, nil); !errors.Is(err, ErrInvitationInvalid) {
		t.Fatalf("unknown project invite: %v", err)
	}
	if err := s.ResetPassword(ctx, "otr_unknown", "correct horse battery"); !errors.Is(err, ErrResetInvalid) {
		t.Fatalf("unknown reset: %v", err)
	}
	if got := n.Load(); got != 0 {
		t.Fatalf("refused requests derived %d password hashes, want 0", got)
	}
}

// TestRegisterSetupTokenBeforeHashing (SEC-5): a wrong setup token is refused
// before hashing.
func TestRegisterSetupTokenBeforeHashing(t *testing.T) {
	s, _ := newService(t, false)
	s.SetSetupToken("the-token")
	n := countArgon(t)
	if _, err := s.RegisterWithSetupToken(context.Background(), "o@example.com", "O", "correct horse battery", "", "wrong"); !errors.Is(err, ErrSetupTokenInvalid) {
		t.Fatalf("err = %v", err)
	}
	if got := n.Load(); got != 0 {
		t.Fatalf("derived %d hashes, want 0", got)
	}
}

// TestLoginRefusesOverlongPassword (SEC-5): sign-in refuses a password over
// the length a password may be set to, without hashing it, for known and
// unknown accounts alike.
func TestLoginRefusesOverlongPassword(t *testing.T) {
	ctx := context.Background()
	s, _ := newService(t, false)
	mustOwner(t, s)
	n := countArgon(t)
	long := strings.Repeat("x", MaxPasswordLength+1)
	for _, email := range []string{"owner@example.com", "nobody@example.com"} {
		if _, err := s.Authenticate(ctx, email, long); !errors.Is(err, ErrInvalidCredentials) {
			t.Fatalf("%s: %v", email, err)
		}
	}
	if got := n.Load(); got != 0 {
		t.Fatalf("derived %d hashes for over-long passwords, want 0", got)
	}
	if err := CheckPasswordPolicy(long); err == nil {
		t.Fatal("policy accepts an over-long password")
	}
}

// TestPasswordlessAccountBurnsHash (SEC-15): an account without a usable
// password costs the same hash as one with a password, so timing does not
// reveal it.
func TestPasswordlessAccountBurnsHash(t *testing.T) {
	ctx := context.Background()
	s, _ := newService(t, false)
	u, err := s.CreatePasswordlessAccount(ctx, "sso@example.com", "SSO")
	if err != nil {
		t.Fatal(err)
	}
	n := countArgon(t)
	if _, err := s.Authenticate(ctx, "sso@example.com", "correct horse battery"); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("err = %v", err)
	}
	if got := n.Load(); got != 1 {
		t.Fatalf("passwordless sign-in derived %d hashes, want 1", got)
	}
	if ok, err := s.CheckPassword(ctx, u.ID, "correct horse battery"); err != nil || ok {
		t.Fatalf("CheckPassword: %v %v", ok, err)
	}
	if got := n.Load(); got != 2 {
		t.Fatalf("re-authentication derived %d hashes in total, want 2", got)
	}
}
