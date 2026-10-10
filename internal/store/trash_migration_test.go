package store

import (
	"context"
	"io/fs"
	"strconv"
	"strings"
	"testing"
)

// trashMigration returns the embedded trash migration's file name and version
// (numbers are assigned at merge time, so it is found by name).
func trashMigration(t *testing.T) (string, int) {
	t.Helper()
	entries, err := fs.ReadDir(migrations, "migrations")
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), "_trash.sql") {
			v, err := strconv.Atoi(strings.SplitN(e.Name(), "_", 2)[0])
			if err != nil {
				t.Fatal(err)
			}
			return e.Name(), v
		}
	}
	t.Fatal("no *_trash.sql migration embedded")
	return "", 0
}

// TestMigrationsApplyPurges opens a database from before the trash change: the
// purges table appears, existing data is kept, and the migration can run again.
func TestMigrationsApplyPurges(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	db, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	name, version := trashMigration(t)
	for _, q := range []string{
		"DROP TABLE purges",
		"PRAGMA user_version = " + strconv.Itoa(version-1),
		"INSERT INTO ops(user_id,op_id,entity,entity_id,field,value,ts,device,received_at) VALUES('u1','o1','task','t1','title','\"x\"',1,'d',1)",
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
	var got int
	if err := db.QueryRowContext(ctx, "PRAGMA user_version").Scan(&got); err != nil || got < version {
		t.Fatalf("user_version = %d (%v), want >= %d", got, err, version)
	}
	if _, err := db.ExecContext(ctx, "INSERT INTO purges(seq,user_id,scope_id,entity,entity_id,purged_at) VALUES(5,'u1','user:u1','task','t1',1)"); err != nil {
		t.Fatalf("purges after migrating: %v", err)
	}
	var n int
	if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM ops").Scan(&n); err != nil || n != 1 {
		t.Fatalf("existing ops lost: %d %v", n, err)
	}
	body, err := migrations.ReadFile("migrations/" + name)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, string(body)); err != nil {
		t.Fatalf("re-running %s: %v", name, err)
	}
	if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM purges").Scan(&n); err != nil || n != 1 {
		t.Fatalf("marker lost on re-run: %d %v", n, err)
	}
}
