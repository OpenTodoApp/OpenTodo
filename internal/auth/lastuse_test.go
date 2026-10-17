package auth

import (
	"context"
	"testing"
	"time"
)

// TestLastUseWrittenAtMostOnceAMinute (SEC-7): resolving a token or an app
// password refreshes its last-use time only when the stored one is a minute old.
func TestLastUseWrittenAtMostOnceAMinute(t *testing.T) {
	ctx := context.Background()
	s, db := newService(t, false)
	owner := mustOwner(t, s)
	tok, plain, err := s.CreateToken(ctx, owner.ID, "cli")
	if err != nil {
		t.Fatal(err)
	}
	ap, secret, err := s.CreateAppPassword(ctx, owner.ID, "phone")
	if err != nil {
		t.Fatal(err)
	}
	check := func(table, id string, resolve func()) {
		t.Helper()
		recent := time.Now().Add(-30 * time.Second).UnixMilli()
		if _, err := db.Exec("UPDATE "+table+" SET last_used_at = ? WHERE id = ?", recent, id); err != nil {
			t.Fatal(err)
		}
		resolve()
		var got int64
		if err := db.QueryRow("SELECT last_used_at FROM "+table+" WHERE id = ?", id).Scan(&got); err != nil {
			t.Fatal(err)
		}
		if got != recent {
			t.Fatalf("%s: last use rewritten within a minute (%d -> %d)", table, recent, got)
		}
		old := time.Now().Add(-2 * time.Minute).UnixMilli()
		if _, err := db.Exec("UPDATE "+table+" SET last_used_at = ? WHERE id = ?", old, id); err != nil {
			t.Fatal(err)
		}
		resolve()
		if err := db.QueryRow("SELECT last_used_at FROM "+table+" WHERE id = ?", id).Scan(&got); err != nil {
			t.Fatal(err)
		}
		if got <= old {
			t.Fatalf("%s: stale last use not refreshed", table)
		}
	}
	check("api_tokens", tok.ID, func() {
		if _, _, err := s.UserByTokenInfo(ctx, plain); err != nil {
			t.Fatal(err)
		}
	})
	check("app_passwords", ap.ID, func() {
		if _, _, err := s.UserByAppPassword(ctx, owner.Email, secret); err != nil {
			t.Fatal(err)
		}
	})
	// A token never used before gets its first time at once.
	_, plain2, err := s.CreateToken(ctx, owner.ID, "new")
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.UserByTokenInfo(ctx, plain2); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := db.QueryRow("SELECT COUNT(*) FROM api_tokens WHERE name = 'new' AND last_used_at IS NOT NULL").Scan(&n); err != nil || n != 1 {
		t.Fatalf("first use not recorded: %d %v", n, err)
	}
}
