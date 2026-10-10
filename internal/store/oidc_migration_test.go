package store

import (
	"context"
	"io/fs"
	"strconv"
	"strings"
	"testing"
)

// oidcMigration returns the embedded oidc migration's file name and version
// (numbers are assigned at merge time, so it is found by name).
func oidcMigration(t *testing.T) (string, int) {
	t.Helper()
	entries, err := fs.ReadDir(migrations, "migrations")
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), "_oidc.sql") {
			v, err := strconv.Atoi(strings.SplitN(e.Name(), "_", 2)[0])
			if err != nil {
				t.Fatal(err)
			}
			return e.Name(), v
		}
	}
	t.Fatal("no *_oidc.sql migration embedded")
	return "", 0
}

// TestMigrationOIDC checks that a database from before single sign-on reaches
// the new user_version with the identity tables, that the identity-token hint
// follows its session and identities follow their account, that (issuer,
// subject) is unique, and that the migration can run again (renumbering-safe).
func TestMigrationOIDC(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	db, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	name, version := oidcMigration(t)
	for _, q := range []string{
		"DROP TABLE session_oidc", "DROP TABLE identities",
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
		"INSERT INTO identities(id,user_id,issuer,subject,email,created_at) VALUES('i1','u1','https://sso','sub1','a@example.com',1)",
		"INSERT INTO session_oidc(token_hash,id_token) VALUES('h1','eyJ...')",
		"INSERT INTO settings(key,value,updated_at) VALUES('oidc.issuer','\"https://sso\"',1)",
	} {
		if _, err := db.ExecContext(ctx, q); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	if _, err := db.ExecContext(ctx, "INSERT INTO identities(id,user_id,issuer,subject,created_at) VALUES('i2','u1','https://sso','sub1',1)"); err == nil {
		t.Fatal("duplicate (issuer, subject) accepted")
	}
	body, err := migrations.ReadFile("migrations/" + name)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, string(body)); err != nil {
		t.Fatalf("re-running %s: %v", name, err)
	}
	var n int
	if _, err := db.ExecContext(ctx, "DELETE FROM sessions WHERE token_hash='h1'"); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM session_oidc").Scan(&n); err != nil || n != 0 {
		t.Fatalf("session_oidc rows after session delete = %d (%v)", n, err)
	}
	if _, err := db.ExecContext(ctx, "DELETE FROM users WHERE id='u1'"); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM identities").Scan(&n); err != nil || n != 0 {
		t.Fatalf("identities after user delete = %d (%v)", n, err)
	}
}
