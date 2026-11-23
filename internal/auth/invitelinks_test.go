package auth

import (
	"context"
	"testing"
)

// A creator without a name is shown by their display name in both link lists
// and in the created link, as when the link is opened.
func TestInviteListsShowCreatorDisplayName(t *testing.T) {
	ctx := context.Background()
	s, db := newService(t, false)
	owner := mustOwner(t, s)
	if _, err := db.Exec("UPDATE users SET name = '' WHERE id = ?", owner.ID); err != nil {
		t.Fatal(err)
	}
	owner.Name = ""
	var ws string
	if err := db.QueryRow("SELECT id FROM workspaces WHERE owner_id = ?", owner.ID).Scan(&ws); err != nil {
		t.Fatal(err)
	}
	created, _, err := s.CreateProjectInvite(ctx, owner, "p1", "editor", "", 0)
	if err != nil {
		t.Fatal(err)
	}
	createdWS, _, err := s.CreateWorkspaceInvite(ctx, owner, ws, "member", "", 0)
	if err != nil {
		t.Fatal(err)
	}
	projects, err := s.ListProjectInvites(ctx, "p1")
	if err != nil {
		t.Fatal(err)
	}
	workspaces, err := s.ListWorkspaceInvites(ctx, ws)
	if err != nil {
		t.Fatal(err)
	}
	want := displayName("")
	if created.CreatedByName != want || createdWS.CreatedByName != want {
		t.Fatalf("created = %q, %q, want creator %q", created.CreatedByName, createdWS.CreatedByName, want)
	}
	if len(projects) != 1 || projects[0].CreatedByName != want {
		t.Fatalf("project list = %+v, want creator %q", projects, want)
	}
	if len(workspaces) != 1 || workspaces[0].CreatedByName != want {
		t.Fatalf("workspace list = %+v, want creator %q", workspaces, want)
	}
}
