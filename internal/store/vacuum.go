package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io/fs"
	"os"
)

// SQLite's auto_vacuum modes (PRAGMA auto_vacuum). OpenTodo creates databases
// in AutoVacuumIncremental (OpenSpec `op-log-compaction`); databases created
// before that are AutoVacuumNone until the compaction job converts them once.
const (
	AutoVacuumNone        = 0
	AutoVacuumFull        = 1
	AutoVacuumIncremental = 2
)

// initAutoVacuum puts a brand-new database (no table yet) in incremental
// vacuum mode. The mode can be set freely only before the first table exists;
// afterwards it takes a full VACUUM (ConvertIncremental). Opening the file in
// WAL mode already wrote its header, so the empty file is vacuumed once too,
// which costs nothing.
func initAutoVacuum(ctx context.Context, db *sql.DB) error {
	var tables int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM sqlite_master`).Scan(&tables); err != nil {
		return fmt.Errorf("read schema: %w", err)
	}
	if tables > 0 {
		return nil
	}
	return ConvertIncremental(ctx, db)
}

// AutoVacuumMode is the database's auto_vacuum mode (AutoVacuum*).
func AutoVacuumMode(ctx context.Context, db *sql.DB) (int, error) {
	var mode int
	err := db.QueryRowContext(ctx, `PRAGMA auto_vacuum`).Scan(&mode)
	return mode, err
}

// ConvertIncremental switches an existing database to incremental vacuum mode
// by rewriting the whole file once (VACUUM). It needs free disk space of about
// the database's size while it runs, and every write waits for it (writes
// time out as busy after busy_timeout; reads continue in WAL mode). Run it on
// the writer.
func ConvertIncremental(ctx context.Context, db *sql.DB) error {
	conn, err := db.Conn(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()
	if _, err := conn.ExecContext(ctx, `PRAGMA auto_vacuum = INCREMENTAL`); err != nil {
		return fmt.Errorf("set auto_vacuum: %w", err)
	}
	if _, err := conn.ExecContext(ctx, `VACUUM`); err != nil {
		return fmt.Errorf("vacuum: %w", err)
	}
	return nil
}

// IncrementalVacuum returns up to pages free pages to the file system (in
// incremental mode; a no-op in the others) and reports how many free pages
// remain inside the file.
func IncrementalVacuum(ctx context.Context, db *sql.DB, pages int) (int64, error) {
	conn, err := db.Conn(ctx)
	if err != nil {
		return 0, err
	}
	defer conn.Close()
	// The pragma frees pages one step at a time: read its (empty) result to
	// the end so every step runs.
	rows, err := conn.QueryContext(ctx, fmt.Sprintf(`PRAGMA incremental_vacuum(%d)`, pages))
	if err != nil {
		return 0, fmt.Errorf("incremental vacuum: %w", err)
	}
	for rows.Next() {
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, fmt.Errorf("incremental vacuum: %w", err)
	}
	var free int64
	err = conn.QueryRowContext(ctx, `PRAGMA freelist_count`).Scan(&free)
	return free, err
}

// Checkpoint copies the write-ahead log back into the database without waiting
// for readers (PRAGMA wal_checkpoint(PASSIVE)).
func Checkpoint(ctx context.Context, db *sql.DB) error {
	_, err := db.ExecContext(ctx, `PRAGMA wal_checkpoint(PASSIVE)`)
	return err
}

// FileStats describes the database file.
type FileStats struct {
	PageCount int64
	FreePages int64
	PageSize  int64
	// WALBytes is the size of the write-ahead log file (0 when there is none).
	WALBytes int64
	// AutoVacuum is the auto_vacuum mode (AutoVacuum*).
	AutoVacuum int
}

// Bytes is the size of the database file (pages times page size).
func (f FileStats) Bytes() int64 { return f.PageCount * f.PageSize }

// FreeBytes is the space of the free pages inside the file.
func (f FileStats) FreeBytes() int64 { return f.FreePages * f.PageSize }

// Stats reads the database's page counts and mode; dataDir locates the
// write-ahead log ("" leaves WALBytes 0).
func Stats(ctx context.Context, db *sql.DB, dataDir string) (FileStats, error) {
	var f FileStats
	err := db.QueryRowContext(ctx, `SELECT (SELECT page_count FROM pragma_page_count()), (SELECT freelist_count FROM pragma_freelist_count()),
		(SELECT page_size FROM pragma_page_size()), (SELECT auto_vacuum FROM pragma_auto_vacuum())`).Scan(&f.PageCount, &f.FreePages, &f.PageSize, &f.AutoVacuum)
	if err != nil {
		return f, fmt.Errorf("database stats: %w", err)
	}
	if dataDir != "" {
		st, err := os.Stat(DBPath(dataDir) + "-wal")
		switch {
		case err == nil:
			f.WALBytes = st.Size()
		case !errors.Is(err, fs.ErrNotExist):
			return f, fmt.Errorf("database stats: %w", err)
		}
	}
	return f, nil
}

// FreeSpace reports the bytes available to this process on the file system
// holding dir; ok is false where the platform cannot tell (freespace_*.go).
func FreeSpace(dir string) (free uint64, ok bool, err error) { return freeSpace(dir) }
