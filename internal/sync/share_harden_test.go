package sync

import (
	"errors"
	"slices"
	"testing"
)

// TestShareRefusesProjectIDSquat reproduces the squat: bob learns the id of
// alice's unshared project "p", creates a project with that id in his own
// personal scope and shares it with carol. Before harden-links-and-sharing the
// share created the scope project:p owned by bob, and alice lost her own
// project for good (her writes were refused, she could never share it). Now
// either share is refused and both keep their own project.
func TestShareRefusesProjectIDSquat(t *testing.T) {
	f := newSharing(t)
	f.apply("bob", "B", f.op("project", "p", "name", `"Squat"`))
	if _, err := f.s.AddMember(f.ctx, "bob", "p", "carol", RoleEditor); !errors.Is(err, ErrProjectIDConflict) {
		t.Fatalf("bob shares the squatted id: %v", err)
	}
	var n int
	f.s.db.QueryRow(`SELECT COUNT(*) FROM project_scopes WHERE project_id = 'p'`).Scan(&n)
	if n != 0 {
		t.Fatal("a scope was created for the squatted id")
	}
	// Alice still owns and edits her project.
	if res := f.apply("alice", "A", f.op("task", "t1", "title", `"Oat milk"`)); res.Applied != 1 || len(res.Rejected) != 0 {
		t.Fatalf("alice's write = %+v", res)
	}
	if f.field("alice", "project", "p", "name") != `"Home"` || f.field("alice", "task", "t1", "title") != `"Oat milk"` {
		t.Fatal("alice lost her project")
	}
	m, err := f.s.ProjectMembers(f.ctx, "alice", "p")
	if err != nil || m.Role != RoleOwner {
		t.Fatalf("alice's role = %+v, %v", m, err)
	}
	// Alice cannot share it either while bob's copy exists (the refusal does
	// not depend on who asks); her data stays private and unchanged.
	if _, err := f.s.AddMember(f.ctx, "alice", "p", "carol", RoleEditor); !errors.Is(err, ErrProjectIDConflict) {
		t.Fatalf("alice shares a contested id: %v", err)
	}
	// Ids nobody else uses share as before.
	f.apply("alice", "A", f.op("project", "q", "name", `"Q"`))
	if _, err := f.s.AddMember(f.ctx, "alice", "q", "carol", RoleEditor); err != nil {
		t.Fatal(err)
	}
}

// TestShareMovesAttachments: the first share moves the attachments of the
// project's tasks with them, so members see files added before the share and a
// later purge finds them.
func TestShareMovesAttachments(t *testing.T) {
	f := newSharing(t)
	f.apply("alice", "A", f.attachmentOps("a1", "t1", "alice", 10)...)
	f.apply("alice", "A", f.attachmentOps("private", "inbox", "alice", 10)...)
	f.add("alice", "bob", RoleEditor)

	var scope string
	f.s.db.QueryRow(`SELECT DISTINCT scope_id FROM scope_fields WHERE entity = 'attachment' AND entity_id = 'a1'`).Scan(&scope)
	if scope != ProjectScope("p") {
		t.Fatalf("attachment scope = %q", scope)
	}
	if got := f.field("bob", "attachment", "a1", "name"); got != `"photo.png"` {
		t.Fatalf("bob sees attachment name %s", got)
	}
	if got := f.field("bob", "attachment", "private", "name"); got != "<none>" {
		t.Fatalf("bob sees a private attachment: %s", got)
	}
	ops, _ := f.pullAll("bob", "B1", 0)
	if !slices.Contains(entityIDs(ops), "a1") {
		t.Fatalf("bob's device did not receive the attachment: %v", entityIDs(ops))
	}
}
