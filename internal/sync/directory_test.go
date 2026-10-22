package sync

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"
	"testing"
)

// Workspace directory, groups and grants (OpenSpec change workspaces, tasks 2.1 to 2.4).

func strp(s string) *string { return &s }

// dirFixture: alice owns project "p" (two tasks) and "secret" in her default
// workspace; bob, carol, dan and eve have accounts.
type dirFixture struct {
	*sharingFixture
	ws string // alice's created workspace "Family"
}

func newDir(t *testing.T) *dirFixture {
	t.Helper()
	f := &dirFixture{sharingFixture: newSharing(t)}
	for _, u := range []string{"dan", "eve"} {
		if _, err := f.s.db.Exec(`INSERT INTO users(id,email,name,password_hash,created_at) VALUES(?,?,?,'h',1)`, u, u+"@example.com", u); err != nil {
			t.Fatal(err)
		}
	}
	w, err := f.s.CreateWorkspace(f.ctx, "alice", WorkspaceInput{Name: strp("Family")})
	if err != nil {
		t.Fatal(err)
	}
	f.ws = w.ID
	return f
}

func (f *dirFixture) must(_ DirectoryChange, err error) {
	f.t.Helper()
	if err != nil {
		f.t.Fatal(err)
	}
}

func (f *dirFixture) join(users ...string) {
	f.t.Helper()
	for _, u := range users {
		f.must(f.s.AddWorkspaceMember(f.ctx, "alice", f.ws, u, WorkspaceMember))
	}
}

// moveP puts project p into the workspace (an owner op).
func (f *dirFixture) moveP() {
	f.t.Helper()
	f.apply("alice", "A", f.op("project", "p", "workspace_id", fmt.Sprintf("%q", f.ws)))
}

