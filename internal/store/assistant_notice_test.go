package store

import (
	"context"
	"testing"
)

// assistant-disclosure-notice 1.1: the column exists and the step can run again.
func TestAssistantNoticeMigration(t *testing.T) {
	db, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := migrateAssistantNotice(context.Background(), db); err != nil {
		t.Fatalf("second run: %v", err)
	}
	var n int
	if err := db.QueryRow(`SELECT COUNT(*) FROM pragma_table_info('assistant_consent') WHERE name = 'seen_version'`).Scan(&n); err != nil || n != 1 {
		t.Fatalf("seen_version: %d %v", n, err)
	}
}
