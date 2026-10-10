package store

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// ErrLocked is returned by Lock when another process holds the data directory.
var ErrLocked = errors.New("data directory is in use by another opentodo process")

// LockFile is the advisory lock file inside the data directory.
const LockFile = "opentodo.lock"

// Lock takes an exclusive advisory lock on the data directory for the life of the
// process. The server holds it while running; `opentodo restore` takes it too, so a
// restore can never replace the database under a live server (and two servers
// cannot share one directory). release drops the lock.
func Lock(dataDir string) (release func(), err error) {
	if err := os.MkdirAll(dataDir, 0o750); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}
	f, err := os.OpenFile(filepath.Join(dataDir, LockFile), os.O_RDWR|os.O_CREATE, 0o600)
	if err != nil {
		return nil, fmt.Errorf("open lock file: %w", err)
	}
	if err := tryLock(f); err != nil {
		f.Close()
		return nil, err
	}
	return func() {
		unlock(f)
		f.Close()
	}, nil
}
