package sync

import (
	"slices"
	"testing"
)

// TestDeleteAccountData: deleting bob removes his personal scope and the shared
// project he owns (for every member), drops his membership in alice's project
// and keeps the ops he authored there, so the remaining members converge.
func TestDeleteAccountData(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	f.add("alice", "carol", RoleViewer)
	f.apply("bob", "B", f.op("task", "t1", "title", `"Oat milk"`))
	f.apply("bob", "B",
		f.op("task", "mine", "title", `"Bob's"`), f.op("task", "mine", "project_id", `null`),
		f.op("project", "bp", "name", `"Bob's project"`))
	if _, err := f.s.AddMember(f.ctx, "bob", "bp", "carol", RoleEditor); err != nil {
		t.Fatal(err)
	}
	count := func(q string, args ...any) int {
		t.Helper()
		var n int
		if err := f.s.db.QueryRow(q, args...).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	authoredInP := count(`SELECT COUNT(*) FROM ops o JOIN op_scopes s ON s.seq = o.seq WHERE o.user_id = 'bob' AND s.scope_id = 'project:p'`)
	if authoredInP == 0 {
		t.Fatal("fixture: bob authored nothing in p")
	}

	tx, err := f.s.db.BeginTx(f.ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	notify, err := DeleteAccountData(f.ctx, tx, "bob")
	if err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(notify, []string{"alice", "carol"}) {
		t.Fatalf("notify = %v", notify)
	}
	for q, want := range map[string]int{
		`SELECT COUNT(*) FROM scope_fields WHERE scope_id = 'user:bob'`:                                                     0,
		`SELECT COUNT(*) FROM op_scopes WHERE scope_id IN ('user:bob','project:bp')`:                                        0,
		`SELECT COUNT(*) FROM scope_fields WHERE scope_id = 'project:bp'`:                                                   0,
		`SELECT COUNT(*) FROM project_scopes WHERE project_id = 'bp'`:                                                       0,
		`SELECT COUNT(*) FROM project_members WHERE user_id = 'bob' OR project_id = 'bp'`:                                   0,
		`SELECT COUNT(*) FROM ops o JOIN op_scopes s ON s.seq = o.seq WHERE o.user_id = 'bob' AND s.scope_id = 'project:p'`: authoredInP,
		`SELECT COUNT(*) FROM project_members WHERE project_id = 'p'`:                                                       2,
	} {
		if n := count(q); n != want {
			t.Errorf("%s = %d, want %d", q, n, want)
		}
	}
	ms, err := f.s.Memberships(f.ctx, "carol")
	if err != nil || len(ms) != 1 || ms[0].ProjectID != "p" {
		t.Fatalf("carol's memberships = %+v %v", ms, err)
	}
}
