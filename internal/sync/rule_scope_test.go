package sync

import (
	"slices"
	"testing"
)

// Routines of a shared project (OpenSpec change routines-shared, D1 and D2):
// a rule with a project_id is a project child; editors write it, viewers
// read it, the first share relabels it and it never changes scope.
func TestRulesFollowTheirProjectScope(t *testing.T) {
	f := newSharing(t)
	// A routine of alice's project before sharing, and a personal one.
	f.apply("alice", "A", f.op("rule", "r1", "name", `"Weekly chores"`), f.op("rule", "r1", "project_id", `"p"`),
		f.op("rule", "r0", "name", `"Mine"`))
	f.add("alice", "bob", RoleEditor)
	f.add("alice", "carol", RoleViewer)
	var scope string
	if err := f.s.db.QueryRow(`SELECT DISTINCT scope_id FROM scope_fields WHERE entity = 'rule' AND entity_id = 'r1'`).Scan(&scope); err != nil || scope != ProjectScope("p") {
		t.Fatalf("routine scope = %q %v", scope, err)
	}
	if err := f.s.db.QueryRow(`SELECT DISTINCT scope_id FROM scope_fields WHERE entity = 'rule' AND entity_id = 'r0'`).Scan(&scope); err != nil || scope != PersonalScope("alice") {
		t.Fatalf("personal routine scope = %q %v", scope, err)
	}
	if got := f.field("carol", "rule", "r1", "name"); got != `"Weekly chores"` {
		t.Fatalf("viewer sees routine name %s", got)
	}
	if got := f.field("bob", "rule", "r0", "name"); got != "<none>" {
		t.Fatalf("bob sees alice's personal routine: %s", got)
	}
	// An editor creates and edits routines of the project.
	if res := f.apply("bob", "B", f.op("rule", "r2", "name", `"Releases"`), f.op("rule", "r2", "project_id", `"p"`),
		f.op("rule", "r1", "enabled", `true`)); len(res.Rejected) != 0 {
		t.Fatalf("editor rejected: %v", rejectedIDs(res))
	}
	// A viewer cannot turn one on or create one; the device gets the winning value back.
	res := f.apply("carol", "C", f.op("rule", "r1", "enabled", `false`), f.op("rule", "r3", "name", `"New"`), f.op("rule", "r3", "project_id", `"p"`))
	if len(res.Rejected) != 3 || res.Applied != 0 {
		t.Fatalf("viewer result = %v applied %d", rejectedIDs(res), res.Applied)
	}
	if len(res.Restore) != 1 || string(res.Restore[0].Value) != `true` {
		t.Fatalf("restore = %+v", res.Restore)
	}
	// A routine never changes scope.
	moved := f.op("rule", "r2", "project_id", `null`)
	if res := f.apply("bob", "B", moved); !slices.Equal(rejectedIDs(res), []string{moved.ID + ":" + ReasonScopeChange}) {
		t.Fatalf("scope change = %v", rejectedIDs(res))
	}
	// Leaving the project hides its routines.
	if _, err := f.s.RemoveMember(f.ctx, "alice", "p", "carol"); err != nil {
		t.Fatal(err)
	}
	if got := f.field("carol", "rule", "r1", "name"); got != "<none>" {
		t.Fatalf("removed member still sees routine: %s", got)
	}
}
