package store

import (
	"context"
	"fmt"
	"io/fs"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

// TestMigrateSharingBackfillsPersonalScopes upgrades a database written before
// project sharing: every existing op and materialized field ends up in the
// author's personal scope (user:<id>), nothing is rewritten, and re-running the
// migration never resets a scope that was relabelled since.
func TestMigrateSharingBackfillsPersonalScopes(t *testing.T) {
	ctx := context.Background()
	db, err := OpenFile(filepath.Join(t.TempDir(), DBFile))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	entries, _ := fs.ReadDir(migrations, "migrations")
	sharing, sharingName, prev := 0, "", 0
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), "_project_sharing.sql") {
			sharing, _ = strconv.Atoi(strings.SplitN(e.Name(), "_", 2)[0])
			sharingName = e.Name()
		}
	}
	if sharing == 0 {
		t.Fatal("project sharing migration not found")
	}
	for _, e := range entries {
		v, _ := strconv.Atoi(strings.SplitN(e.Name(), "_", 2)[0])
		if v >= sharing {
			continue
		}
		body, _ := migrations.ReadFile("migrations/" + e.Name())
		if _, err := db.ExecContext(ctx, string(body)); err != nil {
			t.Fatalf("%s: %v", e.Name(), err)
		}
		prev = v
	}
	if _, err := db.ExecContext(ctx, fmt.Sprintf("PRAGMA user_version = %d", prev)); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `
		INSERT INTO users(id,email,password_hash,created_at) VALUES('u1','a@example.com','h',1),('u2','b@example.com','h',1);
		INSERT INTO ops(user_id,op_id,entity,entity_id,field,value,ts,device,received_at) VALUES
		  ('u1','o1','project','p1','name','"Home"',10,'d1',10),
		  ('u1','o2','task','t1','title','"Milk"',11,'d1',11),
		  ('u2','o1','task','t9','title','"Other"',12,'d2',12);
		INSERT INTO fields(user_id,entity,entity_id,field,value,ts,device) VALUES
		  ('u1','project','p1','name','"Home"',10,'d1'),
		  ('u1','task','t1','title','"Milk"',11,'d1'),
		  ('u2','task','t9','title','"Other"',12,'d2');`); err != nil {
		t.Fatal(err)
	}
	if err := Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	count := func(q string, args ...any) int {
		t.Helper()
		var n int
		if err := db.QueryRowContext(ctx, q, args...).Scan(&n); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
		return n
	}
	if n := count(`SELECT COUNT(*) FROM ops o JOIN op_scopes s ON s.seq = o.seq WHERE s.scope_id = 'user:' || o.user_id`); n != 3 {
		t.Fatalf("ops in their author's personal scope = %d, want 3", n)
	}
	if n := count(`SELECT COUNT(*) FROM scope_fields WHERE scope_id = 'user:u1'`); n != 2 {
		t.Fatalf("u1 fields = %d, want 2", n)
	}
	if n := count(`SELECT COUNT(*) FROM scope_fields WHERE scope_id = 'user:u2' AND entity_id = 't9' AND value = '"Other"'`); n != 1 {
		t.Fatal("u2 field missing")
	}
	if n := count(`SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'fields'`); n != 0 {
		t.Fatal("the unscoped fields table should be gone")
	}
	// Relabel as a first share would, then re-run the migration: nothing resets.
	if _, err := db.ExecContext(ctx, `UPDATE op_scopes SET scope_id = 'project:p1' WHERE seq = 1;
		UPDATE scope_fields SET scope_id = 'project:p1' WHERE entity_id = 'p1'`); err != nil {
		t.Fatal(err)
	}
	body, _ := migrations.ReadFile("migrations/" + sharingName)
	if _, err := db.ExecContext(ctx, string(body)); err != nil {
		t.Fatalf("re-running %s: %v", sharingName, err)
	}
	if n := count(`SELECT COUNT(*) FROM op_scopes WHERE seq = 1 AND scope_id = 'project:p1'`); n != 1 {
		t.Fatal("re-run reset a relabelled op scope")
	}
	if n := count(`SELECT COUNT(*) FROM scope_fields WHERE entity_id = 'p1'`); n != 1 {
		t.Fatal("re-run duplicated or reset a relabelled field")
	}
	if n := count(`SELECT COUNT(*) FROM ops`); n != 3 {
		t.Fatalf("ops = %d, want 3 (never rewritten)", n)
	}
}
