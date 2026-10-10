package store

import (
	"context"
	"io/fs"
	"strconv"
	"strings"
	"testing"
)

// userManagementMigration returns the embedded user-management migration's
// file name and version (numbers are assigned at merge time, so it is found by name).
func userManagementMigration(t *testing.T) (string, int) {
	t.Helper()
	entries, err := fs.ReadDir(migrations, "migrations")
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), "_user_management.sql") {
			v, err := strconv.Atoi(strings.SplitN(e.Name(), "_", 2)[0])
			if err != nil {
				t.Fatal(err)
			}
			return e.Name(), v
		}
	}
	t.Fatal("no *_user_management.sql migration embedded")
	return "", 0
}

// TestMigrationUserManagement opens an empty data directory and one from before
// the change; both reach the latest user_version, the migration can run again,
// and the database itself refuses a second owner, deleting the owner and
// deactivating the owner.
func TestMigrationUserManagement(t *testing.T) {
	ctx := context.Background()

	// Empty data directory.
	fresh, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	var v int
	if err := fresh.QueryRowContext(ctx, "PRAGMA user_version").Scan(&v); err != nil || v != LatestVersion() {
		t.Fatalf("fresh user_version = %d (%v), want %d", v, err, LatestVersion())
	}
	fresh.Close()

	// Existing directory from before this change, with an owner and a member.
	dir := t.TempDir()
	db, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	name, version := userManagementMigration(t)
	for _, q := range []string{
		"DROP TRIGGER users_owner_not_deleted", "DROP TRIGGER user_status_owner_not_deactivated_insert",
		"DROP TRIGGER user_status_owner_not_deactivated_update", "DROP TRIGGER users_owner_must_be_active",
		"DROP INDEX users_one_owner", "DROP TABLE password_resets", "DROP TABLE user_status",
		"PRAGMA user_version = " + strconv.Itoa(version-1),
		"INSERT INTO users(id,email,password_hash,role,created_at) VALUES('o','o@example.com','x','owner',1),('m','m@example.com','x','member',1)",
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
	if err := db.QueryRowContext(ctx, "PRAGMA user_version").Scan(&v); err != nil || v != LatestVersion() || v < version {
		t.Fatalf("user_version = %d (%v), want %d", v, err, LatestVersion())
	}
	// Re-running is a no-op.
	body, err := migrations.ReadFile("migrations/" + name)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, string(body)); err != nil {
		t.Fatalf("re-running %s: %v", name, err)
	}

	mustFail := func(q, why string) {
		t.Helper()
		if _, err := db.ExecContext(ctx, q); err == nil {
			t.Fatalf("%s: succeeded, want refusal (%s)", q, why)
		}
	}
	mustFail("INSERT INTO users(id,email,password_hash,role,created_at) VALUES('o2','o2@example.com','x','owner',1)", "second owner")
	mustFail("UPDATE users SET role='owner' WHERE id='m'", "second owner by update")
	mustFail("DELETE FROM users WHERE id='o'", "owner deleted")
	mustFail("INSERT INTO user_status(user_id,deactivated_at) VALUES('o',1)", "owner deactivated")

	for _, q := range []string{
		"INSERT INTO user_status(user_id,deactivated_at,last_login_at) VALUES('m',5,4)",
		"INSERT INTO password_resets(id,token_hash,user_id,created_by,created_at,expires_at) VALUES('r','h','m','o',1,2)",
	} {
		if _, err := db.ExecContext(ctx, q); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	mustFail("UPDATE users SET role='owner' WHERE id='m'", "deactivated account becomes owner")
	// Deleting a member removes its status and reset links.
	if _, err := db.ExecContext(ctx, "DELETE FROM users WHERE id='m'"); err != nil {
		t.Fatal(err)
	}
	for _, table := range []string{"user_status", "password_resets"} {
		var n int
		if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM "+table).Scan(&n); err != nil || n != 0 {
			t.Fatalf("%s rows after user delete = %d (%v)", table, n, err)
		}
	}
}
