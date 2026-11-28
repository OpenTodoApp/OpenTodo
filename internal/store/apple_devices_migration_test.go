package store

import (
	"context"
	"testing"
)

// TestAppleDeviceMigration: the apple_devices migration runs twice without
// harm, a row goes with its session and with its user, and a due token hash
// is unique (ios-push-relay D8).
func TestAppleDeviceMigration(t *testing.T) {
	ctx := context.Background()
	db, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	m, err := migrations.ReadFile("migrations/0077_apple_devices.sql")
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if _, err := db.ExecContext(ctx, string(m)); err != nil {
			t.Fatalf("run %d: %v", i+1, err)
		}
	}
	row := `INSERT INTO apple_devices(id,user_id,session_hash,device_id,handle,handle_expires_at,wake_key,due_token_hash,created_at,updated_at)
		VALUES(?,?,?,?,'h1.x',1,'k',?,1,1)`
	for _, q := range []string{
		`INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES('u','u@example.org','u','x','owner',1)`,
		`INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES('v','v@example.org','v','x','member',1)`,
		`INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES('s1','u',1,2)`,
		`INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES('s2','u',1,2)`,
		`INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES('s3','v',1,2)`,
	} {
		if _, err := db.ExecContext(ctx, q); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	for _, r := range [][]any{{"a", "u", "s1", "phone", "d1"}, {"b", "u", "s2", "ipad", "d2"}, {"c", "v", "s3", "phone", "d3"}} {
		if _, err := db.ExecContext(ctx, row, r...); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.ExecContext(ctx, row, "d", "v", "s3", "other", "d1"); err == nil {
		t.Fatal("a due token hash was stored twice")
	}
	if _, err := db.ExecContext(ctx, row, "e", "u", "s1", "phone", "d9"); err == nil {
		t.Fatal("one device registered twice for a user")
	}
	count := func() (n int) {
		_ = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM apple_devices`).Scan(&n)
		return n
	}
	if _, err := db.ExecContext(ctx, `DELETE FROM sessions WHERE token_hash='s1'`); err != nil {
		t.Fatal(err)
	}
	if n := count(); n != 2 {
		t.Fatalf("%d rows after the session ended, want 2", n)
	}
	if _, err := db.ExecContext(ctx, `DELETE FROM users WHERE id='v'`); err != nil {
		t.Fatal(err)
	}
	if n := count(); n != 1 {
		t.Fatalf("%d rows after the user was deleted, want 1", n)
	}
}
