package auth

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

// Profile (settings-refresh D10): name, email change and picture version.

func TestSetName(t *testing.T) {
	ctx := context.Background()
	s, db := newService(t, false)
	owner := mustOwner(t, s)
	u, err := s.SetName(ctx, owner.ID, "  Raffaele  ")
	if err != nil || u.Name != "Raffaele" {
		t.Fatalf("SetName = %+v, %v", u, err)
	}
	for _, bad := range []string{"   ", strings.Repeat("x", 81), "a\x07b"} {
		if _, err := s.SetName(ctx, owner.ID, bad); !errors.Is(err, ErrInvalidName) {
			t.Fatalf("SetName(%q) = %v, want ErrInvalidName", bad, err)
		}
	}
	if _, err := s.SetName(ctx, owner.ID, strings.Repeat("è", 80)); err != nil {
		t.Fatalf("80 characters: %v", err)
	}
	if n := countRows(t, db, "SELECT COUNT(*) FROM audit_events WHERE name = 'account.name_changed' AND details NOT LIKE '%Raffaele%'"); n != 2 {
		t.Fatalf("name_changed events = %d", n)
	}
}

func TestEmailChangeByLink(t *testing.T) {
	ctx := context.Background()
	s, db := newService(t, false)
	owner := mustOwner(t, s)
	other := invited(t, s, owner, "taken@example.com")

	if _, _, err := s.RequestEmailChange(ctx, owner, "Taken@Example.com"); !errors.Is(err, ErrEmailTaken) {
		t.Fatalf("taken = %v", err)
	}
	if _, _, err := s.RequestEmailChange(ctx, owner, "not an address"); !errors.Is(err, ErrInvalidEmail) {
		t.Fatalf("invalid = %v", err)
	}
	first, _, err := s.RequestEmailChange(ctx, owner, "first@example.com")
	if err != nil {
		t.Fatal(err)
	}
	secret, email, err := s.RequestEmailChange(ctx, owner, " New@Example.com ")
	if err != nil || email != "new@example.com" {
		t.Fatalf("request = %q, %v", email, err)
	}
	p, err := s.Profile(ctx, owner)
	if err != nil || p.PendingEmail != "new@example.com" {
		t.Fatalf("profile = %+v, %v", p, err)
	}
	// A newer request replaces the earlier link.
	if _, err := s.ConfirmEmailChange(ctx, owner, first); !errors.Is(err, ErrInvalidLink) {
		t.Fatalf("replaced link = %v", err)
	}
	// Another account opening the link is refused.
	if _, err := s.ConfirmEmailChange(ctx, other, secret); !errors.Is(err, ErrForbidden) {
		t.Fatalf("other account = %v", err)
	}
	u, err := s.ConfirmEmailChange(ctx, owner, secret)
	if err != nil || u.Email != "new@example.com" {
		t.Fatalf("confirm = %+v, %v", u, err)
	}
	if _, err := s.Authenticate(ctx, "new@example.com", pw); err != nil {
		t.Fatalf("sign-in with the new address: %v", err)
	}
	if _, err := s.ConfirmEmailChange(ctx, owner, secret); !errors.Is(err, ErrInvalidLink) {
		t.Fatalf("used link = %v", err)
	}
	if p, _ := s.Profile(ctx, owner); p.PendingEmail != "" {
		t.Fatalf("pending after confirm = %q", p.PendingEmail)
	}
	if n := countRows(t, db, "SELECT COUNT(*) FROM audit_events WHERE name IN ('account.email_change_requested','account.email_changed') AND details NOT LIKE '%@%'"); n != 3 {
		t.Fatalf("email events without addresses = %d", n)
	}
	if n := countRows(t, db, "SELECT COUNT(*) FROM audit_events WHERE name LIKE 'account.email%' AND details LIKE '%@%'"); n != 0 {
		t.Fatalf("email events with an address = %d", n)
	}
}

func TestEmailChangeLinkExpires(t *testing.T) {
	ctx := context.Background()
	s, _ := newService(t, false)
	owner := mustOwner(t, s)
	now := time.Now()
	s.SetClock(func() time.Time { return now })
	secret, _, err := s.RequestEmailChange(ctx, owner, "later@example.com")
	if err != nil {
		t.Fatal(err)
	}
	now = now.Add(EmailChangeTTL + time.Second)
	if p, _ := s.Profile(ctx, owner); p.PendingEmail != "" {
		t.Fatalf("expired pending = %q", p.PendingEmail)
	}
	if _, err := s.ConfirmEmailChange(ctx, owner, secret); !errors.Is(err, ErrInvalidLink) {
		t.Fatalf("expired link = %v", err)
	}
}

func TestChangeEmailNowAndSSOOnly(t *testing.T) {
	ctx := context.Background()
	s, db := newService(t, false)
	owner := mustOwner(t, s)
	u, err := s.ChangeEmailNow(ctx, owner, "boss@example.com")
	if err != nil || u.Email != "boss@example.com" {
		t.Fatalf("now = %+v, %v", u, err)
	}
	if _, err := s.ChangeEmailNow(ctx, u, "boss@example.com"); !errors.Is(err, ErrSameEmail) {
		t.Fatalf("same = %v", err)
	}
	// An account provisioned by single sign-on (no password) cannot change it.
	sso, err := s.CreatePasswordlessAccount(ctx, "sso@example.com", "Sso")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec("INSERT INTO identities(id,user_id,issuer,subject,email,created_at) VALUES('i1',?,'https://id.example.com','sub','sso@example.com',1)", sso.ID); err != nil {
		t.Fatal(err)
	}
	p, err := s.Profile(ctx, sso)
	if err != nil || p.EmailManagedBy != "https://id.example.com" {
		t.Fatalf("managed = %+v, %v", p, err)
	}
	if _, err := s.ChangeEmailNow(ctx, sso, "x@example.com"); !errors.Is(err, ErrEmailManaged) {
		t.Fatalf("sso now = %v", err)
	}
	if _, _, err := s.RequestEmailChange(ctx, sso, "x@example.com"); !errors.Is(err, ErrEmailManaged) {
		t.Fatalf("sso link = %v", err)
	}
}

func TestAvatarVersion(t *testing.T) {
	ctx := context.Background()
	s, db := newService(t, false)
	owner := mustOwner(t, s)
	steps := []struct {
		set  bool
		want int
	}{{true, 1}, {true, 2}, {false, 0}, {true, 3}}
	for _, st := range steps {
		v, err := s.BumpAvatar(ctx, owner.ID, st.set)
		if err != nil || v != st.want {
			t.Fatalf("BumpAvatar(%v) = %d, %v; want %d", st.set, v, err, st.want)
		}
		if got, _ := s.AvatarVersion(ctx, owner.ID); got != st.want {
			t.Fatalf("AvatarVersion = %d, want %d", got, st.want)
		}
		if p, _ := s.Profile(ctx, owner); p.AvatarVersion != st.want {
			t.Fatalf("Profile.AvatarVersion = %d, want %d", p.AvatarVersion, st.want)
		}
	}
	if n := countRows(t, db, "SELECT COUNT(*) FROM audit_events WHERE name = 'account.avatar_changed'"); n != 4 {
		t.Fatalf("avatar events = %d", n)
	}
}
