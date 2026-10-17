package store

import (
	"context"
	"io/fs"
	"strconv"
	"strings"
	"testing"
)

// TestMigrationSharedAttachments opens a database from before
// harden-links-and-sharing in which alice shared project p but the attachment
// of its task t1 stayed in her personal scope: the attachment's fields and ops
// move to project:p and bob's history replay restarts. An attachment on a
// personal task, and one in the scope of an account that is not a member, stay
// where they are. The migration can run again.
func TestMigrationSharedAttachments(t *testing.T) {
	ctx := context.Background()
	var name string
	var version int
	entries, _ := fs.ReadDir(migrations, "migrations")
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), "_shared_attachments.sql") {
			name = e.Name()
			version, _ = strconv.Atoi(strings.SplitN(name, "_", 2)[0])
		}
	}
	if name == "" {
		t.Fatal("no *_shared_attachments.sql migration embedded")
	}
	dir := t.TempDir()
	db, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, q := range []string{
		"PRAGMA user_version = " + strconv.Itoa(version-1),
		`INSERT INTO users(id,email,password_hash,created_at) VALUES('alice','a@example.com','h',1),('bob','b@example.com','h',1),('mallory','m@example.com','h',1)`,
		`INSERT INTO project_scopes(project_id,owner_id,created_at) VALUES('p','alice',1)`,
		`INSERT INTO project_members(project_id,user_id,role,added_by,created_at,backfill) VALUES('p','alice','owner','alice',1,0),('p','bob','editor','alice',1,1)`,
		`INSERT INTO member_backfills(project_id,user_id,device,upto_seq,done_seq) VALUES('p','bob','B',10,10)`,
		`INSERT INTO scope_fields(scope_id,entity,entity_id,field,value,ts,device) VALUES
			('project:p','task','t1','project_id','"p"',1,'A'),
			('user:alice','task','own','project_id','null',1,'A'),
			('user:alice','attachment','a1','task_id','"t1"',1,'A'),
			('user:alice','attachment','a1','name','"photo.png"',1,'A'),
			('user:alice','attachment','a2','task_id','"own"',1,'A'),
			('user:mallory','attachment','m1','task_id','"t1"',1,'M')`,
		`INSERT INTO ops(seq,user_id,op_id,entity,entity_id,field,value,ts,device,received_at) VALUES
			(1,'alice','o1','task','t1','project_id','"p"',1,'A',1),
			(2,'alice','o2','attachment','a1','task_id','"t1"',1,'A',1),
			(3,'alice','o3','attachment','a1','name','"photo.png"',1,'A',1),
			(4,'alice','o4','attachment','a2','task_id','"own"',1,'A',1),
			(5,'mallory','o5','attachment','m1','task_id','"t1"',1,'M',1)`,
		`INSERT INTO op_scopes(seq,scope_id) VALUES(1,'project:p'),(2,'user:alice'),(3,'user:alice'),(4,'user:alice'),(5,'user:mallory')`,
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
	check := func() {
		t.Helper()
		var got string
		db.QueryRowContext(ctx, `SELECT group_concat(entity_id || '@' || scope_id, ' ') FROM (SELECT DISTINCT entity_id, scope_id FROM scope_fields WHERE entity = 'attachment' ORDER BY entity_id)`).Scan(&got)
		if want := "a1@project:p a2@user:alice m1@user:mallory"; got != want {
			t.Fatalf("attachment scopes = %q, want %q", got, want)
		}
		db.QueryRowContext(ctx, `SELECT group_concat(seq || '@' || scope_id, ' ') FROM (SELECT seq, scope_id FROM op_scopes ORDER BY seq)`).Scan(&got)
		if want := "1@project:p 2@project:p 3@project:p 4@user:alice 5@user:mallory"; got != want {
			t.Fatalf("op scopes = %q, want %q", got, want)
		}
	}
	check()
	var n int
	db.QueryRowContext(ctx, `SELECT COUNT(*) FROM member_backfills`).Scan(&n)
	if n != 0 {
		t.Fatalf("bob's replay was not restarted (%d rows)", n)
	}
	body, _ := migrations.ReadFile("migrations/" + name)
	if _, err := db.ExecContext(ctx, string(body)); err != nil {
		t.Fatalf("migration not idempotent: %v", err)
	}
	check()
}
