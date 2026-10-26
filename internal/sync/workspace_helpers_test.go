package sync

import (
	"database/sql"
	"testing"
)

// joinWorkspace makes users members of a created workspace (creating it, owned
// by the first user, when missing): a project's workspace_id must name a
// workspace its author belongs to (security finding L10).
func joinWorkspace(t *testing.T, db *sql.DB, ws string, users ...string) {
	t.Helper()
	if _, err := db.Exec(`INSERT OR IGNORE INTO workspaces(id,kind,owner_id,name,created_at) VALUES(?,'created',?,?,1)`, ws, users[0], ws); err != nil {
		t.Fatal(err)
	}
	for i, u := range users {
		role := "member"
		if i == 0 {
			role = "owner"
		}
		if _, err := db.Exec(`INSERT OR IGNORE INTO workspace_members(workspace_id,user_id,role,created_at) VALUES(?,?,?,1)`, ws, u, role); err != nil {
			t.Fatal(err)
		}
	}
}
