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
		if _, _, err := s.CreatePublicLink(ctx, owner, "p1", bad.rights, bad.name, "", bad.days); !errors.Is(err, ErrInvalidPublicLink) {
			t.Fatalf("%+v = %v", bad, err)
		}
	}
	l, secret, err := s.CreatePublicLink(ctx, owner, "p1", "tick", "Fridge", "", 7)
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
	l2, secret2, _ := s.CreatePublicLink(ctx, owner, "p1", "view", "", "board", 0)
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

// public-link-board: a board layout is kept and read back, a list is the
// default, and the secret opens the page after the readable name.
func TestPublicLinkLayoutAndPath(t *testing.T) {
	s, _ := newService(t, false)
	ctx := context.Background()
	owner := mustOwner(t, s)
	if _, _, err := s.CreatePublicLink(ctx, owner, "p1", "view", "", "grid", 0); !errors.Is(err, ErrInvalidPublicLink) {
		t.Fatalf("unknown layout = %v", err)
	}
	board, secret, err := s.CreatePublicLink(ctx, owner, "p1", "view", "Party groceries", "board", 0)
	if err != nil || board.Layout != PublicLayoutBoard || len(secret) != publicLinkSecretLen {
		t.Fatalf("create = %+v %q %v", board, secret, err)
	}
	list, _, _ := s.CreatePublicLink(ctx, owner, "p1", "tick", "", "", 0)
	if list.Layout != PublicLayoutList {
		t.Fatalf("default layout = %q", list.Layout)
	}
	path := PublicLinkPath("Party groceries", secret)
	if path != "/public/party-groceries-"+secret {
		t.Fatalf("path = %q", path)
	}
	for _, token := range []string{secret, "party-groceries-" + secret, "anything-" + secret} {
		got, err := s.LookupPublicLink(ctx, token)
		if err != nil || got.ID != board.ID || got.Layout != PublicLayoutBoard {
			t.Fatalf("lookup %q = %+v %v", token, got, err)
		}
	}
	for _, token := range []string{"party-groceries" + secret, "party-groceries-" + secret[:len(secret)-1], "x-" + secret + "y"} {
		if _, err := s.LookupPublicLink(ctx, token); !errors.Is(err, ErrPublicLinkInvalid) {
			t.Fatalf("lookup %q = %v", token, err)
		}
	}
	links, _ := s.ListPublicLinks(ctx, "p1")
	layouts := map[string]string{}
	for _, l := range links {
		layouts[l.ID] = l.Layout
	}
	if layouts[board.ID] != "board" || layouts[list.ID] != "list" {
		t.Fatalf("listed layouts = %v", layouts)
	}
}

func TestPublicLinkPath(t *testing.T) {
	const secret = "otl_s"
	for name, want := range map[string]string{
		"":                        "/public/otl_s",
		"   ":                     "/public/otl_s",
		"Group chat":              "/public/group-chat-otl_s",
		"  Fridge!! (kitchen) ":   "/public/fridge-kitchen-otl_s",
		"Café 2026":               "/public/caf%C3%A9-2026-otl_s",
		"买菜":                      "/public/%E4%B9%B0%E8%8F%9C-otl_s",
		"🎉":                       "/public/otl_s",
		strings.Repeat("ab ", 30): "/public/" + strings.Repeat("ab-", 13) + "a-otl_s", // 40 characters at most
	} {
		if got := PublicLinkPath(name, secret); got != want {
			t.Errorf("PublicLinkPath(%q) = %q, want %q", name, got, want)
		}
	}
}
