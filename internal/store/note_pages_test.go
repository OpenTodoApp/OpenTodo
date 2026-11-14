package store

import (
	"context"
	"testing"
)

// TestMigrationNotePages: a database from before note pages gets kind and
// note_id, its task pages stay task pages, one active page per task and per
// note is enforced, and the step can run again.
func TestMigrationNotePages(t *testing.T) {
	ctx := context.Background()
	db, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, q := range []string{
		"DROP INDEX task_pages_note_active", "DROP INDEX task_pages_active",
		"ALTER TABLE task_pages DROP COLUMN note_id", "ALTER TABLE task_pages DROP COLUMN kind",
		"CREATE UNIQUE INDEX task_pages_active ON task_pages(task_id) WHERE revoked_at IS NULL",
		"INSERT INTO users(id,email,password_hash,created_at) VALUES('u1','a@example.com','h',1)",
		"INSERT INTO task_pages(id,task_id,user_id,secret_hash,rights,published_at) VALUES('old','t1','u1','h0','reply',1)",
	} {
		if _, err := db.ExecContext(ctx, q); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	for i := 0; i < 2; i++ {
		if err := migrateNotePages(ctx, db); err != nil {
			t.Fatalf("run %d: %v", i, err)
		}
	}
	var kind string
	if err := db.QueryRowContext(ctx, "SELECT kind FROM task_pages WHERE id = 'old'").Scan(&kind); err != nil || kind != "task" {
		t.Fatalf("old page kind = %q %v", kind, err)
	}
	note := `INSERT INTO task_pages(id,task_id,user_id,secret_hash,rights,published_at,kind,note_id) VALUES(?,'','u1',?,'view',1,'note',?)`
	if _, err := db.ExecContext(ctx, note, "n1", "h1", "note1"); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, note, "n2", "h2", "note2"); err != nil {
		t.Fatalf("a second note's page: %v", err)
	}
	if _, err := db.ExecContext(ctx, note, "n3", "h3", "note1"); err == nil {
		t.Fatal("a second active page for one note was accepted")
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO task_pages(id,task_id,user_id,secret_hash,rights,published_at) VALUES('p2','t1','u1','h4','view',1)`); err == nil {
		t.Fatal("a second active page for one task was accepted")
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO task_pages(id,task_id,user_id,secret_hash,rights,published_at,kind) VALUES('x','t9','u1','h5','view',1,'list')`); err == nil {
		t.Fatal("an unknown kind was accepted")
	}
}
