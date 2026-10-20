package host

import (
	"context"
	"net/http"
	"slices"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/config"
)

// TestIssuePollInClosedTenant (multi-tenant-host x issue-import): a poll due in
// a closed tenant is in the "next due" index only while the tenant's owner
// switch is on; the scheduler opens the tenant and runs it.
func TestIssuePollInClosedTenant(t *testing.T) {
	f := newFixture(t, nil)
	ctx := context.Background()
	for _, name := range []string{"alice", "bob"} {
		c := f.client(name)
		c.register(name+"@example.com", f.create(name, config.Limits{}))
		if name == "alice" {
			if code, out := c.do("PUT", "/api/v1/settings/issues", map[string]any{"enabled": true}); code != http.StatusOK {
				t.Fatalf("switch: %d %v", code, out)
			}
		}
		tn, release, err := f.h.pool.acquire(ctx, name)
		if err != nil {
			t.Fatal(err)
		}
		var uid string
		if err := tn.DB.QueryRow(`SELECT id FROM users LIMIT 1`).Scan(&uid); err != nil {
			t.Fatal(err)
		}
		// A connection without a token: its poll stops it, which shows it ran.
		due := f.clock.Now().Add(5 * time.Minute).UnixMilli()
		if _, err := tn.DB.Exec(`INSERT INTO issue_connections(id,user_id,provider,host,interval_seconds,next_poll_at,created_at,updated_at)
			VALUES('c1',?,'github','https://github.com',1800,?,1,1)`, uid, due); err != nil {
			t.Fatal(err)
		}
		release()
		f.h.markDirty(name)
	}
	f.h.tick(ctx)
	f.clock.Advance(11 * time.Minute)
	if n := f.h.pool.sweep(); n != 2 {
		t.Fatalf("swept %d", n)
	}
	idx, _, err := f.h.reg.DueBefore(ctx, f.clock.Now(), 10)
	if err != nil || !slices.Contains(idx["alice"], KindIssues) || slices.Contains(idx["bob"], KindIssues) {
		t.Fatalf("index: %v %v", idx, err)
	}
	f.h.tick(ctx)
	tn, release, err := f.h.pool.acquire(ctx, "alice")
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	var reason string
	_ = tn.DB.QueryRow(`SELECT COALESCE(stopped_reason,'') FROM issue_connections WHERE id = 'c1'`).Scan(&reason)
	if reason != "token_missing" {
		t.Fatalf("the due poll did not run: %q", reason)
	}
}
