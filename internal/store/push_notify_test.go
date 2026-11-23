package store

import (
	"context"
	"testing"
)

// The push notify columns are added once and the step can run again.
func TestMigratePushNotifyIsRepeatable(t *testing.T) {
	db, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := migratePushNotify(context.Background(), db); err != nil {
		t.Fatalf("second run: %v", err)
	}
	for _, name := range pushNotifyColumns {
		var n int
		if err := db.QueryRow(`SELECT COUNT(*) FROM pragma_table_info('push_subscriptions') WHERE name = ?`, name).Scan(&n); err != nil || n != 1 {
			t.Fatalf("%s: %d %v", name, n, err)
		}
	}
}
