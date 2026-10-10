package store

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
)

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
	// Derived from the embedded files so renumbering migrations never breaks this test.
	if want := LatestVersion(); version != want || want < 2 {
		t.Fatalf("user_version = %d, want %d", version, want)
	}
	for _, table := range []string{"users", "sessions", "api_tokens", "ops", "fields", "invitations", "settings", "backup_runs"} {
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

// A database created by the first release (schema v1) gains the settings and
// backup_runs tables plus a random log generation when migrated.
func TestMigrationAddsSettingsAndGeneration(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), DBFile)
	db, err := OpenFile(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	v1, err := migrations.ReadFile("migrations/0001_init.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, string(v1)); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, "PRAGMA user_version = 1"); err != nil {
		t.Fatal(err)
	}
	if err := Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	var gen string
	if err := db.QueryRowContext(ctx, "SELECT value FROM settings WHERE key = 'generation'").Scan(&gen); err != nil {
		t.Fatalf("generation missing: %v", err)
	}
	if len(gen) != 32 {
		t.Fatalf("generation = %q, want 32 hex chars", gen)
	}
	if _, err := db.ExecContext(ctx, "INSERT INTO backup_runs(id, started_at, status) VALUES('r1', 1, 'running')"); err != nil {
		t.Fatalf("backup_runs unusable: %v", err)
	}
	// Re-running migrations keeps the generation stable.
	if err := Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	var again string
	_ = db.QueryRowContext(ctx, "SELECT value FROM settings WHERE key = 'generation'").Scan(&again)
	if again != gen {
		t.Fatalf("generation changed on re-migrate: %q -> %q", gen, again)
	}
	// Two fresh databases get different generations.
	other, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer other.Close()
	var gen2 string
	_ = other.QueryRowContext(ctx, "SELECT value FROM settings WHERE key = 'generation'").Scan(&gen2)
	if gen2 == "" || gen2 == gen {
		t.Fatalf("generations not random: %q %q", gen, gen2)
	}
}

func TestLockIsExclusive(t *testing.T) {
	dir := t.TempDir()
	release, err := Lock(dir)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := Lock(dir); !errors.Is(err, ErrLocked) {
		t.Fatalf("second lock: %v, want ErrLocked", err)
	}
	release()
	release2, err := Lock(dir)
	if err != nil {
		t.Fatalf("lock after release: %v", err)
	}
	release2()
}
