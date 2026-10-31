package store

import (
	"context"
	"io/fs"
	"strconv"
	"strings"
	"testing"
)

// TestMigrationCalsyncCursors opens a database from before
// outlook-calendar-sync: calsync_cursors appears, the migration can run
// again, and deleting a connection removes its cursors.
func TestMigrationCalsyncCursors(t *testing.T) {
	ctx := context.Background()
	var name string
	var version int
	entries, _ := fs.ReadDir(migrations, "migrations")
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), "_calsync_cursors.sql") {
			name = e.Name()
			version, _ = strconv.Atoi(strings.SplitN(name, "_", 2)[0])
		}
	}
	if name == "" {
		t.Fatal("no *_calsync_cursors.sql migration embedded")
	}
	dir := t.TempDir()
	db, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, q := range []string{
		"DROP TABLE calsync_cursors",
		"PRAGMA user_version = " + strconv.Itoa(version-1),
		`INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES('u1','a@b.c','','x','member',1)`,
		`INSERT INTO calsync_connections(id,user_id,provider,server_url,next_sync_at,created_at,updated_at) VALUES('c1','u1','microsoft','https://graph.microsoft.com/v1.0',0,1,1)`,
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
	var v int
	if err := db.QueryRowContext(ctx, "PRAGMA user_version").Scan(&v); err != nil || v != LatestVersion() {
		t.Fatalf("user_version = %d, want %d (%v)", v, LatestVersion(), err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO calsync_cursors(connection_id,calendar_id,delta_link,window_from,window_to,updated_at)
		VALUES('c1','cal','https://graph.microsoft.com/v1.0/x?$deltatoken=1',1,2,1)`); err != nil {
		t.Fatal(err)
	}
	// The migration is idempotent.
	body, _ := fs.ReadFile(migrations, "migrations/"+name)
	if _, err := db.ExecContext(ctx, string(body)); err != nil {
		t.Fatalf("second run: %v", err)
	}
	if _, err := db.ExecContext(ctx, `DELETE FROM calsync_connections WHERE id = 'c1'`); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM calsync_cursors`).Scan(&n); err != nil || n != 0 {
		t.Fatalf("cursors after delete = %d %v", n, err)
	}
}
