package store

import (
	"context"
	"testing"
)

// TestAssignmentMigrationIsIdempotent: the notifications migration can run again
// (numbers may be reassigned at merge time) without touching existing rows.
func TestAssignmentMigrationIsIdempotent(t *testing.T) {
	ctx := context.Background()
	db, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.ExecContext(ctx, `INSERT INTO users(id,email,password_hash,created_at) VALUES('u1','a@example.com','h',1);
		INSERT INTO notifications(id,user_id,kind,payload,created_at) VALUES('n1','u1','assigned','{}',1)`); err != nil {
		t.Fatal(err)
	}
	body, err := migrations.ReadFile("migrations/0011_task_assignment.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, string(body)); err != nil {
		t.Fatalf("re-run: %v", err)
	}
	var n int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM notifications`).Scan(&n); err != nil || n != 1 {
		t.Fatalf("rows = %d, %v", n, err)
	}
}
