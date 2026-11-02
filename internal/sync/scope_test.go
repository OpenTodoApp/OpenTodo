package sync

import (
	"errors"
	"slices"
	"testing"
)

// TestCanWriteWorkspaceID: on a shared project only the owner moves it to
// another workspace (OpenSpec change workspaces, "Admin cannot move a shared
// project"); tasks keep their rules.
func TestCanWriteWorkspaceID(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		role, entity string
		want         bool
	}{
		{RoleOwner, "project", true},
		{RoleAdmin, "project", false},
		{RoleEditor, "project", false},
		{RoleViewer, "project", false},
		{RoleOwner, "task", true},
		{RoleAdmin, "task", true},
		{RoleEditor, "task", true},
		{RoleViewer, "task", false},
	} {
		if got := CanWrite(c.role, c.entity, "workspace_id"); got != c.want {
			t.Errorf("CanWrite(%s, %s, workspace_id) = %v, want %v", c.role, c.entity, got, c.want)
		}
	}
	// The admin keeps every other project field it had.
	if !CanWrite(RoleAdmin, "project", "name") || CanWrite(RoleAdmin, "project", "deleted_at") {
		t.Fatal("admin project fields changed")
	}
}

// TestCanWriteReusable: editors and above turn a shared project's reusable-list
// switches on and off (OpenSpec reusable-lists, "Reusable list mode"); viewers
// do not, and editors still change no other project field.
func TestCanWriteReusable(t *testing.T) {
	t.Parallel()
	for _, f := range []string{"reusable", "aisles"} {
		for role, want := range map[string]bool{RoleOwner: true, RoleAdmin: true, RoleEditor: true, RoleViewer: false} {
			if got := CanWrite(role, "project", f); got != want {
				t.Errorf("CanWrite(%s, project, %s) = %v, want %v", role, f, got, want)
			}
		}
	}
	if CanWrite(RoleEditor, "project", "name") || CanWrite(RoleEditor, "project", "status") {
		t.Fatal("editors gained other project fields")
	}
}

func TestAdminCannotMoveSharedProject(t *testing.T) {
	t.Parallel()
	f := newSharing(t)
	f.add("alice", "carol", RoleAdmin)
	joinWorkspace(t, f.s.db, "w-family", "alice", "carol")
	move := f.op("project", "p", "workspace_id", `"w-family"`)
	res := f.apply("carol", "C", move)
	if !slices.Equal(rejectedIDs(res), []string{move.ID + ":forbidden"}) {
		t.Fatalf("admin move = %v", rejectedIDs(res))
	}
	if got := f.field("alice", "project", "p", "workspace_id"); got != "<none>" && got != "" && got != "null" {
		t.Fatalf("workspace_id after a refused move = %s", got)
	}
	if res := f.apply("alice", "A", f.op("project", "p", "workspace_id", `"w-family"`)); res.Applied != 1 {
		t.Fatalf("owner move = %+v", res)
	}
	if got := f.field("carol", "project", "p", "workspace_id"); got != `"w-family"` {
		t.Fatalf("workspace_id = %s", got)
	}
	// A non-string value is not an op.
	bad := f.op("project", "p", "workspace_id", `7`)
	bad.Device = "A"
	if _, err := f.s.Apply(f.ctx, "alice", []Op{bad}); !errors.Is(err, ErrInvalidOp) {
		t.Fatalf("number workspace_id: %v", err)
	}
}
