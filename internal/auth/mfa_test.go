package auth

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

// fakeClock is a settable time source for second-factor tests.
type fakeClock struct{ t time.Time }

func (c *fakeClock) now() time.Time          { return c.t }
func (c *fakeClock) advance(d time.Duration) { c.t = c.t.Add(d) }

// enrolled returns a service with an owner who confirmed TOTP, the secret and
// the recovery codes.
func enrolled(t *testing.T) (*Service, *User, *fakeClock, []byte, []string) {
	t.Helper()
	ctx := context.Background()
	s, _ := newService(t, false)
	clk := &fakeClock{t: time.Unix(1_760_000_000, 0)}
	s.SetClock(clk.now)
	u := mustOwner(t, s)
	en, err := s.BeginTOTPEnrollment(ctx, u)
	if err != nil {
		t.Fatal(err)
	}
	secret, err := decodeTOTPSecret(en.Secret)
	if err != nil {
		t.Fatal(err)
	}
	codes, err := s.ConfirmTOTPEnrollment(ctx, u, totpCode(secret, totpStep(clk.t)), "")
	if err != nil {
		t.Fatal(err)
	}
	return s, u, clk, secret, codes
}

func TestTOTPReplayRefused(t *testing.T) {
	ctx := context.Background()
	s, u, clk, secret, _ := enrolled(t)
	// The confirmation code already used the current step.
	if _, err := s.VerifySecondFactor(ctx, u.ID, totpCode(secret, totpStep(clk.t)), false); !errors.Is(err, ErrMFACodeInvalid) {
		t.Fatalf("confirmation code reused: %v", err)
	}
	clk.advance(30 * time.Second)
	code := totpCode(secret, totpStep(clk.t))
	if m, err := s.VerifySecondFactor(ctx, u.ID, code, false); err != nil || m != MFAMethodTOTP {
		t.Fatalf("fresh code: %q %v", m, err)
	}
	// Same code again within its validity window: refused.
	if _, err := s.VerifySecondFactor(ctx, u.ID, code, false); !errors.Is(err, ErrMFACodeInvalid) {
		t.Fatalf("replay accepted: %v", err)
	}
	// An older step that is still inside the tolerance window is refused as well.
	if _, err := s.VerifySecondFactor(ctx, u.ID, totpCode(secret, totpStep(clk.t)-1), false); !errors.Is(err, ErrMFACodeInvalid) {
		t.Fatalf("older step accepted: %v", err)
	}
	var f *MFAFailure
	_, err := s.VerifySecondFactor(ctx, u.ID, "000000", false)
	if !errors.As(err, &f) || f.UserID != u.ID || f.Reason != "wrong_code" || strings.Contains(err.Error(), "000000") {
		t.Fatalf("failure = %#v", err)
	}
}

func TestRecoveryCodesSingleUseAndRegenerate(t *testing.T) {
	ctx := context.Background()
	s, u, _, _, codes := enrolled(t)
	if len(codes) != RecoveryCodeCount {
		t.Fatalf("codes = %d", len(codes))
	}
	seen := map[string]bool{}
	for _, c := range codes {
		if len(c) != RecoveryCodeLength+1 || c[5] != '-' || seen[c] {
			t.Fatalf("code %q", c)
		}
		seen[c] = true
	}
	// Only hashes are stored.
	var n int
	if err := s.db.QueryRow("SELECT COUNT(*) FROM mfa_recovery_codes WHERE code_hash LIKE ?", "%"+strings.ReplaceAll(codes[0], "-", "")+"%").Scan(&n); err != nil || n != 0 {
		t.Fatalf("plaintext stored: %d %v", n, err)
	}
	st, err := s.MFAStatusFor(ctx, u, true)
	if err != nil || !st.Enrolled || st.RecoveryCodesRemaining != 10 {
		t.Fatalf("status = %+v %v", st, err)
	}
	// Lower case and without the dash still works, once.
	typed := strings.ToLower(strings.ReplaceAll(codes[0], "-", ""))
	if m, err := s.VerifySecondFactor(ctx, u.ID, typed, true); err != nil || m != "recovery_code" {
		t.Fatalf("first use: %q %v", m, err)
	}
	if _, err := s.VerifySecondFactor(ctx, u.ID, codes[0], true); !errors.Is(err, ErrMFACodeInvalid) {
		t.Fatalf("reuse: %v", err)
	}
	if st, _ := s.MFAStatusFor(ctx, u, true); st.RecoveryCodesRemaining != 9 {
		t.Fatalf("remaining = %d", st.RecoveryCodesRemaining)
	}
	// Regenerate: ten new codes, every earlier one stops working.
	fresh, err := s.RegenerateRecoveryCodes(ctx, u.ID)
	if err != nil || len(fresh) != 10 {
		t.Fatalf("regenerate: %d %v", len(fresh), err)
	}
	if _, err := s.VerifySecondFactor(ctx, u.ID, codes[1], true); !errors.Is(err, ErrMFACodeInvalid) {
		t.Fatalf("old code after regenerate: %v", err)
	}
	if _, err := s.VerifySecondFactor(ctx, u.ID, fresh[3], true); err != nil {
		t.Fatalf("new code: %v", err)
	}
	// Not enrolled: nothing to regenerate.
	other, err := s.Register(ctx, "m@example.com", "", "member long password", "")
	if err == nil {
		if _, err := s.RegenerateRecoveryCodes(ctx, other.ID); !errors.Is(err, ErrMFANotEnrolled) {
			t.Fatalf("regenerate unenrolled: %v", err)
		}
	}
}

