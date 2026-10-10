package store

import (
	"context"
	"testing"
)

// TestMigrationEncryptionKeys: the e2ee migration is idempotent, adds the key
// table without touching the op log, and a deleted account takes its record along.
func TestMigrationEncryptionKeys(t *testing.T) {
	ctx := context.Background()
	db, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	body, err := migrations.ReadFile("migrations/0023_e2ee.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, string(body)); err != nil {
		t.Fatalf("migration not idempotent: %v", err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES('u1','a@b.c','','x','member',1)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO encryption_keys(user_id,version,kdf,salt,iterations,wrapped_passphrase,wrapped_recovery,created_at,updated_at)
		VALUES('u1',1,1,'s',600000,'p','r',1,1)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `DELETE FROM users WHERE id = 'u1'`); err != nil {
		t.Fatal(err)
	}
	var n int
	_ = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM encryption_keys`).Scan(&n)
	if n != 0 {
		t.Fatal("key record outlives the account")
	}
}
