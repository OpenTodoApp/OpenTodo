package sync

import (
	"context"
	"fmt"
	"testing"
)

// deleteAccount runs the account deletion hook and deletes the users row, as
// auth.DeleteUser does, and returns what happened to the owned workspaces.
func (f *dirFixture) deleteAccount(user string) []WorkspaceHandover {
	f.t.Helper()
	var handed []WorkspaceHandover
	ctx := WithWorkspaceHandovers(context.Background(), &handed)
	tx, err := f.s.db.BeginTx(ctx, nil)
	if err != nil {
		f.t.Fatal(err)
	}
	defer tx.Rollback()
	if _, err := f.s.DeleteAccountData(ctx, tx, user); err != nil {
		f.t.Fatal(err)
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM users WHERE id = ?`, user); err != nil {
		f.t.Fatal(err)
	}
	if err := tx.Commit(); err != nil {
		f.t.Fatal(err)
	}
	return handed
}

func (f *dirFixture) owner(ws string) string {
	var o string
	_ = f.s.db.QueryRow(`SELECT owner_id FROM workspaces WHERE id = ?`, ws).Scan(&o)
	return o
}

// TestAccountDeletionHandsOverWorkspaces (design D10, task 2.7): a workspace
// with an admin passes to its oldest admin, an empty one is deleted, one with
// members but no admin passes to the server owner; the default workspace, the
// memberships and the grants go with the account.
func TestAccountDeletionHandsOverWorkspaces(t *testing.T) {
	t.Parallel()
	f := newDir(t)
	if _, err := f.s.db.Exec(`UPDATE users SET role = 'owner' WHERE id = 'eve'`); err != nil {
		t.Fatal(err)
	}
	f.join("bob", "carol")
	f.must(f.s.SetWorkspaceMemberRole(f.ctx, "alice", f.ws, "carol", WorkspaceAdmin))
	empty, _ := f.s.CreateWorkspace(f.ctx, "alice", WorkspaceInput{Name: strp("Empty")})
	noAdmin, _ := f.s.CreateWorkspace(f.ctx, "alice", WorkspaceInput{Name: strp("Club")})
	f.must(f.s.AddWorkspaceMember(f.ctx, "alice", noAdmin.ID, "dan", WorkspaceMember))
	// Bob's own workspace where alice is a member with a grant through a group.
	bobs, _ := f.s.CreateWorkspace(f.ctx, "bob", WorkspaceInput{Name: strp("Bob's")})
	f.must(f.s.AddWorkspaceMember(f.ctx, "bob", bobs.ID, "alice", WorkspaceMember))
	g, _, _ := f.s.CreateGroup(f.ctx, "bob", bobs.ID, "Friends")
	f.must(f.s.SetGroupMember(f.ctx, "bob", bobs.ID, g.ID, "alice", true))
	f.apply("bob", "B", f.op("project", "bp", "name", `"Bob's project"`), f.op("project", "bp", "workspace_id", fmt.Sprintf("%q", bobs.ID)))
	if _, err := f.s.SetGroupGrant(f.ctx, "bob", "bp", g.ID, RoleEditor, true); err != nil {
		t.Fatal(err)
	}

	handed := f.deleteAccount("alice")
	got := map[string]string{}
	for _, h := range handed {
		got[h.WorkspaceID] = h.NewOwner
	}
	if got[f.ws] != "carol" || f.owner(f.ws) != "carol" {
		t.Fatalf("Family went to %q (%q)", got[f.ws], f.owner(f.ws))
	}
	if o, ok := got[empty.ID]; !ok || o != "" || f.owner(empty.ID) != "" {
		t.Fatalf("empty workspace: %q kept %q", o, f.owner(empty.ID))
	}
	if got[noAdmin.ID] != "eve" || f.owner(noAdmin.ID) != "eve" {
		t.Fatalf("Club went to %q", got[noAdmin.ID])
	}
	var n int
	_ = f.s.db.QueryRow(`SELECT (SELECT COUNT(*) FROM workspaces WHERE owner_id = 'alice') + (SELECT COUNT(*) FROM workspace_members WHERE user_id = 'alice')
		+ (SELECT COUNT(*) FROM group_members WHERE user_id = 'alice') + (SELECT COUNT(*) FROM project_grants WHERE subject_id = 'alice')`).Scan(&n)
	if n != 0 {
		t.Fatalf("%d directory rows outlive the account", n)
	}
	if roles := f.roles("bp"); roles != "bob:owner:" {
		t.Fatalf("bob's project members = %s", roles)
	}
}