func TestEnrolmentRules(t *testing.T) {
	ctx := context.Background()
	s, _ := newService(t, false)
	clk := &fakeClock{t: time.Unix(1_760_000_000, 0)}
	s.SetClock(clk.now)
	u := mustOwner(t, s)
	en, err := s.BeginTOTPEnrollment(ctx, u)
	if err != nil {
		t.Fatal(err)
	}
	secret, _ := decodeTOTPSecret(en.Secret)
	// Wrong code: still unprotected.
	if _, err := s.ConfirmTOTPEnrollment(ctx, u, "123456", ""); !errors.Is(err, ErrMFACodeInvalid) {
		t.Fatalf("wrong code: %v", err)
	}
	// Stale pending secret.
	clk.advance(EnrollmentTTL + time.Second)
	if _, err := s.ConfirmTOTPEnrollment(ctx, u, totpCode(secret, totpStep(clk.t)), ""); !errors.Is(err, ErrMFACodeInvalid) {
		t.Fatalf("stale enrolment: %v", err)
	}
	if ok, _ := s.HasConfirmedTOTP(ctx, u.ID); ok {
		t.Fatal("enrolled after failures")
	}
	// A new enrolment replaces the pending secret.
	en, _ = s.BeginTOTPEnrollment(ctx, u)
	secret, _ = decodeTOTPSecret(en.Secret)
	if _, err := s.ConfirmTOTPEnrollment(ctx, u, totpCode(secret, totpStep(clk.t)), ""); err != nil {
		t.Fatal(err)
	}
	if _, err := s.BeginTOTPEnrollment(ctx, u); !errors.Is(err, ErrMFAAlreadyEnrolled) {
		t.Fatalf("second enrol: %v", err)
	}
}

func TestLoginChallengeAttempts(t *testing.T) {
	ctx := context.Background()
	s, u, clk, secret, _ := enrolled(t)
	ch := s.StartMFAChallenge(u.ID, "password")
	for i := 0; i < LoginChallengeAttempts; i++ {
		if _, _, err := s.CompleteMFAChallenge(ctx, ch, "000000", false); !errors.Is(err, ErrMFACodeInvalid) {
			t.Fatalf("attempt %d: %v", i+1, err)
		}
	}
	clk.advance(30 * time.Second)
	if _, _, err := s.CompleteMFAChallenge(ctx, ch, totpCode(secret, totpStep(clk.t)), false); !errors.Is(err, ErrMFAChallengeInvalid) {
		t.Fatalf("exhausted challenge: %v", err)
	}
	// Expiry.
	ch = s.StartMFAChallenge(u.ID, "password")
	clk.advance(LoginChallengeTTL + time.Second)
	if _, _, err := s.CompleteMFAChallenge(ctx, ch, totpCode(secret, totpStep(clk.t)), false); !errors.Is(err, ErrMFAChallengeInvalid) {
		t.Fatalf("expired challenge: %v", err)
	}
	// Success consumes the challenge.
	ch = s.StartMFAChallenge(u.ID, "password")
	got, method, err := s.CompleteMFAChallenge(ctx, ch, totpCode(secret, totpStep(clk.t)), false)
	if err != nil || got.ID != u.ID || method != "password+totp" {
		t.Fatalf("complete: %v %q %v", got, method, err)
	}
	if _, _, err := s.CompleteMFAChallenge(ctx, ch, "000000", false); !errors.Is(err, ErrMFAChallengeInvalid) {
		t.Fatalf("reused challenge: %v", err)
	}
}

func TestPolicyAndReset(t *testing.T) {
	ctx := context.Background()
	s, u, _, _, _ := enrolled(t)
	if p, _ := s.MFAPolicy(ctx); p != PolicyNone {
		t.Fatalf("default policy %q", p)
	}
	if _, err := s.SetMFAPolicy(ctx, u.ID, "sometimes"); !errors.Is(err, ErrInvalidPolicy) {
		t.Fatalf("invalid policy: %v", err)
	}
	if _, err := s.SetMFAPolicy(ctx, u.ID, PolicyOwner); err != nil {
		t.Fatal(err)
	}
	if err := s.DisableTOTP(ctx, u); !errors.Is(err, ErrMFARequiredByPolicy) {
		t.Fatalf("disable under policy: %v", err)
	}
	secret, _, err := s.CreateTrustedDevice(ctx, u.ID, "ua")
	if err != nil {
		t.Fatal(err)
	}
	if err := s.ResetMFA(ctx, "", u.ID); err != nil {
		t.Fatal(err)
	}
	if ok, _ := s.TrustedDeviceValid(ctx, u.ID, secret); ok {
		t.Fatal("trusted device survived reset")
	}
	st, _ := s.MFAStatusFor(ctx, u, true)
	if st.Enrolled || !st.Required || !st.Restricted {
		t.Fatalf("status after reset = %+v", st)
	}
	if err := s.ResetMFA(ctx, u.ID, "nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("reset unknown: %v", err)
	}
}
