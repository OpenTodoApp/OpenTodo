package store

import (
	"context"
	"fmt"
	"io/fs"
	"strconv"
	"strings"
	"testing"
)

// mcpMigration returns the embedded mcp-server migration's file name and
// version (numbers are assigned at merge time, so it is found by name).
func mcpMigration(t *testing.T) (string, int) {
	t.Helper()
	entries, err := fs.ReadDir(migrations, "migrations")
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), "_mcp.sql") {
			v, err := strconv.Atoi(strings.SplitN(e.Name(), "_", 2)[0])
			if err != nil {
				t.Fatal(err)
			}
			return e.Name(), v
		}
	}
	t.Fatal("no *_mcp.sql migration embedded")
	return "", 0
}

// TestMigrationTokenScopeDefaultsFull upgrades a database from before the
// change that already holds an API token: the token keeps full access (no scope
// row), new scopes can be stored, revoking removes the scope, and the migration
// can run again.
func TestMigrationTokenScopeDefaultsFull(t *testing.T) {
	ctx := context.Background()
	db, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	name, version := mcpMigration(t)
	if _, err := db.ExecContext(ctx, "DROP TABLE api_token_scopes"); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, fmt.Sprintf("PRAGMA user_version = %d", version-1)); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO users(id,email,password_hash,role,created_at) VALUES('u1','a@example.com','h','owner',1);
		INSERT INTO api_tokens(id,user_id,name,token_hash,created_at) VALUES('old','u1','script','hash-old',1);`); err != nil {
		t.Fatal(err)
	}
	if err := Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	var v int
	if err := db.QueryRowContext(ctx, "PRAGMA user_version").Scan(&v); err != nil || v != LatestVersion() {
		t.Fatalf("user_version = %d (%v), want %d", v, err, LatestVersion())
	}
	scopeOf := func(id string) string {
		var s string
		if err := db.QueryRowContext(ctx, `SELECT COALESCE(sc.scope,'full') FROM api_tokens t LEFT JOIN api_token_scopes sc ON sc.token_id = t.id WHERE t.id = ?`, id).Scan(&s); err != nil {
			t.Fatal(err)
		}
		return s
	}
	if s := scopeOf("old"); s != "full" {
		t.Fatalf("legacy token scope = %q, want full", s)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO api_tokens(id,user_id,name,token_hash,created_at) VALUES('new','u1','assistant','hash-new',2);
		INSERT INTO api_token_scopes(token_id,scope) VALUES('new','read')`); err != nil {
		t.Fatal(err)
	}
	if s := scopeOf("new"); s != "read" {
		t.Fatalf("new token scope = %q", s)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO api_token_scopes(token_id,scope) VALUES('old','admin')`); err == nil {
		t.Fatal("unknown scope accepted")
	}
	// Idempotent: the migration body can run again over the upgraded schema.
	body, _ := migrations.ReadFile("migrations/" + name)
	if _, err := db.ExecContext(ctx, string(body)); err != nil {
		t.Fatalf("re-run: %v", err)
	}
	if _, err := db.ExecContext(ctx, `DELETE FROM api_tokens WHERE id = 'new'`); err != nil {
		t.Fatal(err)
	}
	var n int
	_ = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM api_token_scopes`).Scan(&n)
	if n != 0 {
		t.Fatalf("scope rows after revoke = %d", n)
	}
}
