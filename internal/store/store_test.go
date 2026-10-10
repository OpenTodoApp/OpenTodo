package store

import (
	"context"
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
	if version != 5 {
		t.Fatalf("user_version = %d, want 5", version)
	}
	for _, table := range []string{"users", "sessions", "api_tokens", "ops", "fields", "invitations", "audit_events", "settings"} {
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
