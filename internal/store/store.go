// Package store opens the SQLite database and applies embedded migrations.
package store

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"io/fs"
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
	return db, nil
}

// DBFile is the database file name inside the data directory.
const DBFile = "opentodo.db"

// DBPath returns the database path for a data directory.
func DBPath(dataDir string) string { return filepath.Join(dataDir, DBFile) }

// OpenFile opens a database file with the server's pragmas without migrating it.
func OpenFile(path string) (*sql.DB, error) {
	dsn := "file:" + path + "?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(ON)&_pragma=synchronous(NORMAL)"
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

// Migrate applies every embedded migration that has not run yet.
func Migrate(ctx context.Context, db *sql.DB) error {
	var current int
	if err := db.QueryRowContext(ctx, "PRAGMA user_version").Scan(&current); err != nil {
		return fmt.Errorf("read schema version: %w", err)
	}
	entries, err := fs.ReadDir(migrations, "migrations")
	if err != nil {
		return err
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		names = append(names, e.Name())
	}
	sort.Strings(names)
	for _, name := range names {
		version, err := strconv.Atoi(strings.SplitN(name, "_", 2)[0])
		if err != nil {
			return fmt.Errorf("migration %s: bad version prefix", name)
		}
		if version <= current {
			continue
		}
		body, err := migrations.ReadFile("migrations/" + name)
		if err != nil {
			return err
		}
		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, string(body)); err != nil {
			tx.Rollback()
			return fmt.Errorf("apply migration %s: %w", name, err)
		}
		if _, err := tx.ExecContext(ctx, fmt.Sprintf("PRAGMA user_version = %d", version)); err != nil {
			tx.Rollback()
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
		current = version
	}
	return nil
}

// NowMillis returns the current wall-clock time in Unix milliseconds.
func NowMillis() int64 { return time.Now().UnixMilli() }