// roles is "user:role:via" for every member of p, by user.
func (f *dirFixture) roles(project string) string {
	f.t.Helper()
	rows, err := f.s.db.Query(`SELECT user_id, role, via FROM project_members WHERE project_id = ? ORDER BY user_id`, project)
	if err != nil {
		f.t.Fatal(err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var u, r, via string
		_ = rows.Scan(&u, &r, &via)
		out = append(out, u+":"+r+":"+via)
	}
	return strings.Join(out, " ")
}

func TestWorkspaceEntityAndLimits(t *testing.T) {
	t.Parallel()
	f := newDir(t)
	list, err := f.s.Workspaces(f.ctx, "alice")
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 {
		t.Fatalf("workspaces = %+v", list)
	}
	var def, fam Workspace
	for _, w := range list {
		if w.Default {
			def = w
		} else {
			fam = w
		}
	}
	if def.Name != "Personal" || def.Role != WorkspaceOwner || fam.Name != "Family" || fam.Role != WorkspaceOwner || len(fam.Groups) != 0 || len(fam.Members) != 1 {
		t.Fatalf("default %+v family %+v", def, fam)
	}
	for _, in := range []WorkspaceInput{{Name: strp("")}, {Name: strp(strings.Repeat("x", 61))}, {Name: strp("ok"), Icon: strp("no-such-icon")}, {Name: strp("ok"), Color: strp("red")}, {}} {
		if _, err := f.s.CreateWorkspace(f.ctx, "alice", in); !errors.Is(err, ErrInvalidInput) {
			t.Fatalf("invalid input %+v: %v", in, err)
		}
	}
	if _, err := f.s.DeleteWorkspace(f.ctx, "alice", def.ID); !errors.Is(err, ErrDefaultWorkspace) {
		t.Fatalf("delete default: %v", err)
	}
	if _, err := f.s.AddWorkspaceMember(f.ctx, "alice", def.ID, "bob", WorkspaceMember); !errors.Is(err, ErrDefaultWorkspace) {
		t.Fatalf("member of default: %v", err)
	}
	// Too many workspaces: the default counts.
	f.s.SetWorkspaceLimits(WorkspaceLimits{Workspaces: 3})
	if _, err := f.s.CreateWorkspace(f.ctx, "alice", WorkspaceInput{Name: strp("Work")}); err != nil {
		t.Fatal(err)
	}
	var le *LimitError
	if _, err := f.s.CreateWorkspace(f.ctx, "alice", WorkspaceInput{Name: strp("More")}); !errors.As(err, &le) || le.Limit != "workspaces" || le.Max != 3 {
		t.Fatalf("limit: %v", err)
	}
	// Tenant limit on members: reads keep working.
	f.s.SetWorkspaceLimits(WorkspaceLimits{Members: 2})
	f.join("bob")
	if _, err := f.s.AddWorkspaceMember(f.ctx, "alice", f.ws, "carol", WorkspaceMember); !errors.Is(err, ErrLimitReached) {
		t.Fatalf("member limit: %v", err)
	}
	if _, err := f.s.Workspaces(f.ctx, "bob"); err != nil {
		t.Fatal(err)
	}
}

func TestWorkspaceMembershipAndRoles(t *testing.T) {
	t.Parallel()
	f := newDir(t)
	f.join("bob", "carol")
	// Member cannot manage.
	for _, err := range []error{
		func() error { _, err := f.s.AddWorkspaceMember(f.ctx, "bob", f.ws, "dan", WorkspaceMember); return err }(),
		func() error { _, err := f.s.RemoveWorkspaceMember(f.ctx, "bob", f.ws, "carol"); return err }(),
		func() error { _, err := f.s.SetWorkspaceMemberRole(f.ctx, "bob", f.ws, "carol", WorkspaceAdmin); return err }(),
		func() error { _, _, err := f.s.CreateGroup(f.ctx, "bob", f.ws, "Kids"); return err }(),
	} {
		if !errors.Is(err, ErrForbidden) {
			t.Fatalf("member managing: %v", err)
		}
	}
	// Non-member: not found.
	if _, err := f.s.WorkspaceByID(f.ctx, "eve", f.ws); !errors.Is(err, ErrNotFound) {
		t.Fatalf("non-member read: %v", err)
	}
	if _, err := f.s.AddWorkspaceMember(f.ctx, "eve", f.ws, "dan", WorkspaceMember); !errors.Is(err, ErrNotFound) {
		t.Fatalf("non-member write: %v", err)
	}
	// Admin adds members, not admins, and removes members, not admins.
	f.must(f.s.SetWorkspaceMemberRole(f.ctx, "alice", f.ws, "bob", WorkspaceAdmin))
	if _, err := f.s.AddWorkspaceMember(f.ctx, "bob", f.ws, "dan", WorkspaceAdmin); !errors.Is(err, ErrForbidden) {
		t.Fatalf("admin adds admin: %v", err)
	}
	ch, err := f.s.AddWorkspaceMember(f.ctx, "bob", f.ws, "dan", WorkspaceMember)
	if err != nil || !slices.Contains(ch.Audience, "dan") || !slices.Contains(ch.Audience, "carol") {
		t.Fatalf("admin adds member: %+v %v", ch, err)
	}
	if _, err := f.s.AddWorkspaceMember(f.ctx, "bob", f.ws, "dan", WorkspaceMember); !errors.Is(err, ErrAlreadyMember) {
		t.Fatalf("again: %v", err)
	}
	f.must(f.s.RemoveWorkspaceMember(f.ctx, "bob", f.ws, "dan"))
	// The owner cannot leave; a member can.
	if _, err := f.s.RemoveWorkspaceMember(f.ctx, "alice", f.ws, "alice"); !errors.Is(err, ErrOwnerMustTransfer) {
		t.Fatalf("owner leaves: %v", err)
	}
	f.must(f.s.RemoveWorkspaceMember(f.ctx, "carol", f.ws, "carol"))
	// Transfer.
	f.must(f.s.TransferWorkspace(f.ctx, "alice", f.ws, "bob"))
	w, err := f.s.WorkspaceByID(f.ctx, "alice", f.ws)
	if err != nil || w.Role != WorkspaceAdmin || w.OwnerID != "bob" || w.Members[0].UserID != "bob" {
		t.Fatalf("after transfer: %+v %v", w, err)
	}
	// Delete: refused while not empty, then allowed.
	var ne *NotEmptyError
	if _, err := f.s.DeleteWorkspace(f.ctx, "bob", f.ws); !errors.As(err, &ne) || ne.Members != 1 || ne.Projects != 0 {
		t.Fatalf("delete with a member: %v", err)
	}
	f.must(f.s.RemoveWorkspaceMember(f.ctx, "bob", f.ws, "alice"))
	f.must(f.s.DeleteWorkspace(f.ctx, "bob", f.ws))
	if _, err := f.s.WorkspaceByID(f.ctx, "bob", f.ws); !errors.Is(err, ErrNotFound) {
		t.Fatalf("deleted workspace still listed: %v", err)
	}
}

func TestDeleteWorkspaceWithProjects(t *testing.T) {
	t.Parallel()
	f := newDir(t)
	f.moveP()
	var ne *NotEmptyError
	if _, err := f.s.DeleteWorkspace(f.ctx, "alice", f.ws); !errors.As(err, &ne) || ne.Projects != 1 {
		t.Fatalf("delete with a project: %v", err)
	}
	f.apply("alice", "A", f.op("project", "p", "deleted_at", `5`))
	f.must(f.s.DeleteWorkspace(f.ctx, "alice", f.ws))
}

func TestGroupsDirectory(t *testing.T) {
	t.Parallel()
	f := newDir(t)
	f.join("bob")
	g, _, err := f.s.CreateGroup(f.ctx, "alice", f.ws, "Adults")
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := f.s.CreateGroup(f.ctx, "alice", f.ws, " adults "); !errors.Is(err, ErrGroupExists) {
		t.Fatalf("duplicate: %v", err)
	}
	if _, err := f.s.SetGroupMember(f.ctx, "alice", f.ws, g.ID, "eve", true); !errors.Is(err, ErrNotInWorkspace) {
		t.Fatalf("outsider in group: %v", err)
	}
	f.must(f.s.SetGroupMember(f.ctx, "alice", f.ws, g.ID, "bob", true))
	f.must(f.s.RenameGroup(f.ctx, "alice", f.ws, g.ID, "Grown-ups"))
	w, _ := f.s.WorkspaceByID(f.ctx, "bob", f.ws)
	if len(w.Groups) != 1 || w.Groups[0].Name != "Grown-ups" || !slices.Equal(w.Groups[0].Members, []string{"bob"}) {
		t.Fatalf("groups = %+v", w.Groups)
	}
	f.s.SetWorkspaceLimits(WorkspaceLimits{Groups: 1, GroupMembers: 1})
	if _, _, err := f.s.CreateGroup(f.ctx, "alice", f.ws, "Kids"); !errors.Is(err, ErrLimitReached) {
		t.Fatalf("group limit: %v", err)
	}
	if _, err := f.s.SetGroupMember(f.ctx, "alice", f.ws, g.ID, "alice", true); !errors.Is(err, ErrLimitReached) {
		t.Fatalf("group member limit: %v", err)
	}
}

func TestGroupGrantsMaterialise(t *testing.T) {
	t.Parallel()
	f := newDir(t)
	f.join("bob", "carol", "dan")
	f.moveP()
	g, _, _ := f.s.CreateGroup(f.ctx, "alice", f.ws, "Adults")
	f.must(f.s.SetGroupMember(f.ctx, "alice", f.ws, g.ID, "bob", true))
	f.must(f.s.SetGroupMember(f.ctx, "alice", f.ws, g.ID, "carol", true))

	// Share with a group: both are editors via Adults, with history replay.
	gc, err := f.s.SetGroupGrant(f.ctx, "alice", "p", g.ID, RoleEditor, true)
	if err != nil || gc.To != RoleEditor || !slices.Contains(gc.Audience, "bob") {
		t.Fatalf("grant: %+v %v", gc, err)
	}
	if got := f.roles("p"); got != "alice:owner: bob:editor:"+g.ID+" carol:editor:"+g.ID {
		t.Fatalf("after grant: %s", got)
	}
	var backfill int
	_ = f.s.db.QueryRow(`SELECT backfill FROM project_members WHERE project_id = 'p' AND user_id = 'bob'`).Scan(&backfill)
	if backfill != 1 {
		t.Fatal("newcomer not marked for history replay")
	}
	if got := f.field("bob", "task", "t1", "title"); got != `"Milk"` {
		t.Fatalf("bob reads %s", got)
	}

	// Join a group: no op is written.
	var opsBefore, opsAfter int
	_ = f.s.db.QueryRow(`SELECT COUNT(*) FROM ops`).Scan(&opsBefore)
	f.must(f.s.SetGroupMember(f.ctx, "alice", f.ws, g.ID, "dan", true))
	_ = f.s.db.QueryRow(`SELECT COUNT(*) FROM ops`).Scan(&opsAfter)
	if opsAfter != opsBefore || !strings.Contains(f.roles("p"), "dan:editor:") {
		t.Fatalf("join: ops %d->%d roles %s", opsBefore, opsAfter, f.roles("p"))
	}

	// Leave a group with a direct grant: carol keeps viewer; an edit is refused.
	if _, err := f.s.AddMember(f.ctx, "alice", "p", "carol", RoleViewer); err != nil {
		t.Fatal(err)
	}
	f.must(f.s.SetGroupMember(f.ctx, "alice", f.ws, g.ID, "carol", false))
	if !strings.Contains(f.roles("p"), "carol:viewer: ") && !strings.HasSuffix(f.roles("p"), "carol:viewer:") {
		t.Fatalf("carol after leaving: %s", f.roles("p"))
	}
	edit := f.op("task", "t1", "title", `"x"`)
	if res := f.apply("carol", "C", edit); !slices.Equal(rejectedIDs(res), []string{edit.ID + ":forbidden"}) {
		t.Fatalf("carol edit = %v", rejectedIDs(res))
	}

	// Highest role wins: bob direct admin, Adults editor.
	if _, err := f.s.AddMember(f.ctx, "alice", "p", "bob", RoleAdmin); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(f.roles("p"), "bob:admin:"+g.ID) {
		t.Fatalf("highest role: %s", f.roles("p"))
	}
	m, err := f.s.ProjectMembers(f.ctx, "alice", "p")
	if err != nil || len(m.Grants) != 1 || m.Grants[0].Name != "Adults" {
		t.Fatalf("member list grants: %+v %v", m.Grants, err)
	}
	for _, mem := range m.Members {
		if mem.UserID == "bob" && (len(mem.Via) != 1 || mem.Via[0].Name != "Adults") {
			t.Fatalf("bob via = %+v", mem.Via)
		}
	}

	// Grant refused for the role: an admin cannot grant admin; an editor cannot grant.
	g2, _, _ := f.s.CreateGroup(f.ctx, "alice", f.ws, "Kids")
	if _, err := f.s.SetGroupGrant(f.ctx, "bob", "p", g2.ID, RoleAdmin, true); !errors.Is(err, ErrForbidden) {
		t.Fatalf("admin grants admin: %v", err)
	}
	if _, err := f.s.SetGroupGrant(f.ctx, "dan", "p", g2.ID, RoleViewer, true); !errors.Is(err, ErrForbidden) {
		t.Fatalf("editor grants: %v", err)
	}

	// Delete a group: dan (group only) leaves, bob keeps admin, alice untouched.
	f.must(f.s.DeleteGroup(f.ctx, "alice", f.ws, g.ID))
	if got := f.roles("p"); got != "alice:owner: bob:admin: carol:viewer:" {
		t.Fatalf("after deleting the group: %s", got)
	}
}

func TestRemoveWorkspaceMemberDropsGrants(t *testing.T) {
	t.Parallel()
	f := newDir(t)
	f.join("bob", "carol")
	f.moveP()
	// "House" is a second project of alice in Family.
	f.apply("alice", "A", f.op("project", "house", "name", `"House"`), f.op("project", "house", "workspace_id", fmt.Sprintf("%q", f.ws)))
	g, _, _ := f.s.CreateGroup(f.ctx, "alice", f.ws, "Adults")
	f.must(f.s.SetGroupMember(f.ctx, "alice", f.ws, g.ID, "carol", true))
	if _, err := f.s.SetGroupGrant(f.ctx, "alice", "house", g.ID, RoleEditor, true); err != nil {
		t.Fatal(err)
	}
	if _, err := f.s.AddMember(f.ctx, "alice", "p", "carol", RoleEditor); err != nil {
		t.Fatal(err)
	}
	if _, err := f.s.AddMember(f.ctx, "alice", "p", "bob", RoleEditor); err != nil {
		t.Fatal(err)
	}
	f.apply("alice", "A", f.op("task", "t1", "assignee_id", `"carol"`))
	ch, err := f.s.RemoveWorkspaceMember(f.ctx, "alice", f.ws, "carol")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(f.roles("p"), "carol") || strings.Contains(f.roles("house"), "carol") {
		t.Fatalf("carol still on a project: %s / %s", f.roles("p"), f.roles("house"))
	}
	if !slices.Contains(ch.Unassigned, "t1") || !slices.Contains(ch.Audience, "carol") {
		t.Fatalf("change = %+v", ch)
	}
	if !strings.Contains(f.roles("p"), "bob:editor:") {
		t.Fatalf("bob lost p: %s", f.roles("p"))
	}
}

func TestClosedDirectory(t *testing.T) {
	t.Parallel()
	f := newDir(t)
	f.join("bob")
	f.moveP()
	if _, err := f.s.AddMember(f.ctx, "alice", "p", "eve", RoleEditor); !errors.Is(err, ErrNotInWorkspace) {
		t.Fatalf("outsider: %v", err)
	}
	if _, err := f.s.AddMember(f.ctx, "alice", "p", "bob", RoleEditor); err != nil {
		t.Fatalf("directory member: %v", err)
	}
	// The default workspace keeps the email rule.
	if _, err := f.s.AddMember(f.ctx, "alice", "secret", "eve", RoleViewer); err != nil {
		t.Fatalf("default workspace: %v", err)
	}
	// Invite link from outside.
	tx, err := f.s.db.BeginTx(f.ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	_, err = f.s.AddMemberTx(f.ctx, tx, "alice", "p", "dan", RoleViewer)
	tx.Rollback()
	if !errors.Is(err, ErrNotInWorkspace) {
		t.Fatalf("link from outside: %v", err)
	}
	// A group of another workspace cannot be granted.
	other, _ := f.s.CreateWorkspace(f.ctx, "alice", WorkspaceInput{Name: strp("Work")})
	g, _, _ := f.s.CreateGroup(f.ctx, "alice", other.ID, "Team")
	if _, err := f.s.SetGroupGrant(f.ctx, "alice", "p", g.ID, RoleViewer, true); !errors.Is(err, ErrNotFound) {
		t.Fatalf("foreign group: %v", err)
	}
}

func TestGroupChangeMaterialisedOnce(t *testing.T) {
	t.Parallel()
	f := newDir(t)
	f.join("bob", "dan")
	g, _, _ := f.s.CreateGroup(f.ctx, "alice", f.ws, "Adults")
	f.must(f.s.SetGroupMember(f.ctx, "alice", f.ws, g.ID, "bob", true))
	for i := range 30 {
		id := fmt.Sprintf("proj%d", i)
		f.apply("alice", "A", f.op("project", id, "name", `"P"`), f.op("project", id, "workspace_id", fmt.Sprintf("%q", f.ws)))
		if _, err := f.s.SetGroupGrant(f.ctx, "alice", id, g.ID, RoleEditor, true); err != nil {
			t.Fatal(err)
		}
	}
	ch, err := f.s.SetGroupMember(f.ctx, "alice", f.ws, g.ID, "dan", true)
	if err != nil || len(ch.Projects) != 30 {
		t.Fatalf("projects changed = %d %v", len(ch.Projects), err)
	}
	ms, err := f.s.Memberships(f.ctx, "dan")
	if err != nil || len(ms) != 30 {
		t.Fatalf("dan memberships = %d %v", len(ms), err)
	}
}

func TestWorkspacesInThreeQueries(t *testing.T) {
	t.Parallel()
	s, log := newCountingService(t)
	ctx := context.Background()
	exec := func(q string, args ...any) {
		t.Helper()
		if _, err := s.db.Exec(q, args...); err != nil {
			t.Fatal(err)
		}
	}
	for i := range 300 {
		exec(`INSERT INTO users(id,email,name,password_hash,created_at) VALUES(?,?,?,'h',1)`, fmt.Sprintf("u%03d", i), fmt.Sprintf("u%d@x.y", i), fmt.Sprintf("U%d", i))
	}
	for w := range 15 {
		id := fmt.Sprintf("w%02d", w)
		exec(`INSERT INTO workspaces(id,kind,owner_id,name,created_at) VALUES(?,'created','u000',?,1)`, id, id)
		exec(`INSERT INTO workspace_members(workspace_id,user_id,role,created_at) VALUES(?,'u000','owner',1)`, id)
		for m := 1; m <= 20; m++ {
			exec(`INSERT INTO workspace_members(workspace_id,user_id,role,created_at) VALUES(?,?,'member',1)`, id, fmt.Sprintf("u%03d", w*19+m))
		}
	}
	for g := range 40 {
		gid := fmt.Sprintf("g%02d", g)
		exec(`INSERT INTO groups(id,workspace_id,name,created_at) VALUES(?,?,?,1)`, gid, fmt.Sprintf("w%02d", g%15), gid)
		exec(`INSERT INTO group_members(group_id,user_id,created_at) VALUES(?,'u000',1)`, gid)
	}
	log.reset()
	list, err := s.Workspaces(ctx, "u000")
	if err != nil {
		t.Fatal(err)
	}
	if n := log.count(""); n > 4 { // three reads, plus the default workspace's owner name before the backfill
		t.Fatalf("Workspaces ran %d statements", n)
	}
	if len(list) != 16 {
		t.Fatalf("workspaces = %d", len(list))
	}
	groups := 0
	for _, w := range list {
		groups += len(w.Groups)
	}
	if groups != 40 {
		t.Fatalf("groups = %d", groups)
	}
}
