// Package storetest opens migrated test databases quickly. Applying every
// embedded migration to a new file takes about 150 ms, and over 1.5 s under the
// race detector, which most tests paid once or more: the nightly race job ran
// past its time limit (issue #854). Open migrates one template database per
// test process and gives each test a copy of its file, then opens that copy
// with store.Open, which finds nothing to migrate.
//
// Tests of the migrations themselves keep calling store.Open on a new
// directory. Test code only: the server never links this package.
package storetest

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	gosync "sync"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/store"
)

var template struct {
	once gosync.Once
	file []byte
	err  error
}

// Open is store.Open(t.TempDir()) from the template: a migrated database in a
// new temporary directory, closed when the test ends. It returns the database
// and its data directory.
func Open(t testing.TB) (*sql.DB, string) {
	t.Helper()
	dir := t.TempDir()
	db, err := OpenDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db, dir
}

// OpenDir is store.Open(dir) from the template for a directory that holds no
// database yet. The caller closes the database.
func OpenDir(dir string) (*sql.DB, error) {
	file, err := migrated()
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return nil, fmt.Errorf("storetest: %w", err)
	}
	path := store.DBPath(dir)
	if _, err := os.Stat(path); err == nil {
		return nil, fmt.Errorf("storetest: %s already holds a database", dir)
	}
	if err := os.WriteFile(path, file, 0o600); err != nil {
		return nil, fmt.Errorf("storetest: %w", err)
	}
	db, err := store.Open(dir)
	if err != nil {
		return nil, err
	}
	// Each database has its own log generation (migration 0007), as a new
	// file would: restores and pulls tell databases apart by it.
	if _, err := db.Exec(`UPDATE settings SET value = lower(hex(randomblob(16))) WHERE key = 'generation'`); err != nil {
		db.Close()
		return nil, fmt.Errorf("storetest: new generation: %w", err)
	}
	return db, nil
}

// migrated is the template's file: every migration applied, the write-ahead
// log folded into the file, read once per process.
func migrated() ([]byte, error) {
	template.once.Do(func() {
		dir, err := os.MkdirTemp("", "storetest-")
		if err != nil {
			template.err = err
			return
		}
		defer os.RemoveAll(dir)
		db, err := store.Open(dir)
		if err != nil {
			template.err = err
			return
		}
		if _, err := db.ExecContext(context.Background(), "PRAGMA wal_checkpoint(TRUNCATE)"); err != nil {
			db.Close()
			template.err = fmt.Errorf("storetest: checkpoint: %w", err)
			return
		}
		if err := db.Close(); err != nil {
			template.err = err
			return
		}
		template.file, template.err = os.ReadFile(store.DBPath(dir))
	})
	return template.file, template.err
}
