package store

import (
	"context"
	"testing"
)

// TestMigrationAuditChainStartsAtTheTail: a database with audit events from
// before the hash chain gets the column and a checkpoint at its newest event,
// so the chain starts there and the older events stay as they were; re-running
// the migration keeps the checkpoint.
func TestMigrationAuditChainStartsAtTheTail(t *testing.T) {
	dir := t.TempDir()
	db, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	// Simulate a database from before migration 0060.
	for _, q := range []string{
		"DROP TABLE audit_chain", "ALTER TABLE audit_events DROP COLUMN hash",
		"INSERT INTO audit_events(ts,name,outcome) VALUES(1,'logout','success'),(2,'logout','success'),(3,'logout','success')",
		"PRAGMA user_version = 59",
	} {
		if _, err := db.ExecContext(ctx, q); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	db.Close()
	if db, err = Open(dir); err != nil {
		t.Fatalf("reopen: %v", err)
	}
	var after int64
	var hash string
	if err := db.QueryRowContext(ctx, "SELECT after_id, hash FROM audit_chain WHERE id = 1").Scan(&after, &hash); err != nil || after != 3 || hash != "" {
		t.Fatalf("checkpoint = %d %q %v, want the newest event and the genesis hash", after, hash, err)
	}
	var unhashed int
	if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM audit_events WHERE hash IS NULL").Scan(&unhashed); err != nil || unhashed != 3 {
		t.Fatalf("older events: %d %v", unhashed, err)
	}
	// A re-run (migration numbers reassigned at merge time) is a no-op.
	if _, err := db.ExecContext(ctx, "INSERT INTO audit_events(ts,name,outcome,hash) VALUES(4,'logout','success','x')"); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, "PRAGMA user_version = 59"); err != nil {
		t.Fatal(err)
	}
	db.Close()
	if db, err = Open(dir); err != nil {
		t.Fatalf("re-run: %v", err)
	}
	defer db.Close()
	if err := db.QueryRowContext(ctx, "SELECT after_id FROM audit_chain WHERE id = 1").Scan(&after); err != nil || after != 3 {
		t.Fatalf("re-run moved the checkpoint to %d (%v)", after, err)
	}
}
