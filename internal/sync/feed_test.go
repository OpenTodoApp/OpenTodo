package sync

import (
	"slices"
	"testing"
)

// TestProjectPrefsAreAlwaysPersonalScope (activity-feed D1): a seen marker for a
// shared project lives in its author's personal scope, syncs to the author's
// other devices only, may be written by any member (viewers included) and goes
// away with the project when it is purged.
func TestProjectPrefsAreAlwaysPersonalScope(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	f.add("alice", "carol", RoleViewer)

	if res := f.apply("alice", "A", f.op("project_prefs", "p", "feed_seen_at", `5000`)); res.Applied != 1 || len(res.Rejected) != 0 {
		t.Fatalf("alice mark = %+v", res)
	}
	if res := f.apply("bob", "B1", f.op("project_prefs", "p", "feed_seen_at", `7000`)); res.Applied != 1 || len(res.Rejected) != 0 {
		t.Fatalf("bob mark = %+v", res)
	}
	if res := f.apply("carol", "C1", f.op("project_prefs", "p", "feed_seen_at", `9000`)); res.Applied != 1 || len(res.Rejected) != 0 {
		t.Fatalf("viewer mark refused: %+v", res)
	}

	rows, err := f.s.db.Query(`SELECT scope_id FROM scope_fields WHERE entity = 'project_prefs' AND entity_id = 'p' ORDER BY scope_id`)
	if err != nil {
		t.Fatal(err)
	}
	var scopes []string
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			t.Fatal(err)
		}
		scopes = append(scopes, s)
	}
	rows.Close()
	if want := []string{"user:alice", "user:bob", "user:carol"}; !slices.Equal(scopes, want) {
		t.Fatalf("scopes = %v, want %v", scopes, want)
	}

	prefsOps := func(user, device string) []string {
		ops, _ := f.pullAll(user, device, 0)
		var out []string
		for _, o := range ops {
			if o.Entity == "project_prefs" {
				out = append(out, string(o.Value))
			}
		}
		return out
	}
	// Each user's second device receives their own marker and nobody else's.
	if got := prefsOps("alice", "A2"); !slices.Equal(got, []string{"5000"}) {
		t.Fatalf("alice's other device got %v", got)
	}
	if got := prefsOps("bob", "B2"); !slices.Equal(got, []string{"7000"}) {
		t.Fatalf("bob's other device got %v", got)
	}
	if got := f.field("alice", "project_prefs", "p", "feed_seen_at"); got != "5000" {
		t.Fatalf("alice reads %s", got)
	}
	if got := f.field("bob", "project_prefs", "p", "feed_seen_at"); got != "7000" {
		t.Fatalf("bob reads %s", got)
	}

	// Last writer wins between two of alice's devices: the later mark stays.
	f.apply("alice", "A2", f.op("project_prefs", "p", "feed_seen_at", `8000`))
	if got := f.field("alice", "project_prefs", "p", "feed_seen_at"); got != "8000" {
		t.Fatalf("after second mark alice reads %s", got)
	}

	// Purging the project removes every member's marker; a stale op cannot bring it back.
	f.apply("alice", "A", f.op("project", "p", "deleted_at", `12345`))
	if _, err := f.s.Purge(f.ctx, "alice", "project", []string{"p"}); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := f.s.db.QueryRow(`SELECT COUNT(*) FROM scope_fields WHERE entity = 'project_prefs'`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("%d project_prefs fields survived the purge", n)
	}
	if res := f.apply("bob", "B1", f.op("project_prefs", "p", "feed_seen_at", `99999`)); res.Applied != 0 {
		t.Fatalf("stale mark after purge applied: %+v", res)
	}
}
