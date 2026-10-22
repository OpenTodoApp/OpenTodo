// Package store opens the SQLite database and applies embedded migrations.
package store

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"io/fs"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

//go:embed migrations/*.sql
var migrations embed.FS

// Open creates the data directory if needed, opens the database and migrates it.
func Open(dataDir string) (*sql.DB, error) {
	if err := os.MkdirAll(dataDir, 0o750); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}
	db, err := OpenFile(DBPath(dataDir))
	if err != nil {
		return nil, err
	}
	if err := Migrate(context.Background(), db); err != nil {
		db.Close()
		return nil, err
	}
	if err := Optimize(context.Background(), db); err != nil {
		slog.Warn("database optimize failed", "err", err)
	}
	return db, nil
}

// OptimizeInterval is how often RunOptimizer refreshes the query planner's
// statistics.
const OptimizeInterval = 24 * time.Hour

// Optimize refreshes the query planner's statistics (PRAGMA optimize) for the
// tables whose size changed a lot since they were last analysed, reading at
// most a bounded sample of each so it stays fast on a large database
// (database-concurrency). Without statistics SQLite guesses index
// selectivity, and the guess grows worse as the op log grows.
func Optimize(ctx context.Context, db *sql.DB) error {
	conn, err := db.Conn(ctx)
	if err != nil {
		return fmt.Errorf("optimize: %w", err)
	}
	defer conn.Close()
	if _, err := conn.ExecContext(ctx, "PRAGMA analysis_limit = 1000"); err != nil {
		return fmt.Errorf("optimize: %w", err)
	}
	// 0x10002: consider every table, not only those this connection queried
	// (reads run on the reader pool).
	if _, err := conn.ExecContext(ctx, "PRAGMA optimize = 0x10002"); err != nil {
		return fmt.Errorf("optimize: %w", err)
	}
	return nil
}

// RunOptimizer runs Optimize every interval until ctx ends.
func RunOptimizer(ctx context.Context, db *sql.DB, interval time.Duration, log *slog.Logger) {
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if err := Optimize(ctx, db); err != nil && ctx.Err() == nil {
				log.Warn("database optimize failed", "err", err)
			}
		}
	}
}

// DBFile is the database file name inside the data directory.
const DBFile = "opentodo.db"

// DBPath returns the database path for a data directory.
func DBPath(dataDir string) string { return filepath.Join(dataDir, DBFile) }

// Connections (OpenSpec change database-concurrency). The database is used
// through two handles:
//
//   - the writer, from Open or OpenFile: one connection, so this process never
//     contends with itself for SQLite's single write lock. Every transaction on
//     it that is not read-only starts with BEGIN IMMEDIATE (_txlock), taking the
//     write lock up front and waiting busy_timeout for it, so a second process on
//     the same file (a rolling update, `opentodo reset-owner-password`) makes it
//     wait instead of failing with SQLITE_BUSY halfway through.
//   - the reader pool, from OpenReader: ReaderConns query-only connections. In
//     WAL mode they read a consistent snapshot while the writer commits, so
//     lists, pulls and exports do not queue behind a slow write.
//
// The rule: a pure read (no write in the same transaction) may use the reader;
// anything that reads and then writes in one transaction stays on the writer.
// A reader sees every transaction committed before its own read began, so a
// read after the caller's own write sees that write. The reader is opened after
// the writer migrated the file and is closed with it; a restore replaces the
// file only while neither is open (before the tenant opens, or with the server
// stopped).

// ReaderConns is the size of the reader pool.
const ReaderConns = 4

// OpenFile opens a database file with the server's pragmas without migrating
// it: the writer handle.
func OpenFile(path string) (*sql.DB, error) {
	dsn := "file:" + path + "?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(ON)&_pragma=synchronous(NORMAL)&_txlock=immediate"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}
	// SQLite handles one writer at a time; a single connection avoids lock contention
	// and keeps memory flat on small hosts.
	db.SetMaxOpenConns(1)
	db.SetConnMaxLifetime(0)
	return db, nil
}

// OpenReader opens the reader pool of a data directory's database, which the
// writer (Open) must already have created and migrated. Its connections refuse
// writes (query_only).
func OpenReader(dataDir string) (*sql.DB, error) {
	dsn := "file:" + DBPath(dataDir) + "?_pragma=busy_timeout(5000)&_query_only=1"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open database reader: %w", err)
	}
	db.SetMaxOpenConns(ReaderConns)
	db.SetMaxIdleConns(ReaderConns)
	db.SetConnMaxLifetime(0)
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("open database reader: %w", err)
	}
	return db, nil
}

