package store

import (
	"io/fs"
	"strconv"
	"strings"
	"testing"
)

func TestMigrateReachesLatestVersion(t *testing.T) {
	db, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	entries, err := fs.ReadDir(migrations, "migrations")
	if err != nil {
		t.Fatal(err)
	}
	latest := 0
	for _, e := range entries {
		v, err := strconv.Atoi(strings.SplitN(e.Name(), "_", 2)[0])
		if err != nil {
			t.Fatalf("migration %s: %v", e.Name(), err)
		}
		if v > latest {
			latest = v
		}
	}
	if latest < 3 {
		t.Fatalf("expected the passkeys migration (0003) to be embedded, latest is %d", latest)
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
	// Re-opening is a no-op.
	db2, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	db2.Close()
}
