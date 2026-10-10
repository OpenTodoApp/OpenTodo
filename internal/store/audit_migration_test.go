package store

import (
	"context"
	"testing"
)

// TestMigrationAuditLog checks the audit_events table and the shared settings
// table (with its agreed shape) after migrating.
func TestMigrationAuditLog(t *testing.T) {
	db, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()
	var version int
	if err := db.QueryRowContext(ctx, "PRAGMA user_version").Scan(&version); err != nil {
		t.Fatal(err)
	}
	if want := LatestVersion(); version != want {
		t.Fatalf("user_version = %d, want %d", version, want)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO audit_events(ts,name,outcome,actor_id,target_id,ip,user_agent,details)
		VALUES(1,'logout','success','u',NULL,NULL,'ua','{}')`); err != nil {
		t.Fatalf("audit_events shape: %v", err)
	}
	// The shared settings table may have been created by an earlier migration
	// (webhooks) with nullable columns; the audit code writes all three.
	if _, err := db.ExecContext(ctx, "INSERT INTO settings(key,value,updated_at) VALUES('audit.log_ip','false',7)"); err != nil {
		t.Fatalf("settings shape: %v", err)
	}
	var updatedAt int64
	if err := db.QueryRowContext(ctx, "SELECT updated_at FROM settings WHERE key='audit.log_ip'").Scan(&updatedAt); err != nil || updatedAt != 7 {
		t.Fatalf("settings.updated_at = %d, %v", updatedAt, err)
	}
	for _, idx := range []string{"audit_events_ts", "audit_events_actor_ts", "audit_events_target_ts", "audit_events_name_ts"} {
		var name string
		if err := db.QueryRowContext(ctx, "SELECT name FROM sqlite_master WHERE type='index' AND name=?", idx).Scan(&name); err != nil {
			t.Fatalf("index %s missing: %v", idx, err)
		}
	}
}
