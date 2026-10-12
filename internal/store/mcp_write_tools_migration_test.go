package store

import (
	"context"
	"fmt"
	"io/fs"
	"strconv"
	"strings"
	"testing"
)

func writeToolsMigration(t *testing.T) (string, int) {
	t.Helper()
	entries, err := fs.ReadDir(migrations, "migrations")
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), "_mcp_write_tools.sql") {
			v, err := strconv.Atoi(strings.SplitN(e.Name(), "_", 2)[0])
			if err != nil {
				t.Fatal(err)
			}
			return e.Name(), v
		}
	}
	t.Fatal("no *_mcp_write_tools.sql migration embedded")
	return "", 0
}

// TestMigrationAgentTablesIdempotent upgrades a database at the previous
// version, runs the migration body again, and checks both side tables and
// their cascades.
func TestMigrationAgentTablesIdempotent(t *testing.T) {
	ctx := context.Background()
	db, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	name, version := writeToolsMigration(t)
	for _, tbl := range []string{"api_token_agent", "user_agent_access"} {
		if _, err := db.ExecContext(ctx, "DROP TABLE "+tbl); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.ExecContext(ctx, fmt.Sprintf("PRAGMA user_version = %d", version-1)); err != nil {
		t.Fatal(err)
	}
	if err := Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	body, _ := migrations.ReadFile("migrations/" + name)
	for i := 0; i < 2; i++ {
		if _, err := db.ExecContext(ctx, string(body)); err != nil {
			t.Fatalf("re-run %d: %v", i, err)
		}
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO users(id,email,password_hash,role,created_at) VALUES('u1','a@example.com','h','member',1);
		INSERT INTO api_tokens(id,user_id,name,token_hash,created_at) VALUES('tk','u1','assistant','hash',1);
		INSERT INTO api_token_scopes(token_id,scope) VALUES('tk','read');
		INSERT INTO api_token_agent(token_id) VALUES('tk');
		INSERT INTO user_agent_access(user_id,allow_writes,updated_at) VALUES('u1',1,1);`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `DELETE FROM api_tokens WHERE id = 'tk'; DELETE FROM users WHERE id = 'u1'`); err != nil {
		t.Fatal(err)
	}
	var n int
	_ = db.QueryRowContext(ctx, `SELECT (SELECT COUNT(*) FROM api_token_agent) + (SELECT COUNT(*) FROM user_agent_access)`).Scan(&n)
	if n != 0 {
		t.Fatalf("rows left after revoke and account deletion: %d", n)
	}
}

// TestAgentTokenIsReadForOldBinaries: an agent token is a `read` scope row
// plus the marker, so the scope query of a binary from before this change
// (COALESCE(sc.scope,'full'), no marker) reads it as read-only, and the
// api_token_scopes CHECK still refuses anything but full and read.
func TestAgentTokenIsReadForOldBinaries(t *testing.T) {
	ctx := context.Background()
	db, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.ExecContext(ctx, `INSERT INTO users(id,email,password_hash,role,created_at) VALUES('u1','a@example.com','h','owner',1);
		INSERT INTO api_tokens(id,user_id,name,token_hash,created_at) VALUES('tk','u1','assistant','hash',1);
		INSERT INTO api_token_scopes(token_id,scope) VALUES('tk','read');
		INSERT INTO api_token_agent(token_id) VALUES('tk');`); err != nil {
		t.Fatal(err)
	}
	var old string
	if err := db.QueryRowContext(ctx, `SELECT COALESCE(sc.scope,'full') FROM api_tokens t LEFT JOIN api_token_scopes sc ON sc.token_id = t.id WHERE t.id = 'tk'`).Scan(&old); err != nil {
		t.Fatal(err)
	}
	if old != "read" {
		t.Fatalf("an older binary would read scope %q", old)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO api_tokens(id,user_id,name,token_hash,created_at) VALUES('t2','u1','x','h2',1);
		INSERT INTO api_token_scopes(token_id,scope) VALUES('t2','agent')`); err == nil {
		t.Fatal("api_token_scopes accepted scope agent: older binaries would not know it")
	}
}
