package auth_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/store"
	"github.com/pixari/opentodo/internal/webauthn"
	"github.com/pixari/opentodo/internal/webauthn/testauth"
)

const (
	rpID   = "todo.example.com"
	origin = "https://todo.example.com"
)

func newService(t *testing.T) (*auth.Service, *auth.User) {
	t.Helper()
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	s := auth.NewService(db, time.Hour, true)
	s.ConfigurePasskeys(rpID, origin)
	u, err := s.Register(context.Background(), "owner@example.com", "Owner", "correct horse battery")
	if err != nil {
		t.Fatal(err)
	}
	return s, u
}

// register runs a full registration ceremony with the synthetic authenticator.
func register(t *testing.T, s *auth.Service, u *auth.User, a *testauth.Authenticator, name string) *auth.Passkey {
	t.Helper()
	opts, err := s.BeginPasskeyRegistration(context.Background(), u)
	if err != nil {
		t.Fatal(err)
	}
	challenge, _ := webauthn.DecodeBase64URL(opts.Challenge)
	cd, att := a.Register(t, rpID, origin, challenge)
	p, err := s.FinishPasskeyRegistration(context.Background(), u.ID, name, webauthn.RegistrationResponse{ClientDataJSON: cd, AttestationObject: att})
	if err != nil {
		t.Fatal(err)
	}
	return p
}

