package auth

import (
	"context"
	"errors"
	"testing"
)

const testIssuer = "https://sso.example.com"

func ext(sub, email string, verified bool) ExternalIdentity {
	return ExternalIdentity{Issuer: testIssuer, Subject: sub, Email: email, EmailVerified: verified, Name: "Someone"}
}

func TestOIDCSubjectFirstMatching(t *testing.T) {
	ctx := context.Background()
	s, db := newService(t, false)
	owner := mustOwner(t, s)

	// First time: the verified email links the identity to the owner.
	u, created, linked, err := s.MatchOrProvision(ctx, ext("sub-owner", "OWNER@example.com", true), false, "Home SSO")
	if err != nil || u.ID != owner.ID || created || !linked {
		t.Fatalf("first sign-in = %+v created=%v linked=%v err=%v", u, created, linked, err)
	}
	if n := countRows(t, db, "SELECT COUNT(*) FROM audit_events WHERE name = 'identity.linked' AND actor_id = ?", owner.ID); n != 1 {
		t.Fatalf("identity.linked events = %d", n)
	}
	// The email changes at the provider (even to another account's email, even
	// unverified): the subject still signs in to the same account.
	if _, err := db.Exec("INSERT INTO users(id,email,password_hash,created_at) VALUES('v1','victim@example.com','x',1)"); err != nil {
		t.Fatal(err)
	}
	u, _, linked, err = s.MatchOrProvision(ctx, ext("sub-owner", "victim@example.com", false), false, "Home SSO")
	if err != nil || u.ID != owner.ID || linked {
		t.Fatalf("returning identity = %+v linked=%v err=%v", u, linked, err)
	}
	// A different subject presenting the victim's verified email links to the
	// victim only through the email rule, never to the owner.
	u, _, _, err = s.MatchOrProvision(ctx, ext("sub-v", "victim@example.com", true), false, "Home SSO")
	if err != nil || u.ID != "v1" {
		t.Fatalf("victim match = %+v %v", u, err)
	}
	list, err := s.ListIdentities(ctx, owner.ID)
	if err != nil || len(list) != 1 || list[0].Email != "victim@example.com" || list[0].LastLoginAt == nil {
		t.Fatalf("owner identities = %+v %v", list, err)
	}
	// Linking an identity that belongs to someone else is refused.
	if _, err := s.LinkIdentity(ctx, owner.ID, ext("sub-v", "", false), "Home SSO"); !errors.Is(err, ErrIdentityTaken) {
		t.Fatalf("link taken identity: %v", err)
	}
	if already, err := s.LinkIdentity(ctx, owner.ID, ext("sub-owner", "", false), "Home SSO"); err != nil || !already {
		t.Fatalf("relink own identity = %v %v", already, err)
	}
	if already, err := s.LinkIdentity(ctx, owner.ID, ext("sub-owner-2", "", false), "Home SSO"); err != nil || already {
		t.Fatalf("link second identity = %v %v", already, err)
	}
}

func TestOIDCUnverifiedEmailNeverLinks(t *testing.T) {
	ctx := context.Background()
	s, db := newService(t, true) // open sign-up: even provisioning needs a verified email
	owner := mustOwner(t, s)
	for _, id := range []ExternalIdentity{ext("x1", owner.Email, false), ext("x2", "", true), ext("x3", "", false), ext("x4", "not-an-email", true)} {
		if _, _, _, err := s.MatchOrProvision(ctx, id, true, "SSO"); !errors.Is(err, ErrEmailUnverified) {
			t.Fatalf("%+v: err = %v, want ErrEmailUnverified", id, err)
		}
	}
	if n := countRows(t, db, "SELECT COUNT(*) FROM identities"); n != 0 {
		t.Fatalf("identities = %d", n)
	}
	if n := countRows(t, db, "SELECT COUNT(*) FROM users"); n != 1 {
		t.Fatalf("users = %d", n)
	}
}

