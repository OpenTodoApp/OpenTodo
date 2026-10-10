package store

import (
	"context"
	"io/fs"
	"strconv"
	"strings"
	"testing"
)

// embeddedMigrations returns the embedded migration files by version and the
// highest version. It fails on duplicate version numbers: the runner skips any
// version at or below the database's user_version, so a duplicate would never
// run. Gaps are allowed (branches land in merge order).
func embeddedMigrations(t *testing.T) (map[int]string, int) {
	t.Helper()
	entries, err := fs.ReadDir(migrations, "migrations")
	if err != nil {
		t.Fatal(err)
	}
	byVersion := map[int]string{}
	latest := 0
	for _, e := range entries {
		v, err := strconv.Atoi(strings.SplitN(e.Name(), "_", 2)[0])
		if err != nil {
			t.Fatalf("migration %s: %v", e.Name(), err)
		}
		if prev, dup := byVersion[v]; dup {
			t.Fatalf("migrations %s and %s share version %d", prev, e.Name(), v)
		}
		byVersion[v] = e.Name()
		if v > latest {
			latest = v
		}
	}
	return byVersion, latest
}

func TestOpenMigratesEmptyDataDir(t *testing.T) {
	db, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	_, latest := embeddedMigrations(t)
	var version int
	if err := db.QueryRowContext(context.Background(), "PRAGMA user_version").Scan(&version); err != nil {
		t.Fatal(err)
	}
	if version != latest || latest != highestEmbeddedVersion(t) {
		t.Fatalf("user_version = %d, want %d", version, latest)
	}
	for _, table := range []string{"users", "sessions", "api_tokens", "ops", "fields", "invitations", "settings", "webhooks", "webhook_deliveries", "import_jobs", "import_items", "audit_events"} {
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

func TestMigrateReachesLatestVersion(t *testing.T) {
	db, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	byVersion, latest := embeddedMigrations(t)
	passkeys := false
	for _, name := range byVersion {
		if strings.HasSuffix(name, "_passkeys.sql") {
			passkeys = true
		}
	}
	if !passkeys {
		t.Fatal("the passkeys migration is not embedded")
	}

	var version int
	if err := db.QueryRow("PRAGMA user_version").Scan(&version); err != nil {
		t.Fatal(err)
	}
	if version != latest {
		t.Fatalf("user_version = %d, want %d", version, latest)
	}
	for _, table := range []string{"users", "sessions", "api_tokens", "ops", "fields", "passkeys"} {
		var name string
		if err := db.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name=?", table).Scan(&name); err != nil {
			t.Fatalf("table %s missing after migration: %v", table, err)
		}
	}
}

// TestMigrationsIdempotent covers an existing database created before the
// data-import migration: opening it applies that migration and keeps its data, and the import
// tables' statements are safe to run again (they use IF NOT EXISTS) so a database
// that recorded a later version on another branch cannot fail on them.
func TestMigrationsIdempotent(t *testing.T) {
	dir := t.TempDir()
	db, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	// Migration numbers are assigned at merge time, so find ours by name.
	name, version := dataImportMigration(t)
	// Simulate a database from before the import tables existed.
	for _, q := range []string{
		"INSERT INTO users(id,email,password_hash,created_at) VALUES('u1','a@example.com','x',1)",
		"DROP TABLE import_items", "DROP TABLE import_jobs", "PRAGMA user_version = " + strconv.Itoa(version-1),
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
	body, err := migrations.ReadFile("migrations/" + name)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, string(body)); err != nil {
		t.Fatalf("re-running %s: %v", name, err)
	}
	if err := Migrate(ctx, db); err != nil {
		t.Fatalf("second migrate: %v", err)
	}
	if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM import_jobs").Scan(&n); err != nil || n != 1 {
		t.Fatalf("import job lost: %d %v", n, err)
	}
}

// dataImportMigration returns the embedded data-import migration's file name and version.
func dataImportMigration(t *testing.T) (string, int) {
	t.Helper()
	entries, err := fs.ReadDir(migrations, "migrations")
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), "_data_import.sql") {
			v, err := strconv.Atoi(strings.SplitN(e.Name(), "_", 2)[0])
			if err != nil {
				t.Fatal(err)
			}
			return e.Name(), v
		}
	}
	t.Fatal("no *_data_import.sql migration embedded")
	return "", 0
}