// LatestVersion is the schema version this binary migrates to: the highest
// numeric prefix among the embedded migrations.
func LatestVersion() int {
	entries, err := fs.ReadDir(migrations, "migrations")
	if err != nil {
		return 0
	}
	latest := 0
	for _, e := range entries {
		if v, err := strconv.Atoi(strings.SplitN(e.Name(), "_", 2)[0]); err == nil && v > latest {
			latest = v
		}
	}
	return latest
}

// Migrate applies every embedded migration that has not run yet: those numbered
// above PRAGMA user_version. Each applied file's name is recorded in
// schema_migrations (OpenSpec change sync-convergence), so a file numbered at or
// below user_version that was never applied (a migration merged after a higher
// one already ran) is reported with an error log instead of passing silently.
func Migrate(ctx context.Context, db *sql.DB) error {
	var current int
	if err := db.QueryRowContext(ctx, "PRAGMA user_version").Scan(&current); err != nil {
		return fmt.Errorf("read schema version: %w", err)
	}
	names, err := migrationNames()
	if err != nil {
		return err
	}
	if err := recordPastMigrations(ctx, db, names, current); err != nil {
		return err
	}
	for _, m := range names {
		if m.version <= current {
			continue
		}
		body, err := migrations.ReadFile("migrations/" + m.name)
		if err != nil {
			return err
		}
		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, string(body)); err != nil {
			tx.Rollback()
			return fmt.Errorf("apply migration %s: %w", m.name, err)
		}
		if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO schema_migrations(name, applied_at) VALUES(?, ?)`, m.name, NowMillis()); err != nil {
			tx.Rollback()
			return fmt.Errorf("record migration %s: %w", m.name, err)
		}
		if _, err := tx.ExecContext(ctx, fmt.Sprintf("PRAGMA user_version = %d", m.version)); err != nil {
			tx.Rollback()
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
		current = m.version
	}
	return migrateWorkspaces(ctx, db)
}

type migration struct {
	name    string
	version int
}

// migrationNames lists the embedded migrations in order. Two files with one
// number are refused: only one of them could ever run.
func migrationNames() ([]migration, error) {
	entries, err := fs.ReadDir(migrations, "migrations")
	if err != nil {
		return nil, err
	}
	out := make([]migration, 0, len(entries))
	seen := map[int]string{}
	for _, e := range entries {
		version, err := strconv.Atoi(strings.SplitN(e.Name(), "_", 2)[0])
		if err != nil {
			return nil, fmt.Errorf("migration %s: bad version prefix", e.Name())
		}
		if other, dup := seen[version]; dup {
			return nil, fmt.Errorf("migrations %s and %s share version %d", other, e.Name(), version)
		}
		seen[version] = e.Name()
		out = append(out, migration{name: e.Name(), version: version})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].version < out[j].version })
	return out, nil
}

// recordPastMigrations keeps schema_migrations: it creates the table, records
// as applied every file a binary without the table applied (numbered at or
// below user_version and above every recorded one: on an existing database the
// first time, all files up to user_version) and logs an error for each file at
// or below the highest recorded number that was never applied.
func recordPastMigrations(ctx context.Context, db *sql.DB, names []migration, current int) error {
	if _, err := db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		name TEXT PRIMARY KEY,
		applied_at INTEGER NOT NULL
	)`); err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}
	applied := map[string]bool{}
	rows, err := db.QueryContext(ctx, `SELECT name FROM schema_migrations`)
	if err != nil {
		return fmt.Errorf("read schema_migrations: %w", err)
	}
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			rows.Close()
			return err
		}
		applied[n] = true
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	highest := 0
	for _, m := range names {
		if applied[m.name] {
			highest = max(highest, m.version)
		}
	}
	for _, m := range names {
		if m.version > current || applied[m.name] {
			continue
		}
		if m.version > highest {
			// Applied by a binary that did not record names yet.
			if _, err := db.ExecContext(ctx, `INSERT OR IGNORE INTO schema_migrations(name, applied_at) VALUES(?, 0)`, m.name); err != nil {
				return fmt.Errorf("record migration %s: %w", m.name, err)
			}
			continue
		}
		slog.Error("database migration was never applied: it is numbered below a migration that already ran; renumber it above the latest and release again",
			"migration", m.name, "schema_version", current)
	}
	return nil
}

// NowMillis returns the current wall-clock time in Unix milliseconds.
func NowMillis() int64 { return time.Now().UnixMilli() }
