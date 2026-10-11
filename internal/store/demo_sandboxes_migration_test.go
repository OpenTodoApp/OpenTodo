package store

import (
	"context"
	"io/fs"
	"strconv"
	"strings"
	"testing"
)

// TestMigrationDemoSandboxes opens a database from before demo-sandboxes: the
// sandbox and token tables appear with their defaults, existing data is
// untouched, and the migration can run again.
func TestMigrationDemoSandboxes(t *testing.T) {
	ctx := context.Background()
	var name string
	var version int
	entries, _ := fs.ReadDir(migrations, "migrations")
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), "_demo_sandboxes.sql") {
			name = e.Name()
			version, _ = strconv.Atoi(strings.SplitN(name, "_", 2)[0])
		}
	}
	if name == "" {
		t.Fatal("no *_demo_sandboxes.sql migration embedded")
	}
	dir := t.TempDir()
	db, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, q := range []string{
		"DROP TABLE demo_sandboxes",
		"DROP TABLE demo_token_uses",
		"PRAGMA user_version = " + strconv.Itoa(version-1),
		`INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES('u1','a@example.com','A','x','owner',1)`,
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
	if _, err := db.ExecContext(ctx, `INSERT INTO demo_sandboxes(user_id, collaborator_id, created_at, last_active_at) VALUES('s1','c1',1,1)`); err != nil {
		t.Fatal(err)
	}
	var total, hour int
	var addr string
	if err := db.QueryRowContext(ctx, `SELECT ops_total, ops_hour_count, addr_hash FROM demo_sandboxes WHERE user_id = 's1'`).Scan(&total, &hour, &addr); err != nil || total != 0 || hour != 0 || addr != "" {
		t.Fatalf("defaults: %d %d %q %v", total, hour, addr, err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO demo_token_uses(nonce, expires_at) VALUES('n', 1)`); err != nil {
		t.Fatal(err)
	}
	var users int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users`).Scan(&users); err != nil || users != 1 {
		t.Fatalf("users = %d %v", users, err)
	}
	body, _ := migrations.ReadFile("migrations/" + name)
	if _, err := db.ExecContext(ctx, string(body)); err != nil {
		t.Fatalf("migration not idempotent: %v", err)
	}
}
