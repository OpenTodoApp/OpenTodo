package importer

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"modernc.org/sqlite"
	sqlite3 "modernc.org/sqlite/lib"
)

// Uploaded SQLite databases (Things, Tududi) are read the same way: from a
// private temporary copy, read-only, deleted when the read ends.
//
// The uploaded file is someone's input, and SQLite runs expressions stored in a
// schema while it reads (generated columns, virtual tables). So the tables read
// must be plain tables of stored values (plainTables), no value may be longer
// than sqliteMaxValue (SQLITE_LIMIT_LENGTH: a longer value, stored or computed,
// fails with "string or blob too big"), and the whole read stops after
// sqliteTimeout.
const (
	sqliteMaxValue = 1 << 20
	sqliteTimeout  = 30 * time.Second
)

// sqliteCopy is an open, read-only private copy of an uploaded database.
type sqliteCopy struct {
	conn  *sql.Conn
	ctx   context.Context
	close func()
}

// openSQLiteCopy writes data (and a WAL, when given) to a private temporary
// directory and opens it read-only on one pinned connection. close removes the
// copy.
func openSQLiteCopy(data, wal []byte, opts Options, app string) (*sqliteCopy, error) {
	// The parent is the server's configured temporary directory, never a
	// request's value; refuse anything that could climb out of it.
	parent := filepath.Clean(opts.tempDir)
	if opts.tempDir == "" {
		parent = ""
	} else if strings.Contains(parent, "..") {
		return nil, fmt.Errorf("%s: temporary directory %q is not a clean path", app, opts.tempDir)
	}
	dir, err := os.MkdirTemp(parent, "sqlite-import-")
	if err != nil {
		return nil, fmt.Errorf("%s: temporary directory: %w", app, err)
	}
	cleanup := []func(){func() { os.RemoveAll(dir) }}
	closeAll := func() {
		for i := len(cleanup) - 1; i >= 0; i-- {
			cleanup[i]()
		}
	}
	file := filepath.Join(dir, "main.sqlite")
	if err := os.WriteFile(file, data, 0o600); err != nil {
		closeAll()
		return nil, fmt.Errorf("%s: temporary copy: %w", app, err)
	}
	dsn := "file:" + file + "?mode=ro&immutable=1"
	if len(wal) > 0 {
		if err := os.WriteFile(file+"-wal", wal, 0o600); err != nil {
			closeAll()
			return nil, fmt.Errorf("%s: temporary copy: %w", app, err)
		}
		dsn = "file:" + file + "?mode=ro" // the private copy may grow a -shm file next to it
	}
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		closeAll()
		return nil, &FileError{fmt.Sprintf("cannot open the database: %v", err)}
	}
	cleanup = append(cleanup, func() { db.Close() })
	db.SetMaxOpenConns(1)
	ctx, cancel := context.WithTimeout(context.Background(), sqliteTimeout)
	cleanup = append(cleanup, cancel)
	// One pinned connection: the pragma and the length limit belong to it.
	conn, err := db.Conn(ctx)
	if err != nil {
		closeAll()
		return nil, &FileError{fmt.Sprintf("cannot open the database: %v", err)}
	}
	cleanup = append(cleanup, func() { conn.Close() })
	if _, err := conn.ExecContext(ctx, "PRAGMA query_only = 1"); err != nil {
		closeAll()
		return nil, &FileError{fmt.Sprintf("cannot read the database: %v", err)}
	}
	if _, err := sqlite.Limit(conn, sqlite3.SQLITE_LIMIT_LENGTH, sqliteMaxValue); err != nil {
		closeAll()
		return nil, fmt.Errorf("%s: length limit: %w", app, err)
	}
	return &sqliteCopy{conn: conn, ctx: ctx, close: closeAll}, nil
}

// tables lists the database's table names.
func (c *sqliteCopy) tables() (map[string]bool, error) {
	have := map[string]bool{}
	rows, err := c.conn.QueryContext(c.ctx, "SELECT name FROM sqlite_master WHERE type = 'table'")
	if err != nil {
		return nil, &FileError{fmt.Sprintf("cannot read the database: %v", err)}
	}
	defer rows.Close()
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			return nil, &FileError{fmt.Sprintf("cannot read the database: %v", err)}
		}
		have[n] = true
	}
	if err := rows.Err(); err != nil {
		return nil, &FileError{fmt.Sprintf("cannot read the database: %v", err)}
	}
	return have, nil
}

// columns lists a table's column names.
func (c *sqliteCopy) columns(table string) (map[string]bool, error) {
	have := map[string]bool{}
	rows, err := c.conn.QueryContext(c.ctx, "SELECT name FROM pragma_table_info(?)", table)
	if err != nil {
		return nil, &FileError{fmt.Sprintf("cannot read the database: %v", err)}
	}
	defer rows.Close()
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			return nil, &FileError{fmt.Sprintf("cannot read the database: %v", err)}
		}
		have[n] = true
	}
	return have, rows.Err()
}

// plainTables refuses tables that would run the file's own expressions while
// they are read: a virtual table (its module computes the rows) or a generated
// column (its expression runs for every row read). table_xinfo reports both as
// hidden columns (1 for a virtual table's hidden column, 2 and 3 for generated
// ones). what names the expected database in the refusal ("a Things database").
func (c *sqliteCopy) plainTables(names []string, what string) error {
	for _, name := range names {
		var ddl string
		if err := c.conn.QueryRowContext(c.ctx, "SELECT COALESCE(sql, '') FROM sqlite_master WHERE type = 'table' AND name = ?", name).Scan(&ddl); err != nil {
			return &FileError{fmt.Sprintf("cannot read the database: %v", err)}
		}
		if strings.HasPrefix(strings.ToUpper(strings.TrimSpace(ddl)), "CREATE VIRTUAL") {
			return &FileError{fmt.Sprintf("not %s (%s is a virtual table)", what, name)}
		}
		var hidden int
		if err := c.conn.QueryRowContext(c.ctx, "SELECT COUNT(*) FROM pragma_table_xinfo(?) WHERE hidden != 0", name).Scan(&hidden); err != nil {
			return &FileError{fmt.Sprintf("cannot read the database: %v", err)}
		}
		if hidden > 0 {
			return &FileError{fmt.Sprintf("not %s (%s has generated columns)", what, name)}
		}
	}
	return nil
}
