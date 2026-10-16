package auth

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestPublicLinkLifecycle(t *testing.T) {
	s, db := newService(t, false)
	ctx := context.Background()
	owner := mustOwner(t, s)
	now := time.Now()
	s.SetClock(func() time.Time { return now })
	for _, bad := range []struct {
		rights, name string
		days         int
	}{{"edit", "", 0}, {"view", strings.Repeat("x", 61), 0}, {"tick", "", 91}, {"tick", "", -1}} {
		if _, _, err := s.CreatePublicLink(ctx, owner, "p1", bad.rights, bad.name, bad.days); !errors.Is(err, ErrInvalidPublicLink) {
			t.Fatalf("%+v = %v", bad, err)
		}
	}
	l, secret, err := s.CreatePublicLink(ctx, owner, "p1", "tick", "Fridge", 7)
	if err != nil || !strings.HasPrefix(secret, PublicLinkSecretPrefix) || l.ExpiresAt == nil {
		t.Fatalf("create = %+v %q %v", l, secret, err)
	}
	var stored int
	db.QueryRow("SELECT COUNT(*) FROM public_links WHERE token_hash = ?", secret).Scan(&stored)
	if stored != 0 {
		t.Fatal("the secret is stored in clear")
	}
	got, err := s.LookupPublicLink(ctx, secret)
	if err != nil || got.ID != l.ID || got.Rights != "tick" || *got.Name != "Fridge" {
		t.Fatalf("lookup = %+v %v", got, err)
	}
	if list, _ := s.ListPublicLinks(ctx, "p1"); len(list) != 1 {
		t.Fatalf("list = %+v", list)
	}
	// last_used_at at most once a minute.
	s.TouchPublicLink(ctx, l.ID)
	first, _ := s.LookupPublicLink(ctx, secret)
	now = now.Add(30 * time.Second)
	s.TouchPublicLink(ctx, l.ID)
	second, _ := s.LookupPublicLink(ctx, secret)
	if first.LastUsedAt == nil || *second.LastUsedAt != *first.LastUsedAt {
		t.Fatal("touched twice within a minute")
	}
	// Expiry, revocation, wrong project.
	now = now.Add(8 * 24 * time.Hour)
	if _, err := s.LookupPublicLink(ctx, secret); !errors.Is(err, ErrPublicLinkInvalid) {
		t.Fatalf("expired = %v", err)
	}
	l2, secret2, _ := s.CreatePublicLink(ctx, owner, "p1", "view", "", 0)
	if err := s.RevokePublicLink(ctx, owner.ID, "p2", l2.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("other project = %v", err)
	}
	if err := s.RevokePublicLink(ctx, owner.ID, "p1", l2.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.LookupPublicLink(ctx, secret2); !errors.Is(err, ErrPublicLinkInvalid) {
		t.Fatalf("revoked = %v", err)
	}
	if err := s.RevokePublicLink(ctx, owner.ID, "p1", l2.ID); err != nil {
		t.Fatalf("second revoke = %v", err)
	}
	if names, _ := s.PublicLinkNames(ctx, []string{l.ID, l2.ID}); names[l.ID].Name != "Fridge" || names[l2.ID].Name != "" || names[l.ID].ProjectID != "p1" {
		t.Fatalf("names = %v", names)
	}
	var events int
	db.QueryRow("SELECT COUNT(*) FROM audit_events WHERE name IN ('public_link.created','public_link.revoked')").Scan(&events)
	if events != 3 {
		t.Fatalf("audit events = %d", events)
	}
}
