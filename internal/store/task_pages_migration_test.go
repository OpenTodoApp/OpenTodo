package store

import (
	"context"
	"io/fs"
	"strconv"
	"strings"
	"testing"
)

// TestMigrationTaskPages opens a database from before the task-pages change: the
// three tables appear, existing data is kept, one active page per task is
// enforced, and the migration can run again (it is idempotent).
func TestMigrationTaskPages(t *testing.T) {
	ctx := context.Background()
	var name string
	var version int
	entries, _ := fs.ReadDir(migrations, "migrations")
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), "_task_pages.sql") {
			name = e.Name()
			version, _ = strconv.Atoi(strings.SplitN(name, "_", 2)[0])
		}
	}
	if name == "" {
		t.Fatal("no *_task_pages.sql migration embedded")
	}
	db, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, q := range []string{
		"DROP TABLE task_page_actions", "DROP TABLE task_page_replies", "DROP TABLE task_pages",
		"PRAGMA user_version = " + strconv.Itoa(version-1),
		"INSERT INTO settings(key,value,updated_at) VALUES('kept','1',1)",
		"INSERT INTO users(id,email,password_hash,created_at) VALUES('u1','a@example.com','h',1)",
	} {
		if _, err := db.ExecContext(ctx, q); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	src, err := fs.ReadFile(migrations, "migrations/"+name)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ { // idempotent
		if _, err := db.ExecContext(ctx, string(src)); err != nil {
			t.Fatalf("run %d: %v", i, err)
		}
	}
	var kept string
	if err := db.QueryRowContext(ctx, "SELECT value FROM settings WHERE key='kept'").Scan(&kept); err != nil || kept != "1" {
		t.Fatalf("existing data lost: %q %v", kept, err)
	}
	ins := `INSERT INTO task_pages(id,task_id,user_id,secret_hash,rights,published_at) VALUES(?,?,?,?,?,1)`
	if _, err := db.ExecContext(ctx, ins, "p1", "t1", "u1", "h1", "reply"); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, ins, "p2", "t1", "u1", "h2", "view"); err == nil {
		t.Fatal("a second active page for the same task was accepted")
	}
	if _, err := db.ExecContext(ctx, "UPDATE task_pages SET revoked_at = 2 WHERE id = 'p1'"); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, ins, "p2", "t1", "u1", "h2", "view"); err != nil {
		t.Fatalf("a page after revocation: %v", err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO task_page_replies(id,page_id,ciphertext,created_at) VALUES('r1','p2','enc',1)`); err != nil {
		t.Fatal(err)
	}
}
