package auth

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestSignupVerification(t *testing.T) {
	s, db := newService(t, true)
	ctx := context.Background()
	owner := mustOwner(t, s)
	now := time.Now()
	s.SetClock(func() time.Time { return now })

	first, existing, err := s.BeginSignup(ctx, "New@Example.com", "New", "a long enough password", "de")
	if err != nil || existing {
		t.Fatalf("begin = %v %v", existing, err)
	}
	// A second registration replaces the first: the earlier token dies.
	second, _, err := s.BeginSignup(ctx, "new@example.com", "New", "another long password", "de")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.PreviewSignup(ctx, first); !errors.Is(err, ErrVerificationInvalid) {
		t.Fatalf("replaced token = %v", err)
	}
	var n int
	db.QueryRow("SELECT COUNT(*) FROM signup_verifications").Scan(&n)
	if n != 1 {
		t.Fatalf("pending rows = %d", n)
	}
	p, err := s.PreviewSignup(ctx, second)
	if err != nil || p.Email != "new@example.com" {
		t.Fatalf("preview = %+v %v", p, err)
	}
	// No account until the token is used.
	db.QueryRow("SELECT COUNT(*) FROM users WHERE email = 'new@example.com'").Scan(&n)
	if n != 0 {
		t.Fatal("account created before verification")
	}
	u, err := s.CompleteSignup(ctx, second)
	if err != nil || u.Role != "member" || u.Name != "New" {
		t.Fatalf("complete = %+v %v", u, err)
	}
	if _, err := s.Authenticate(ctx, "new@example.com", "another long password"); err != nil {
		t.Fatalf("sign in with the stored password: %v", err)
	}
	if _, err := s.CompleteSignup(ctx, second); !errors.Is(err, ErrVerificationInvalid) {
		t.Fatalf("used token = %v", err)
	}
	// An address with an account stores nothing.
	if sec, existing, err := s.BeginSignup(ctx, owner.Email, "", "a long enough password", "en"); err != nil || !existing || sec != "" {
		t.Fatalf("existing = %q %v %v", sec, existing, err)
	}
	// Expiry, then pruning.
	old, _, _ := s.BeginSignup(ctx, "late@example.com", "", "a long enough password", "en")
	now = now.Add(SignupTTL + time.Minute)
	if _, err := s.CompleteSignup(ctx, old); !errors.Is(err, ErrVerificationInvalid) {
		t.Fatalf("expired = %v", err)
	}
	if n, err := s.PruneSignups(ctx); err != nil || n != 1 {
		t.Fatalf("pruned = %d %v", n, err)
	}
}

func TestSignupPolicyChangedAndInvitationRace(t *testing.T) {
	s, db := newService(t, true)
	ctx := context.Background()
	owner := mustOwner(t, s)
	tok, _, err := s.BeginSignup(ctx, "race@example.com", "", "a long enough password", "en")
	if err != nil {
		t.Fatal(err)
	}
	// An invitation creates the account first.
	_, secret, err := s.CreateInvitation(ctx, owner, "race@example.com", 0)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.Register(ctx, "race@example.com", "", "invited password 1", secret); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CompleteSignup(ctx, tok); !errors.Is(err, ErrEmailTaken) {
		t.Fatalf("race = %v", err)
	}
	var n int
	db.QueryRow("SELECT COUNT(*) FROM signup_verifications").Scan(&n)
	if n != 0 {
		t.Fatal("pending row kept after email_taken")
	}
	// Open sign-up turned off before the link is used (a restart with the setting off).
	tok, _, _ = s.BeginSignup(ctx, "closed@example.com", "", "a long enough password", "en")
	closed := NewService(db, time.Hour, false)
	if _, err := closed.CompleteSignup(ctx, tok); !errors.Is(err, ErrSignupClosed) {
		t.Fatalf("closed = %v", err)
	}
	if _, err := s.PreviewSignup(ctx, tok); !errors.Is(err, ErrVerificationInvalid) {
		t.Fatalf("discarded token = %v", err)
	}
}
