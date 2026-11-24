package store

import (
	"context"
	"database/sql"
	"testing"
)

// TestMigrationWorkspaceFeatures: a database from before the switches gets the
// nullable features column, its workspaces keep NULL (every feature on), and the
// step can run again.
func TestMigrationWorkspaceFeatures(t *testing.T) {
	ctx := context.Background()
	db, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, q := range []string{
		"ALTER TABLE workspaces DROP COLUMN features",
		"INSERT INTO users(id,email,password_hash,created_at) VALUES('u1','a@example.com','h',1)",
		"INSERT INTO workspaces(id,kind,owner_id,name,created_at) VALUES('w1','created','u1','Family',1)",
	} {
		if _, err := db.ExecContext(ctx, q); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	for i := 0; i < 2; i++ {
		if err := migrateWorkspaceFeatures(ctx, db); err != nil {
			t.Fatalf("run %d: %v", i, err)
		}
	}
	var features sql.NullString
	if err := db.QueryRowContext(ctx, "SELECT features FROM workspaces WHERE id = 'w1'").Scan(&features); err != nil || features.Valid {
		t.Fatalf("features = %v %v, want NULL", features, err)
	}
}