func TestOIDCProvisionRespectsPolicy(t *testing.T) {
	ctx := context.Background()
	// Closed sign-up, toggle off: refused like a closed registration.
	s, db := newService(t, false)
	mustOwner(t, s)
	if _, _, _, err := s.MatchOrProvision(ctx, ext("n1", "new@example.com", true), false, "SSO"); !errors.Is(err, ErrSignupClosed) {
		t.Fatalf("closed: %v", err)
	}
	if n := countRows(t, db, "SELECT COUNT(*) FROM users"); n != 1 {
		t.Fatalf("users after refusal = %d", n)
	}
	// Owner toggle on: a member without a password is created and linked.
	u, created, linked, err := s.MatchOrProvision(ctx, ext("n1", "New@Example.com", true), true, "SSO")
	if err != nil || !created || !linked || u.Role != "member" || u.Email != "new@example.com" || u.Name != "Someone" {
		t.Fatalf("provisioned = %+v %v %v %v", u, created, linked, err)
	}
	if ok, _ := s.CheckPassword(ctx, u.ID, ""); ok {
		t.Fatal("empty password verifies for a provisioned account")
	}
	if _, err := s.Authenticate(ctx, "new@example.com", ""); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("password sign-in of provisioned account: %v", err)
	}
	// Open sign-up alone also allows it.
	s2, _ := newService(t, true)
	mustOwner(t, s2)
	if _, created, _, err := s2.MatchOrProvision(ctx, ext("n2", "open@example.com", true), false, "SSO"); err != nil || !created {
		t.Fatalf("open sign-up provisioning = %v %v", created, err)
	}
}

func TestSSOOnlyExemptsOwnerAndTokens(t *testing.T) {
	ctx := context.Background()
	s, db := newService(t, false)
	owner := mustOwner(t, s)
	member := &User{ID: "m1", Role: "member"}
	if !s.LocalLoginAllowed(ctx, member) {
		t.Fatal("local sign-in refused without SSO-only")
	}
	on := true
	s.SetSSOOnly(func(context.Context) bool { return on })
	if s.LocalLoginAllowed(ctx, member) {
		t.Fatal("member local sign-in allowed in SSO-only mode")
	}
	if !s.LocalLoginAllowed(ctx, owner) {
		t.Fatal("owner break-glass refused")
	}
	// Bearer tokens are resolved without the check.
	if _, err := db.Exec("INSERT INTO users(id,email,password_hash,role,created_at) VALUES('m1','m@example.com','',  'member',1)"); err != nil {
		t.Fatal(err)
	}
	_, plain, err := s.CreateToken(ctx, "m1", "script")
	if err != nil {
		t.Fatal(err)
	}
	if u, err := s.UserByToken(ctx, plain); err != nil || u.ID != "m1" {
		t.Fatalf("token in SSO-only mode = %+v %v", u, err)
	}
	on = false
	if !s.LocalLoginAllowed(ctx, member) {
		t.Fatal("member refused after SSO-only off")
	}
}

func TestUnlinkRules(t *testing.T) {
	ctx := context.Background()
	s, _ := newService(t, false)
	owner := mustOwner(t, s)
	sso := false
	s.SetSSOOnly(func(context.Context) bool { return sso })
	// A provisioned member: one identity, no password.
	m, _, _, err := s.MatchOrProvision(ctx, ext("m", "m@example.com", true), true, "SSO")
	if err != nil {
		t.Fatal(err)
	}
	ids, _ := s.ListIdentities(ctx, m.ID)
	if err := s.UnlinkIdentity(ctx, m, ids[0].ID, true, "SSO"); !errors.Is(err, ErrLastCredential) {
		t.Fatalf("unlink only credential: %v", err)
	}
	// The owner has a password: unlinking is fine outside SSO-only and, as
	// break-glass, inside it too.
	if _, _, _, err := s.MatchOrProvision(ctx, ext("o", owner.Email, true), false, "SSO"); err != nil {
		t.Fatal(err)
	}
	sso = true
	oids, _ := s.ListIdentities(ctx, owner.ID)
	if err := s.UnlinkIdentity(ctx, owner, oids[0].ID, true, "SSO"); err != nil {
		t.Fatalf("owner unlink: %v", err)
	}
	if err := s.UnlinkIdentity(ctx, owner, "missing", true, "SSO"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown identity: %v", err)
	}
	// A second identity makes the first removable.
	if _, err := s.LinkIdentity(ctx, m.ID, ext("m-2", "", false), "SSO"); err != nil {
		t.Fatal(err)
	}
	if err := s.UnlinkIdentity(ctx, m, ids[0].ID, true, "SSO"); err != nil {
		t.Fatalf("unlink with another identity left: %v", err)
	}
}
