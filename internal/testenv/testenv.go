// Package testenv is shared test support (improvement plan S4): a database that
// is migrated once and copied per test, instead of every test running all
// migrations on an empty file. Imported by tests only.
package testenv

import (
	"database/sql"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"

	"github.com/pixari/opentodo/internal/store"
)

var (
	once     sync.Once
	template string
	failed   error
)

// templatePath returns a migrated, checkpointed database file for this
// binary's migrations. It lives in the system temp directory under the
// migrations' digest, so the test binaries of every package (and later runs)
// share it; a changed migration gets a new file.
func templatePath() (string, error) {
	once.Do(func() {
		dir := filepath.Join(os.TempDir(), "opentodo-test-template-"+store.MigrationsDigest()[:16])
		template = filepath.Join(dir, store.DBFile)
		if _, err := os.Stat(template); err == nil {
			return
		}
		failed = build(dir)
	})
	return template, failed
}

// build migrates a fresh database in a temporary directory and renames it to
// dir; when another test binary won the race, its copy is kept.
func build(dir string) error {
	tmp, err := os.MkdirTemp(os.TempDir(), "opentodo-test-template-build-*")
	if err != nil {
		return err
	}
	db, err := store.Open(tmp)
	if err != nil {
		_ = os.RemoveAll(tmp)
		return err
	}
	_, err = db.Exec("PRAGMA wal_checkpoint(TRUNCATE)")
	if cerr := db.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		_ = os.RemoveAll(tmp)
		return err
	}
	for _, f := range []string{"-wal", "-shm"} {
		_ = os.Remove(filepath.Join(tmp, store.DBFile+f))
	}
	if err := os.Rename(tmp, dir); err != nil {
		_ = os.RemoveAll(tmp)
		if _, serr := os.Stat(filepath.Join(dir, store.DBFile)); serr != nil {
			return fmt.Errorf("test database template: %w", err)
		}
	}
	return nil
}

// Open is store.Open for tests: dataDir gets a copy of the migrated template,
// then store.Open opens it and finds nothing left to migrate.
func Open(dataDir string) (*sql.DB, error) {
	src, err := templatePath()
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(dataDir, 0o750); err != nil {
		return nil, err
	}
	if err := copyFile(src, store.DBPath(dataDir)); err != nil {
		return nil, fmt.Errorf("copy test database: %w", err)
	}
	return store.Open(dataDir)
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}