// login runs a full sign-in ceremony and returns the service's verdict.
func login(t *testing.T, s *auth.Service, a *testauth.Authenticator) (*auth.User, error) {
	t.Helper()
	opts, err := s.BeginPasskeyLogin(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	challenge, _ := webauthn.DecodeBase64URL(opts.Challenge)
	cd, ad, sig := a.Assert(t, rpID, origin, challenge)
	return s.FinishPasskeyLogin(context.Background(), a.CredentialID, webauthn.AssertionResponse{ClientDataJSON: cd, AuthenticatorData: ad, Signature: sig})
}

func TestPasskeyRegisterAndLogin(t *testing.T) {
	s, u := newService(t)
	ctx := context.Background()

	opts, err := s.BeginPasskeyRegistration(ctx, u)
	if err != nil {
		t.Fatal(err)
	}
	if opts.RP["id"] != rpID || opts.User["name"] != u.Email || opts.Attestation != "none" || opts.AuthenticatorSelection["residentKey"] != "required" || len(opts.ExcludeCredentials) != 0 {
		t.Fatalf("options = %+v", opts)
	}

	phone := testauth.New(t, webauthn.AlgES256)
	p1 := register(t, s, u, phone, "  Phone ")
	if p1.Name != "Phone" || p1.LastUsedAt != nil || p1.SuspiciousAt != nil {
		t.Fatalf("passkey = %+v", p1)
	}
	laptop := testauth.New(t, webauthn.AlgEdDSA)
	p2 := register(t, s, u, laptop, "Work laptop")

	list, err := s.ListPasskeys(ctx, u.ID)
	if err != nil || len(list) != 2 {
		t.Fatalf("list = %v, %v", list, err)
	}
	opts, _ = s.BeginPasskeyRegistration(ctx, u)
	if len(opts.ExcludeCredentials) != 2 {
		t.Fatalf("excludeCredentials = %v", opts.ExcludeCredentials)
	}

	// Sign in with each, last-use time is recorded.
	for _, a := range []*testauth.Authenticator{phone, laptop} {
		got, err := login(t, s, a)
		if err != nil || got.ID != u.ID {
			t.Fatalf("login: %v, %v", got, err)
		}
	}
	list, _ = s.ListPasskeys(ctx, u.ID)
	for _, p := range list {
		if p.LastUsedAt == nil {
			t.Fatalf("last use not recorded for %s", p.Name)
		}
	}

	// Rename and foreign ids.
	renamed, err := s.RenamePasskey(ctx, u.ID, p2.ID, "Desk")
	if err != nil || renamed.Name != "Desk" {
		t.Fatalf("rename = %v, %v", renamed, err)
	}
	if _, err := s.RenamePasskey(ctx, "someone-else", p2.ID, "Hijack"); !errors.Is(err, auth.ErrNotFound) {
		t.Fatalf("foreign rename err = %v", err)
	}
	if _, err := s.RenamePasskey(ctx, u.ID, p2.ID, "  "); !errors.Is(err, auth.ErrInvalidInput) {
		t.Fatalf("empty rename err = %v", err)
	}
	if err := s.DeletePasskey(ctx, "someone-else", p1.ID); !errors.Is(err, auth.ErrNotFound) {
		t.Fatalf("foreign delete err = %v", err)
	}

	// Password still works with passkeys registered.
	if _, err := s.Authenticate(ctx, u.Email, "correct horse battery"); err != nil {
		t.Fatalf("password fallback: %v", err)
	}

	// Registering the same credential twice is refused.
	opts, _ = s.BeginPasskeyRegistration(ctx, u)
	challenge, _ := webauthn.DecodeBase64URL(opts.Challenge)
	cd, att := phone.Register(t, rpID, origin, challenge)
	if _, err := s.FinishPasskeyRegistration(ctx, u.ID, "dup", webauthn.RegistrationResponse{ClientDataJSON: cd, AttestationObject: att}); !errors.Is(err, auth.ErrInvalidInput) {
		t.Fatalf("duplicate credential err = %v", err)
	}
}

func TestPasskeyChallengeBinding(t *testing.T) {
	s, u := newService(t)
	ctx := context.Background()
	other, err := s.Register(ctx, "other@example.com", "", "another long password")
	if err != nil {
		t.Fatal(err)
	}
	a := testauth.New(t, webauthn.AlgES256)

	// A challenge issued to another account is refused and nothing is stored.
	opts, _ := s.BeginPasskeyRegistration(ctx, other)
	challenge, _ := webauthn.DecodeBase64URL(opts.Challenge)
	cd, att := a.Register(t, rpID, origin, challenge)
	if _, err := s.FinishPasskeyRegistration(ctx, u.ID, "x", webauthn.RegistrationResponse{ClientDataJSON: cd, AttestationObject: att}); !errors.Is(err, auth.ErrChallengeInvalid) {
		t.Fatalf("foreign challenge err = %v", err)
	}
	// ...and it is burnt for the rightful owner too.
	if _, err := s.FinishPasskeyRegistration(ctx, other.ID, "x", webauthn.RegistrationResponse{ClientDataJSON: cd, AttestationObject: att}); !errors.Is(err, auth.ErrChallengeInvalid) {
		t.Fatalf("burnt challenge err = %v", err)
	}
	// A made-up challenge is refused.
	cd, att = a.Register(t, rpID, origin, []byte("not issued by the server!!!!!!!!"))
	if _, err := s.FinishPasskeyRegistration(ctx, u.ID, "x", webauthn.RegistrationResponse{ClientDataJSON: cd, AttestationObject: att}); !errors.Is(err, auth.ErrChallengeInvalid) {
		t.Fatalf("unknown challenge err = %v", err)
	}
	// Wrong origin is invalid input, and the challenge is consumed.
	opts, _ = s.BeginPasskeyRegistration(ctx, u)
	challenge, _ = webauthn.DecodeBase64URL(opts.Challenge)
	cd, att = a.Register(t, rpID, "https://evil.example", challenge)
	if _, err := s.FinishPasskeyRegistration(ctx, u.ID, "x", webauthn.RegistrationResponse{ClientDataJSON: cd, AttestationObject: att}); !errors.Is(err, auth.ErrInvalidInput) {
		t.Fatalf("wrong origin err = %v", err)
	}
	// A sign-in challenge cannot finish a registration and vice versa.
	lo, _ := s.BeginPasskeyLogin(ctx)
	challenge, _ = webauthn.DecodeBase64URL(lo.Challenge)
	cd, att = a.Register(t, rpID, origin, challenge)
	if _, err := s.FinishPasskeyRegistration(ctx, u.ID, "x", webauthn.RegistrationResponse{ClientDataJSON: cd, AttestationObject: att}); !errors.Is(err, auth.ErrChallengeInvalid) {
		t.Fatalf("login challenge for registration err = %v", err)
	}
	list, _ := s.ListPasskeys(ctx, u.ID)
	if len(list) != 0 {
		t.Fatalf("something was stored: %v", list)
	}
	if _, err := s.FinishPasskeyLogin(ctx, a.CredentialID, webauthn.AssertionResponse{ClientDataJSON: []byte("nope")}); !errors.Is(err, auth.ErrInvalidInput) {
		t.Fatalf("garbage client data err = %v", err)
	}
}

func TestPasskeyCounterRegressionFlags(t *testing.T) {
	s, u := newService(t)
	ctx := context.Background()
	key := testauth.New(t, webauthn.AlgES256)
	key.Counter = 10
	p := register(t, s, u, key, "Security key")

	if _, err := login(t, s, key); err != nil { // counter 11
		t.Fatal(err)
	}
	// A clone replays an older counter value.
	key.Counter = 3
	if _, err := login(t, s, key); !errors.Is(err, auth.ErrInvalidCredentials) { // counter 4 <= 11
		t.Fatalf("regressed counter err = %v", err)
	}
	list, _ := s.ListPasskeys(ctx, u.ID)
	if list[0].ID != p.ID || list[0].SuspiciousAt == nil {
		t.Fatalf("passkey not flagged: %+v", list[0])
	}
	// An equal counter is a regression too.
	key.Counter = 10
	if _, err := login(t, s, key); !errors.Is(err, auth.ErrInvalidCredentials) { // 11 <= 11
		t.Fatalf("equal counter err = %v", err)
	}
	// Moving forward works again; the flag stays until the user reviews it.
	key.Counter = 20
	if _, err := login(t, s, key); err != nil {
		t.Fatalf("advanced counter: %v", err)
	}

	// Authenticators that always report zero (synced passkeys) skip the check.
	synced := testauth.New(t, webauthn.AlgEdDSA)
	register(t, s, u, synced, "iCloud")
	for i := 0; i < 3; i++ {
		synced.Counter = 0xFFFFFFFF // Assert increments to 0
		if _, err := login(t, s, synced); err != nil {
			t.Fatalf("zero counter sign-in %d: %v", i, err)
		}
	}
}

func TestDeletedPasskeyCannotLogin(t *testing.T) {
	s, u := newService(t)
	ctx := context.Background()
	a := testauth.New(t, webauthn.AlgRS256)
	p := register(t, s, u, a, "Laptop")
	if _, err := login(t, s, a); err != nil {
		t.Fatal(err)
	}
	if err := s.DeletePasskey(ctx, u.ID, p.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := login(t, s, a); !errors.Is(err, auth.ErrInvalidCredentials) {
		t.Fatalf("deleted passkey err = %v", err)
	}
	if err := s.DeletePasskey(ctx, u.ID, p.ID); !errors.Is(err, auth.ErrNotFound) {
		t.Fatalf("second delete err = %v", err)
	}
	// Unknown credential ids read the same as revoked ones.
	stranger := testauth.New(t, webauthn.AlgES256)
	if _, err := login(t, s, stranger); !errors.Is(err, auth.ErrInvalidCredentials) {
		t.Fatalf("unknown credential err = %v", err)
	}
	// Password still works.
	if _, err := s.Authenticate(ctx, u.Email, "correct horse battery"); err != nil {
		t.Fatal(err)
	}
}

func TestPasskeysUnavailableWithoutRelyingParty(t *testing.T) {
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	s := auth.NewService(db, time.Hour, false)
	u, _ := s.Register(context.Background(), "o@example.com", "", "correct horse battery")
	if s.PasskeysAvailable() {
		t.Fatal("available without configuration")
	}
	if _, err := s.BeginPasskeyRegistration(context.Background(), u); !errors.Is(err, auth.ErrPasskeysUnavailable) {
		t.Fatalf("begin registration err = %v", err)
	}
	if _, err := s.BeginPasskeyLogin(context.Background()); !errors.Is(err, auth.ErrPasskeysUnavailable) {
		t.Fatalf("begin login err = %v", err)
	}
	if _, err := s.FinishPasskeyLogin(context.Background(), nil, webauthn.AssertionResponse{}); !errors.Is(err, auth.ErrPasskeysUnavailable) {
		t.Fatalf("finish login err = %v", err)
	}
}
