package store

import (
	"context"
	"io/fs"
	"strconv"
	"strings"
	"testing"
)

// TestMigrationCaldavOrphans opens a database from before harden-server-edges
// that holds a caldav_resources row for a purged task: the row is removed, the
// row of a live task is kept, and the migration can run again.
func TestMigrationCaldavOrphans(t *testing.T) {
	ctx := context.Background()
	var name string
	var version int
	entries, _ := fs.ReadDir(migrations, "migrations")
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), "_caldav_orphans.sql") {
			name = e.Name()
			version, _ = strconv.Atoi(strings.SplitN(name, "_", 2)[0])
		}
	}
	if name == "" {
		t.Fatal("no *_caldav_orphans.sql migration embedded")
	}
	dir := t.TempDir()
	db, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, q := range []string{
		"PRAGMA user_version = " + strconv.Itoa(version-1),
		`INSERT INTO scope_fields(scope_id,entity,entity_id,field,value,ts,device) VALUES('user:u1','task','live','title','"x"',1,'A')`,
		`INSERT INTO caldav_resources(task_id,name,uid) VALUES('live','a.ics','a'),('purged','b.ics','b')`,
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
	var ids string
	if err := db.QueryRowContext(ctx, `SELECT group_concat(task_id) FROM caldav_resources`).Scan(&ids); err != nil || ids != "live" {
		t.Fatalf("caldav_resources = %q (%v), want only the live task", ids, err)
	}
	body, _ := migrations.ReadFile("migrations/" + name)
	if _, err := db.ExecContext(ctx, string(body)); err != nil {
		t.Fatalf("migration not idempotent: %v", err)
	}
}
