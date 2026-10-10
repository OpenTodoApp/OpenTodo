package store

import (
	"context"
	"io/fs"
	"strconv"
	"strings"
	"testing"
)

// latestVersion is the highest migration number embedded in the binary.
func latestVersion(t *testing.T) int {
	t.Helper()
	entries, err := fs.ReadDir(migrations, "migrations")
	if err != nil {
		t.Fatal(err)
	}
	latest := 0
	for _, e := range entries {
		v, err := strconv.Atoi(strings.SplitN(e.Name(), "_", 2)[0])
		if err != nil {
			t.Fatalf("migration %s: bad prefix", e.Name())
		}
		latest = max(latest, v)
	}
	return latest
}

func TestOpenMigratesEmptyDataDir(t *testing.T) {
	db, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	var version int
	if err := db.QueryRowContext(context.Background(), "PRAGMA user_version").Scan(&version); err != nil {
		t.Fatal(err)
	}
	if want := latestVersion(t); version != want {
		t.Fatalf("user_version = %d, want %d", version, want)
	}
	for _, table := range []string{"users", "sessions", "api_tokens", "ops", "fields", "invitations", "import_jobs", "import_items"} {
		var name string
		err := db.QueryRowContext(context.Background(), "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", table).Scan(&name)
		if err != nil {
			t.Fatalf("table %s missing after migration: %v", table, err)
		}
	}
	// Migrating again is a no-op.
	if err := Migrate(context.Background(), db); err != nil {
		t.Fatalf("second migrate: %v", err)
	}
}

// TestMigrationsIdempotent covers an existing database created before the
// data-import migration: opening it applies 0005 and keeps its data, and the import
// tables' statements are safe to run again (they use IF NOT EXISTS) so a database
// that recorded a later version on another branch cannot fail on them.
func TestMigrationsIdempotent(t *testing.T) {
	dir := t.TempDir()
	db, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	// Simulate a database from before the import tables existed.
	for _, q := range []string{
		"INSERT INTO users(id,email,password_hash,created_at) VALUES('u1','a@example.com','x',1)",
		"DROP TABLE import_items", "DROP TABLE import_jobs", "PRAGMA user_version = 2",
	} {
		if _, err := db.ExecContext(ctx, q); err != nil {
			t.Fatal(err)
		}
	}
	db.Close()
	db, err = Open(dir)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	defer db.Close()
	if _, err := db.ExecContext(ctx, "INSERT INTO import_jobs(id,user_id,profile,status,created_at) VALUES('j','u1','csv','done',1)"); err != nil {
		t.Fatalf("import_jobs after migrating an old database: %v", err)
	}
	var n int
	if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users").Scan(&n); err != nil || n != 1 {
		t.Fatalf("existing data lost: %d %v", n, err)
	}
	// Re-running the import migration over existing tables is a no-op.
	body, err := migrations.ReadFile("migrations/0005_data_import.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, string(body)); err != nil {
		t.Fatalf("re-running 0005: %v", err)
	}
	if err := Migrate(ctx, db); err != nil {
		t.Fatalf("second migrate: %v", err)
	}
	if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM import_jobs").Scan(&n); err != nil || n != 1 {
		t.Fatalf("import job lost: %d %v", n, err)
	}
}
