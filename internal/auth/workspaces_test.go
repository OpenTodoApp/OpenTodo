package auth

import (
	"context"
	"database/sql"
	"testing"

	"github.com/pixari/opentodo/internal/store"
)

// hasDefaultWorkspace reports whether userID has exactly one default
// workspace with the derived id and is its owner (OpenSpec change workspaces).
func hasDefaultWorkspace(t *testing.T, db *sql.DB, userID string) {
	t.Helper()
	var n int
	if err := db.QueryRow(`SELECT COUNT(*) FROM workspaces w JOIN workspace_members m ON m.workspace_id = w.id AND m.user_id = w.owner_id AND m.role = 'owner'
		WHERE w.owner_id = ? AND w.kind = 'default' AND w.id = ?`, userID, store.DefaultWorkspaceID(userID)).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("account %s has %d default workspaces", userID, n)
	}
}

// TestEveryAccountPathCreatesTheDefaultWorkspace: the owner bootstrap, an
// invitation, an account created by an admin, a passwordless (demo sandbox)
// account, open sign-up, an OIDC first sign-in and a project invite link each
// create the account's default workspace with the account.
func TestEveryAccountPathCreatesTheDefaultWorkspace(t *testing.T) {
	ctx := context.Background()
	s, db := newService(t, true)
	owner := mustOwner(t, s)
	hasDefaultWorkspace(t, db, owner.ID)

	_, secret, err := s.CreateInvitation(ctx, owner, "", 0)
	if err != nil {
		t.Fatal(err)
	}
	invited, err := s.Register(ctx, "invited@example.com", "Invited", "correct horse battery", secret)
	if err != nil {
		t.Fatal(err)
	}
	hasDefaultWorkspace(t, db, invited.ID)

	created, err := s.CreateAccount(ctx, "created@example.com", "Created", "correct horse battery", "member")
	if err != nil {
		t.Fatal(err)
	}
	hasDefaultWorkspace(t, db, created.ID)

	sandbox, err := s.CreatePasswordlessAccount(ctx, "sandbox-x@demo.invalid", "Sandbox")
	if err != nil {
		t.Fatal(err)
	}
	hasDefaultWorkspace(t, db, sandbox.ID)

	pending, _, err := s.BeginSignup(ctx, "signup@example.com", "Signup", "a long enough password", "en")
	if err != nil {
		t.Fatal(err)
	}
	signed, err := s.CompleteSignup(ctx, pending)
	if err != nil {
		t.Fatal(err)
	}
	hasDefaultWorkspace(t, db, signed.ID)

	sso, isNew, _, err := s.MatchOrProvision(ctx, ExternalIdentity{Issuer: "https://idp.example", Subject: "s1", Email: "sso@example.com", EmailVerified: true, Name: "SSO"}, true, "oidc")
	if err != nil || !isNew {
		t.Fatalf("provision: %v %v", isNew, err)
	}
	hasDefaultWorkspace(t, db, sso.ID)

	if _, err := db.Exec(`INSERT INTO project_scopes(project_id,owner_id,created_at) VALUES('p1',?,1)`, owner.ID); err != nil {
		t.Fatal(err)
	}
	_, link, err := s.CreateProjectInvite(ctx, owner, "p1", "editor", "", 0)
	if err != nil {
		t.Fatal(err)
	}
	join := func(ctx context.Context, tx *sql.Tx, inviterID, projectID, userID, role string) ([]string, error) {
		return []string{inviterID, userID}, nil
	}
	linked, _, _, err := s.RegisterWithProjectInvite(ctx, "linked@example.com", "Linked", "correct horse battery", link, true, join)
	if err != nil {
		t.Fatal(err)
	}
	hasDefaultWorkspace(t, db, linked.ID)
}
