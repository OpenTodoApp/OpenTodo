package store

import (
	"context"
	"io/fs"
	"strconv"
	"strings"
	"testing"
)

// TestMigrationAppPasswords opens a database from before the caldav change: the
// app_passwords and caldav_resources tables appear, existing data is kept, and
// the migration can run again (it is idempotent).
func TestMigrationAppPasswords(t *testing.T) {
	ctx := context.Background()
	var name string
	var version int
	entries, _ := fs.ReadDir(migrations, "migrations")
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), "_caldav.sql") {
			name = e.Name()
			version, _ = strconv.Atoi(strings.SplitN(name, "_", 2)[0])
		}
	}
	if name == "" {
		t.Fatal("no *_caldav.sql migration embedded")
	}
	dir := t.TempDir()
	db, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, q := range []string{
		"DROP TABLE app_passwords",
		"DROP TABLE caldav_resources",
		"PRAGMA user_version = " + strconv.Itoa(version-1),
		"INSERT INTO settings(key,value,updated_at) VALUES('other','1',1)",
	} {
		if _, err := db.ExecContext(ctx, q); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	db.Close()
	db, err = Open(dir)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	defer db.Close()
	if _, err := db.ExecContext(ctx, `INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES('u1','a@b.c','','x','member',1)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO app_passwords(id,user_id,name,hash,created_at) VALUES('p1','u1','phone','h',1)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO caldav_resources(task_id,name,uid) VALUES('t1','x.ics','X')`); err != nil {
		t.Fatal(err)
	}
	var v string
	if err := db.QueryRowContext(ctx, `SELECT value FROM settings WHERE key = 'other'`).Scan(&v); err != nil || v != "1" {
		t.Fatalf("settings lost: %v %v", v, err)
	}
	body, _ := migrations.ReadFile("migrations/" + name)
	if _, err := db.ExecContext(ctx, string(body)); err != nil {
		t.Fatalf("migration not idempotent: %v", err)
	}
	// Deleting the account removes its app passwords.
	if _, err := db.ExecContext(ctx, `DELETE FROM users WHERE id = 'u1'`); err != nil {
		t.Fatal(err)
	}
	var n int
	_ = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM app_passwords`).Scan(&n)
	if n != 0 {
		t.Fatal("app passwords outlive the account")
	}
}
