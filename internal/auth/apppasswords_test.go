package auth

import (
	"context"
	"errors"
	"strings"
	"testing"
)

func TestAppPasswordLifecycle(t *testing.T) {
	ctx := context.Background()
	s, db := newService(t, false)
	owner := mustOwner(t, s)
	p, secret, err := s.CreateAppPassword(ctx, owner.ID, "  iPhone  ")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(secret, AppPasswordPrefix) || p.Name != "iPhone" {
		t.Fatalf("created %+v %q", p, secret)
	}
	// Stored only as a hash.
	if n := countRows(t, db, "SELECT COUNT(*) FROM app_passwords WHERE hash = ?", secret); n != 0 {
		t.Fatal("secret stored in clear")
	}
	u, id, err := s.UserByAppPassword(ctx, " "+strings.ToUpper(owner.Email)+" ", secret)
	if err != nil || u.ID != owner.ID || id != p.ID {
		t.Fatalf("lookup: %v %v", u, err)
	}
	list, err := s.ListAppPasswords(ctx, owner.ID)
	if err != nil || len(list) != 1 || list[0].LastUsedAt == nil || list[0].RevokedAt != nil {
		t.Fatalf("list %+v %v", list, err)
	}
	if _, _, err := s.UserByAppPassword(ctx, "someone@else.org", secret); !errors.Is(err, ErrNotFound) {
		t.Fatal("wrong email accepted")
	}
	if err := s.RevokeAppPassword(ctx, "other-user", p.ID); !errors.Is(err, ErrNotFound) {
		t.Fatal("foreign revoke accepted")
	}
	if err := s.RevokeAppPassword(ctx, owner.ID, p.ID); err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.UserByAppPassword(ctx, owner.Email, secret); !errors.Is(err, ErrNotFound) {
		t.Fatal("revoked password accepted")
	}
	if err := s.RevokeAppPassword(ctx, owner.ID, p.ID); !errors.Is(err, ErrNotFound) {
		t.Fatal("double revoke")
	}
	if n := countRows(t, db, "SELECT COUNT(*) FROM audit_events WHERE name IN ('app_password.created','app_password.revoked')"); n != 2 {
		t.Fatalf("audit events = %d", n)
	}
}

func TestAppPasswordIsNotAnAPIToken(t *testing.T) {
	ctx := context.Background()
	s, _ := newService(t, false)
	owner := mustOwner(t, s)
	_, secret, err := s.CreateAppPassword(ctx, owner.ID, "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.UserByToken(ctx, secret); !errors.Is(err, ErrNotFound) {
		t.Fatal("app password works as an API token")
	}
	_, token, err := s.CreateToken(ctx, owner.ID, "cli")
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.UserByAppPassword(ctx, owner.Email, token); !errors.Is(err, ErrNotFound) {
		t.Fatal("API token works as an app password")
	}
}
