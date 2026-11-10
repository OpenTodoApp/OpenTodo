package store

import (
	"context"
	"testing"
)

// assistant-usage-cache 1.2: the cached usage columns exist with default 0
// (a row written before has no cached part), and the step can run again.
func TestAssistantUsageCachedMigration(t *testing.T) {
	db, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := migrateAssistantUsageCached(context.Background(), db); err != nil {
		t.Fatalf("second run: %v", err)
	}
	for _, c := range assistantUsageCachedColumns {
		var n int
		var def string
		if err := db.QueryRow(`SELECT COUNT(*), COALESCE(MAX(dflt_value), '') FROM pragma_table_info(?) WHERE name = ?`, c.table, c.name).Scan(&n, &def); err != nil || n != 1 || def != "0" {
			t.Fatalf("%s.%s: %d %q %v", c.table, c.name, n, def, err)
		}
	}
}
