package store

import (
	"context"
	"io/fs"
	"strconv"
	"strings"
	"testing"
)

// mfaMigration returns the embedded mfa migration's file name and version
// (numbers are assigned at merge time, so it is found by name).
func mfaMigration(t *testing.T) (string, int) {
	t.Helper()
	entries, err := fs.ReadDir(migrations, "migrations")
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), "_mfa.sql") {
			v, err := strconv.Atoi(strings.SplitN(e.Name(), "_", 2)[0])
			if err != nil {
				t.Fatal(err)
			}
			return e.Name(), v
		}
	}
	t.Fatal("no *_mfa.sql migration embedded")
	return "", 0
}

// TestMigrationMFA checks that a database from before the second factor reaches
// the new user_version with the mfa tables, that session freshness rows follow
// their session, and that the migration can run again (renumbering-safe).
func TestMigrationMFA(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	db, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	name, version := mfaMigration(t)
	// Simulate a database from before this change, with an existing session.
	for _, q := range []string{
		"DROP TABLE session_auth", "DROP TABLE trusted_devices", "DROP TABLE mfa_recovery_codes", "DROP TABLE mfa_totp",
		"PRAGMA user_version = " + strconv.Itoa(version-1),
		"INSERT INTO users(id,email,password_hash,created_at) VALUES('u1','a@example.com','x',1)",
		"INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES('h1','u1',1,2)",
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
	var got int
	if err := db.QueryRowContext(ctx, "PRAGMA user_version").Scan(&got); err != nil || got != LatestVersion() || got < version {
		t.Fatalf("user_version = %d (%v), want %d", got, err, LatestVersion())
	}
	for _, q := range []string{
		"INSERT INTO mfa_totp(user_id,secret,created_at) VALUES('u1','ABC',1)",
		"INSERT INTO mfa_recovery_codes(user_id,code_hash,created_at) VALUES('u1','h',1)",
		"INSERT INTO trusted_devices(id,user_id,token_hash,created_at,expires_at) VALUES('d1','u1','t',1,2)",
		"INSERT INTO session_auth(token_hash,mfa_at,reauth_at) VALUES('h1',1,1)",
		"INSERT INTO settings(key,value,updated_at) VALUES('mfa.required','none',1)",
	} {
		if _, err := db.ExecContext(ctx, q); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	// Session freshness is deleted with its session.
	if _, err := db.ExecContext(ctx, "DELETE FROM sessions WHERE token_hash='h1'"); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM session_auth").Scan(&n); err != nil || n != 0 {
		t.Fatalf("session_auth rows after session delete = %d (%v)", n, err)
	}
	// Re-running the migration over existing tables is a no-op and keeps data.
	body, err := migrations.ReadFile("migrations/" + name)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, string(body)); err != nil {
		t.Fatalf("re-running %s: %v", name, err)
	}
	if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM mfa_totp").Scan(&n); err != nil || n != 1 {
		t.Fatalf("mfa_totp rows = %d (%v)", n, err)
	}
	// Deleting the account removes its second-factor data.
	if _, err := db.ExecContext(ctx, "DELETE FROM users WHERE id='u1'"); err != nil {
		t.Fatal(err)
	}
	for _, table := range []string{"mfa_totp", "mfa_recovery_codes", "trusted_devices"} {
		if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM "+table).Scan(&n); err != nil || n != 0 {
			t.Fatalf("%s rows after user delete = %d (%v)", table, n, err)
		}
	}
}
