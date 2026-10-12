package store

import (
	"context"
	"fmt"
	"io/fs"
	"strconv"
	"strings"
	"testing"
)

func assistantMigration(t *testing.T) (string, int) {
	t.Helper()
	entries, err := fs.ReadDir(migrations, "migrations")
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), "_assistant.sql") {
			v, err := strconv.Atoi(strings.SplitN(e.Name(), "_", 2)[0])
			if err != nil {
				t.Fatal(err)
			}
			return e.Name(), v
		}
	}
	t.Fatal("no *_assistant.sql migration embedded")
	return "", 0
}

// TestMigrationAssistantTables upgrades a database at the previous version,
// runs the migration body again, and checks both tables and their cascades.
func TestMigrationAssistantTables(t *testing.T) {
	ctx := context.Background()
	db, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	name, version := assistantMigration(t)
	for _, tbl := range []string{"assistant_usage", "assistant_consent"} {
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
		INSERT INTO assistant_usage(user_id,month,input_tokens,output_tokens,turns) VALUES('u1','2026-10',10,20,1);
		INSERT INTO assistant_consent(user_id,accepted_at,disclosure_version,provider) VALUES('u1',1,1,'anthropic');`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `DELETE FROM users WHERE id = 'u1'`); err != nil {
		t.Fatal(err)
	}
	var n int
	_ = db.QueryRowContext(ctx, `SELECT (SELECT COUNT(*) FROM assistant_usage) + (SELECT COUNT(*) FROM assistant_consent)`).Scan(&n)
	if n != 0 {
		t.Fatalf("rows left after account deletion: %d", n)
	}
}
