package backup

import (
	"context"
	"database/sql"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/store"
)

func auditRows(t *testing.T, db *sql.DB, name string) (n int, outcome string) {
	t.Helper()
	rows, err := db.Query(`SELECT outcome FROM audit_events WHERE name = ? ORDER BY id`, name)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	for rows.Next() {
		n++
		rows.Scan(&outcome)
	}
	return n, outcome
}

// Runs record backup.created (failure outcome for a failed run); a CLI restore
// is recorded as backup.restored when the server next starts.
func TestBackupAuditEvents(t *testing.T) {
	e := newTestEnv(t)
	ctx := context.Background()
	quiet := slog.New(slog.NewTextHandler(io.Discard, nil))
	e.svc.audit = audit.New(e.db, quiet)
	seed(t, e)
	archive := backupOnce(t, e, "")
	if n, out := auditRows(t, e.db, "backup.created"); n != 1 || out != "success" {
		t.Fatalf("backup.created rows = %d outcome %q", n, out)
	}
	bad := DefaultSettings()
	bad.Local.Dir = "/proc/opentodo-cannot-write-here"
	if _, err := e.svc.SaveSettings(ctx, bad, SecretUpdate{}); err != nil {
		t.Fatal(err)
	}
	if r, _ := e.svc.RunNow(ctx, KindManual); r.Status != StatusFailed {
		t.Fatalf("run = %+v", r)
	}
	if n, out := auditRows(t, e.db, "backup.created"); n != 2 || out != "failure" {
		t.Fatalf("failed run: rows = %d outcome %q", n, out)
	}

	e.db.Close()
	if _, err := Restore(RestoreOptions{DataDir: e.dir, Archive: archive}); err != nil {
		t.Fatal(err)
	}
	db, err := store.Open(e.dir)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	svc := New(db, e.dir, Options{Log: quiet, Audit: audit.New(db, quiet), Now: func() time.Time { return time.Now() }})
	runCtx, cancel := context.WithCancel(ctx)
	cancel()
	svc.Start(runCtx)
	if n, out := auditRows(t, db, "backup.restored"); n != 1 || out != "success" {
		t.Fatalf("backup.restored rows = %d outcome %q", n, out)
	}
	// Recorded once: a second start does not repeat it.
	svc.Start(runCtx)
	if n, _ := auditRows(t, db, "backup.restored"); n != 1 {
		t.Fatalf("backup.restored recorded %d times", n)
	}
}
