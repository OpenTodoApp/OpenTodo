package store

import (
	"context"
	"testing"
)

// TestMigrationEmailVerified (sso-email-verified D1): a database from before
// the column gets it, accounts whose provider identity carries the same
// address count as verified, the others do not, and the step can run again.
func TestMigrationEmailVerified(t *testing.T) {
	ctx := context.Background()
	db, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, q := range []string{
		"ALTER TABLE users DROP COLUMN email_verified_at",
		"INSERT INTO users(id,email,password_hash,created_at) VALUES('u1','a@example.com','',5),('u2','b@example.com','x',6),('u3','c@example.com','x',7)",
		"INSERT INTO identities(id,user_id,issuer,subject,email,created_at) VALUES('i1','u1','https://sso','s1','a@example.com',1),('i3','u3','https://sso','s3','other@example.com',1)",
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	for i := 0; i < 2; i++ {
		if err := migrateEmailVerified(ctx, db); err != nil {
			t.Fatalf("run %d: %v", i, err)
		}
	}
	got := map[string]bool{}
	rows, err := db.Query("SELECT id, email_verified_at IS NOT NULL FROM users")
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var v bool
		if err := rows.Scan(&id, &v); err != nil {
			t.Fatal(err)
		}
		got[id] = v
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	if !got["u1"] || got["u2"] || got["u3"] {
		t.Fatalf("verified = %v, want only u1", got)
	}
}
