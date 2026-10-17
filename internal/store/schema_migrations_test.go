package store

import (
	"bytes"
	"context"
	"database/sql"
	"log/slog"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

// TestMigrateRecordsAppliedNames: every applied file is recorded in
// schema_migrations, on a fresh database and on one migrated by a binary that
// did not record names yet (sync-convergence).
func TestMigrateRecordsAppliedNames(t *testing.T) {
	ctx := context.Background()
	byVersion, latest := embeddedMigrations(t)
	db, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if n := count(t, db, `SELECT COUNT(*) FROM schema_migrations`); n != len(byVersion) {
		t.Fatalf("recorded = %d, want %d", n, len(byVersion))
	}

	// An older binary migrated to latest-1 and never recorded names.
	old, err := OpenFile(filepath.Join(t.TempDir(), "old.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer old.Close()
	for v := 1; v < latest; v++ {
		name, ok := byVersion[v]
		if !ok {
			continue
		}
		body, err := migrations.ReadFile("migrations/" + name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := old.ExecContext(ctx, string(body)); err != nil {
			t.Fatalf("%s: %v", name, err)
		}
	}
	if _, err := old.ExecContext(ctx, "PRAGMA user_version = "+strconv.Itoa(latest-1)); err != nil {
		t.Fatal(err)
	}
	logs := captureLogs(t)
	if err := Migrate(ctx, old); err != nil {
		t.Fatal(err)
	}
	if n := count(t, old, `SELECT COUNT(*) FROM schema_migrations`); n != len(byVersion) {
		t.Fatalf("recorded after upgrade = %d, want %d", n, len(byVersion))
	}
	if logs.Len() != 0 {
		t.Fatalf("unexpected log: %s", logs)
	}
}

// TestMigrateReportsSkippedMigration: a file numbered below the schema version
// that never ran (merged after a higher one) is logged as an error instead of
// passing silently (sync-convergence).
func TestMigrateReportsSkippedMigration(t *testing.T) {
	ctx := context.Background()
	db, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.ExecContext(ctx, `DELETE FROM schema_migrations WHERE name = '0019_caldav.sql'`); err != nil {
		t.Fatal(err)
	}
	logs := captureLogs(t)
	if err := Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(logs.String(), "level=ERROR") || !strings.Contains(logs.String(), "0019_caldav.sql") {
		t.Fatalf("log = %q", logs)
	}
}

func captureLogs(t *testing.T) *bytes.Buffer {
	t.Helper()
	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, nil)))
	t.Cleanup(func() { slog.SetDefault(prev) })
	return &buf
}

func count(t *testing.T, db *sql.DB, q string) int {
	t.Helper()
	var n int
	if err := db.QueryRow(q).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

// TestMigrationBackfillConfirm: the served-page side table can be created again
// and loses its row with the member_backfills row (sync-convergence).
func TestMigrationBackfillConfirm(t *testing.T) {
	ctx := context.Background()
	db, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	body, err := migrations.ReadFile("migrations/0036_backfill_confirm.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, string(body)); err != nil {
		t.Fatalf("re-run: %v", err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO member_backfills(project_id,user_id,device,upto_seq,done_seq) VALUES('p','u','d',9,0);
		INSERT INTO member_backfill_served(project_id,user_id,device,served_seq) VALUES('p','u','d',5);
		DELETE FROM member_backfills WHERE project_id = 'p'`); err != nil {
		t.Fatal(err)
	}
	if n := count(t, db, `SELECT COUNT(*) FROM member_backfill_served`); n != 0 {
		t.Fatalf("served rows left = %d", n)
	}
}
