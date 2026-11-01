package store

import (
	"context"
	"testing"
)

// routines-ai-step 2.1: the new tables and columns exist, and the column step
// can run again.
func TestRoutinesAIMigration(t *testing.T) {
	db, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()
	if err := migrateRoutinesAI(ctx, db); err != nil {
		t.Fatalf("second run: %v", err)
	}
	for _, c := range routinesAIColumns {
		var n int
		if err := db.QueryRow(`SELECT COUNT(*) FROM pragma_table_info(?) WHERE name = ?`, c.table, c.name).Scan(&n); err != nil || n != 1 {
			t.Fatalf("%s.%s: %d %v", c.table, c.name, n, err)
		}
	}
	for _, tbl := range []string{"routine_proposals", "rule_ai_usage", "assistant_usage_routines"} {
		var n int
		if err := db.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?`, tbl).Scan(&n); err != nil || n != 1 {
			t.Fatalf("table %s: %d %v", tbl, n, err)
		}
	}
}
