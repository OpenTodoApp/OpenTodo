package store

import (
	"context"
	"testing"
)

// routines-shared 2.1: the columns exist, and the column step can run again.
func TestRoutinesSharedMigration(t *testing.T) {
	db, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := migrateRoutinesShared(context.Background(), db); err != nil {
		t.Fatalf("second run: %v", err)
	}
	for _, c := range routinesSharedColumns {
		var n int
		if err := db.QueryRow(`SELECT COUNT(*) FROM pragma_table_info(?) WHERE name = ?`, c.table, c.name).Scan(&n); err != nil || n != 1 {
			t.Fatalf("%s.%s: %d %v", c.table, c.name, n, err)
		}
	}
}
