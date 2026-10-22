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

func TestAdminCannotMoveSharedProject(t *testing.T) {
	t.Parallel()
	f := newSharing(t)
	f.add("alice", "carol", RoleAdmin)
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
