package store

import (
	"context"
	"io/fs"
	"strconv"
	"strings"
	"testing"
)

// TestMigrationIssueConnections opens a database from before the issue-import
// change: issue_connections and issue_links appear with their indexes, the
// migration can run again, and deleting an account removes its rows.
func TestMigrationIssueConnections(t *testing.T) {
	ctx := context.Background()
	var name string
	var version int
	entries, _ := fs.ReadDir(migrations, "migrations")
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), "_issue_connections.sql") {
			name = e.Name()
			version, _ = strconv.Atoi(strings.SplitN(name, "_", 2)[0])
		}
	}
	if name == "" {
		t.Fatal("no *_issue_connections.sql migration embedded")
	}
	dir := t.TempDir()
	db, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, q := range []string{
		"DROP TABLE issue_links",
		"DROP TABLE issue_connections",
		"PRAGMA user_version = " + strconv.Itoa(version-1),
		`INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES('u1','a@b.c','','x','member',1)`,
	} {
		if _, err := db.ExecContext(ctx, q); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	db.Close()
	db, err = Open(dir)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	defer db.Close()
	var v int
	if err := db.QueryRowContext(ctx, "PRAGMA user_version").Scan(&v); err != nil || v != LatestVersion() {
		t.Fatalf("user_version = %d, want %d (%v)", v, LatestVersion(), err)
	}
	for _, q := range []string{
		`INSERT INTO issue_connections(id,user_id,provider,host,interval_seconds,next_poll_at,created_at,updated_at) VALUES('c1','u1','github','https://github.com',1800,0,1,1)`,
		`INSERT INTO issue_links(connection_id,issue_key,task_id,created_at) VALUES('c1','acme/web#1','t1',1)`,
	} {
		if _, err := db.ExecContext(ctx, q); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	for _, idx := range []string{"issue_connections_user", "issue_connections_due", "issue_links_task"} {
		var n int
		_ = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = ?`, idx).Scan(&n)
		if n != 1 {
			t.Errorf("index %s missing", idx)
		}
	}
	body, _ := migrations.ReadFile("migrations/" + name)
	if _, err := db.ExecContext(ctx, string(body)); err != nil {
		t.Fatalf("migration not idempotent: %v", err)
	}
	if _, err := db.ExecContext(ctx, `DELETE FROM users WHERE id = 'u1'`); err != nil {
		t.Fatal(err)
	}
	var n int
	_ = db.QueryRowContext(ctx, `SELECT (SELECT COUNT(*) FROM issue_connections) + (SELECT COUNT(*) FROM issue_links)`).Scan(&n)
	if n != 0 {
		t.Fatal("issue connection rows outlive the account")
	}
}
