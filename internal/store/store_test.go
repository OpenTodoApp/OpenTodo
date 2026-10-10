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
	if version != latest {
		t.Fatalf("user_version = %d, want %d", version, latest)
	}
	for _, table := range []string{"users", "sessions", "api_tokens", "ops", "fields", "invitations", "settings", "webhooks", "webhook_deliveries"} {
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
