package store

import (
	"context"
	"database/sql"
	"io/fs"
	"strconv"
	"strings"
	"testing"
)

// TestMigrationWorkspaces opens a database from before the workspaces change
// with three accounts and a shared project: every account gets exactly one
// default workspace with the derived id, every member a direct grant,
// project_members reads as before (plus an empty via), and a second start
// changes nothing.
func TestMigrationWorkspaces(t *testing.T) {
	ctx := context.Background()
	var version int
	entries, _ := fs.ReadDir(migrations, "migrations")
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), "_workspaces.sql") {
			version, _ = strconv.Atoi(strings.SplitN(e.Name(), "_", 2)[0])
		}
	}
	if version == 0 {
		t.Fatal("no *_workspaces.sql migration embedded")
	}
	dir := t.TempDir()
	db, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, q := range []string{
		"DROP TABLE project_grants",
		"DROP TABLE group_members",
		"DROP TABLE groups",
		"DROP TABLE workspace_invites",
		"DROP TABLE workspace_members",
		"DROP TABLE workspaces",
		"ALTER TABLE project_members DROP COLUMN via",
		"PRAGMA user_version = " + strconv.Itoa(version-1),
		`INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES('u1','a@x.y','A','x','owner',1),('u2','b@x.y','B','x','member',1),('u3','c@x.y','C','x','member',1)`,
		`INSERT INTO project_scopes(project_id,owner_id,created_at) VALUES('p1','u1',1)`,
		`INSERT INTO project_members(project_id,user_id,role,added_by,created_at) VALUES('p1','u1','owner','',1),('p1','u2','editor','u1',2)`,
	} {
		if _, err := db.ExecContext(ctx, q); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	db.Close()
	check := func(db *sql.DB) {
		t.Helper()
		for _, u := range []string{"u1", "u2", "u3"} {
			var id, kind, name string
			var n int
			if err := db.QueryRowContext(ctx, `SELECT COUNT(*), MIN(id), MIN(kind), MIN(name) FROM workspaces WHERE owner_id = ?`, u).Scan(&n, &id, &kind, &name); err != nil {
				t.Fatal(err)
			}
			if n != 1 || id != DefaultWorkspaceID(u) || kind != "default" || name != DefaultWorkspaceName {
				t.Fatalf("%s: %d workspaces, %s %s %q", u, n, id, kind, name)
			}
			var role string
			if err := db.QueryRowContext(ctx, `SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?`, id, u).Scan(&role); err != nil || role != "owner" {
				t.Fatalf("%s owner row: %q %v", u, role, err)
			}
		}
		var grants int
		_ = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM project_grants g JOIN project_members m
			ON m.project_id = g.project_id AND m.user_id = g.subject_id AND m.role = g.role WHERE g.subject_kind = 'user'`).Scan(&grants)
		if grants != 2 {
			t.Fatalf("grants matching members = %d, want 2", grants)
		}
		rows, err := db.QueryContext(ctx, `SELECT user_id, role, via FROM project_members WHERE project_id = 'p1' ORDER BY user_id`)
		if err != nil {
			t.Fatal(err)
		}
		var got []string
		for rows.Next() {
			var u, r, via string
			_ = rows.Scan(&u, &r, &via)
			got = append(got, u+":"+r+":"+via)
		}
		rows.Close()
		if strings.Join(got, ",") != "u1:owner:,u2:editor:" {
			t.Fatalf("project_members = %v", got)
		}
	}
	db, err = Open(dir)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	check(db)
	var v int
	if err := db.QueryRowContext(ctx, "PRAGMA user_version").Scan(&v); err != nil || v != LatestVersion() {
		t.Fatalf("user_version = %d, want %d (%v)", v, LatestVersion(), err)
	}
	db.Close()
	db, err = Open(dir)
	if err != nil {
		t.Fatalf("second start: %v", err)
	}
	defer db.Close()
	check(db)
	if _, err := db.ExecContext(ctx, `DELETE FROM users WHERE id = 'u3'`); err != nil {
		t.Fatal(err)
	}
	var n int
	_ = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM workspaces WHERE owner_id = 'u3'`).Scan(&n)
	if n != 0 {
		t.Fatal("default workspace outlives the account")
	}
}
