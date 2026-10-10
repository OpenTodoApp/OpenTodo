package store

import (
	"context"
	"database/sql"
	"fmt"
	"io/fs"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

// latestVersion is the highest migration number embedded in the binary.
func latestVersion(t *testing.T) int {
	t.Helper()
	entries, err := fs.ReadDir(migrations, "migrations")
	if err != nil {
		t.Fatal(err)
	}
	max := 0
	for _, e := range entries {
		v, err := strconv.Atoi(strings.SplitN(e.Name(), "_", 2)[0])
		if err != nil {
			t.Fatalf("bad migration name %s", e.Name())
		}
		if v > max {
			max = v
		}
	}
	return max
}

// TestMigrationWebhooks upgrades a database that stopped before the webhooks
// migration and checks the new tables, the shared settings table and that
// existing data survives.
func TestMigrationWebhooks(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "opentodo.db")
	db, err := sql.Open("sqlite", "file:"+path+"?_pragma=foreign_keys(ON)")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	db.SetMaxOpenConns(1)

	// Apply every migration before 0004 by hand, as an older binary would have.
	entries, _ := fs.ReadDir(migrations, "migrations")
	prev := 0
	for _, e := range entries {
		v, _ := strconv.Atoi(strings.SplitN(e.Name(), "_", 2)[0])
		if v >= 4 {
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
	// Another change may have created the shared settings table already.
	if _, err := db.ExecContext(ctx, `CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER);
		INSERT INTO settings(key,value,updated_at) VALUES('other.key','x',1);
		INSERT INTO users(id,email,password_hash,created_at) VALUES('u1','a@example.com','h',1);`); err != nil {
		t.Fatal(err)
	}

	if err := Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	var version int
	_ = db.QueryRowContext(ctx, "PRAGMA user_version").Scan(&version)
	if version < 4 {
		t.Fatalf("user_version = %d", version)
	}
	var v string
	if err := db.QueryRowContext(ctx, "SELECT value FROM settings WHERE key='other.key'").Scan(&v); err != nil || v != "x" {
		t.Fatalf("existing setting lost: %q %v", v, err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO webhooks(id,user_id,url,secret,events,created_at,updated_at)
		VALUES('w1','u1','https://example.com/hook','whsec_x','["task.created"]',1,1)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO webhook_deliveries(id,webhook_id,event,payload,created_at) VALUES('d1','w1','task.created','{}',1)`); err != nil {
		t.Fatal(err)
	}
	var status string
	var enabled, failures int
	_ = db.QueryRowContext(ctx, "SELECT enabled, consecutive_failures FROM webhooks WHERE id='w1'").Scan(&enabled, &failures)
	_ = db.QueryRowContext(ctx, "SELECT status FROM webhook_deliveries WHERE id='d1'").Scan(&status)
	if enabled != 1 || failures != 0 || status != "pending" {
		t.Fatalf("defaults: enabled=%d failures=%d status=%s", enabled, failures, status)
	}
	// Deleting the user cascades to webhooks and their deliveries.
	if _, err := db.ExecContext(ctx, "DELETE FROM users WHERE id='u1'"); err != nil {
		t.Fatal(err)
	}
	var n int
	_ = db.QueryRowContext(ctx, "SELECT COUNT(*) FROM webhook_deliveries").Scan(&n)
	if n != 0 {
		t.Fatalf("deliveries not cascaded: %d", n)
	}
}
