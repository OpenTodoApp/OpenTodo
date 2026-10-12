package store

import (
	"context"
	"fmt"
	"io/fs"
	"strconv"
	"strings"
	"testing"
)

// TestMigrationAssistantMemberProvider (assistant-member-provider) upgrades a
// database at the previous version, runs the migration body again, and
// checks both tables and their cascades on account deletion.
func TestMigrationAssistantMemberProvider(t *testing.T) {
	ctx := context.Background()
	entries, err := fs.ReadDir(migrations, "migrations")
	if err != nil {
		t.Fatal(err)
	}
	name, version := "", 0
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), "_assistant_member_provider.sql") {
			name = e.Name()
			version, _ = strconv.Atoi(strings.SplitN(name, "_", 2)[0])
		}
	}
	if name == "" {
		t.Fatal("no *_assistant_member_provider.sql migration embedded")
	}
	db, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, tbl := range []string{"assistant_member_provider", "assistant_usage_own_key"} {
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
		INSERT INTO assistant_member_provider(user_id,provider,model,updated_at) VALUES('u1','openai','gpt-x',1);
		INSERT INTO assistant_usage_own_key(user_id,month,input_tokens,output_tokens,turns) VALUES('u1','2026-10',10,20,1);`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `DELETE FROM users WHERE id = 'u1'`); err != nil {
		t.Fatal(err)
	}
	var n int
	_ = db.QueryRowContext(ctx, `SELECT (SELECT COUNT(*) FROM assistant_member_provider) + (SELECT COUNT(*) FROM assistant_usage_own_key)`).Scan(&n)
	if n != 0 {
		t.Fatalf("rows left after account deletion: %d", n)
	}
}
