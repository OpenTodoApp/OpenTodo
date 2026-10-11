package auth

import (
	"context"
	"errors"
	"testing"
)

// TestSandboxAccountCannotSignInWithPassword: a password-less account
// (demo-sandboxes D1) is refused for every password, including the empty one,
// yet can hold a session issued by the server.
func TestSandboxAccountCannotSignInWithPassword(t *testing.T) {
	ctx := context.Background()
	s, _ := newService(t, false)
	u, err := s.CreatePasswordlessAccount(ctx, "sandbox-abc@demo.invalid", "Alex Demo")
	if err != nil {
		t.Fatal(err)
	}
	if u.Role != "member" {
		t.Fatalf("role = %s", u.Role)
	}
	for _, pw := range []string{"", "opentodo-demo", "correct horse battery staple"} {
		if _, err := s.Authenticate(ctx, u.Email, pw); !errors.Is(err, ErrInvalidCredentials) {
			t.Fatalf("password %q: %v", pw, err)
		}
	}
	if ok, err := s.CheckPassword(ctx, u.ID, ""); err != nil || ok {
		t.Fatalf("CheckPassword: %v %v", ok, err)
	}
	secret, _, err := s.CreateSession(ctx, u.ID, "test")
	if err != nil {
		t.Fatal(err)
	}
	if got, err := s.UserBySession(ctx, secret); err != nil || got.ID != u.ID {
		t.Fatalf("session: %v", err)
	}
	if _, err := s.CreatePasswordlessAccount(ctx, "SANDBOX-abc@demo.invalid", "x"); !errors.Is(err, ErrEmailTaken) {
		t.Fatalf("duplicate: %v", err)
	}
}
