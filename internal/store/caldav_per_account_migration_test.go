package store

import (
	"context"
	"io/fs"
	"strconv"
	"strings"
	"testing"
)

// TestMigrationCaldavResourcesPerAccount opens a database from before
// entity-id-ownership, whose caldav_resources rows were shared by every
// account: each row is kept for every account that can see its task (the
// owner of a personal task, every member of a shared project) and dropped for
// an unknown task, and the names become per account.
func TestMigrationCaldavResourcesPerAccount(t *testing.T) {
	ctx := context.Background()
	var version int
	entries, _ := fs.ReadDir(migrations, "migrations")
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), "_caldav_resources_per_account.sql") {
			version, _ = strconv.Atoi(strings.SplitN(e.Name(), "_", 2)[0])
		}
	}
	if version == 0 {
		t.Fatal("no *_caldav_resources_per_account.sql migration embedded")
	}
	dir := t.TempDir()
	db, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, q := range []string{
		"PRAGMA user_version = " + strconv.Itoa(version-1),
		"DROP TABLE caldav_resources",
		"CREATE TABLE caldav_resources (task_id TEXT PRIMARY KEY, name TEXT NOT NULL, uid TEXT NOT NULL)",
		`INSERT INTO users(id,email,name,password_hash,created_at) VALUES('u1','u1@example.com','u1','h',1),('u2','u2@example.com','u2','h',1),('u3','u3@example.com','u3','h',1)`,
		`INSERT INTO project_scopes(project_id,owner_id,created_at) VALUES('p','u1',1)`,
		`INSERT INTO project_members(project_id,user_id,role,created_at) VALUES('p','u1','owner',1),('p','u2','editor',1)`,
		`INSERT INTO scope_fields(scope_id,entity,entity_id,field,value,ts,device) VALUES
			('user:u1','task','mine','title','"x"',1,'A'),
			('project:p','task','ours','title','"y"',1,'A'),
			('project:p','task','ours','project_id','"p"',1,'A')`,
		`INSERT INTO caldav_resources(task_id,name,uid) VALUES('mine','a.ics','A'),('ours','b.ics','B'),('gone','c.ics','C')`,
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
	var rows string
	if err := db.QueryRowContext(ctx, `SELECT group_concat(user_id || ':' || task_id || ':' || name, ' ') FROM
		(SELECT * FROM caldav_resources ORDER BY user_id, task_id)`).Scan(&rows); err != nil {
		t.Fatal(err)
	}
	if rows != "u1:mine:a.ics u1:ours:b.ics u2:ours:b.ics" {
		t.Fatalf("caldav_resources = %q", rows)
	}
	// One account's rename leaves the other's name alone.
	if _, err := db.ExecContext(ctx, `INSERT INTO caldav_resources(user_id,task_id,name,uid) VALUES('u2','ours','renamed.ics','B')
		ON CONFLICT(user_id,task_id) DO UPDATE SET name = excluded.name`); err != nil {
		t.Fatal(err)
	}
	var name string
	if err := db.QueryRowContext(ctx, `SELECT name FROM caldav_resources WHERE user_id = 'u1' AND task_id = 'ours'`).Scan(&name); err != nil || name != "b.ics" {
		t.Fatalf("u1's name = %q (%v)", name, err)
	}
	// An account's rows go with it.
	if _, err := db.ExecContext(ctx, `DELETE FROM users WHERE id = 'u2'`); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM caldav_resources WHERE user_id = 'u2'`).Scan(&n); err != nil || n != 0 {
		t.Fatalf("u2 rows after deletion = %d (%v)", n, err)
	}
}
