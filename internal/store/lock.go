package store

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// ErrLocked is returned when another process holds a conflicting lock on the
// data directory.
var ErrLocked = errors.New("data directory is in use by another opentodo process")

// LockFile is the advisory data-directory lock inside the data directory.
const LockFile = "opentodo.lock"

// JobsLockFile elects the one server process that runs background jobs.
const JobsLockFile = "opentodo-jobs.lock"

// Lock takes the data-directory lock exclusively for maintenance commands
// (`opentodo restore`, `mfa-reset`, `reset-owner-password`): it fails while any
// server runs, and a server cannot start while it is held. release drops it.
func Lock(dataDir string) (release func(), err error) {
	return lockFile(dataDir, LockFile, false)
}

// LockShared takes the data-directory lock shared, for a server process. Several
// servers may hold it at once, so a new container can start before the old one
// stops (rolling updates); a maintenance command holding Lock makes it fail.
func LockShared(dataDir string) (release func(), err error) {
	return lockFile(dataDir, LockFile, true)
}

// LockJobs tries to become the process that runs background jobs (schedulers,
// queue workers). It never blocks: ErrLocked means another server runs them; try
// again later. The kernel drops the lock when the holder exits, even on a crash.
func LockJobs(dataDir string) (release func(), err error) {
	return lockFile(dataDir, JobsLockFile, false)
}

func lockFile(dataDir, name string, shared bool) (func(), error) {
	if err := os.MkdirAll(dataDir, 0o750); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}
	f, err := os.OpenFile(filepath.Join(dataDir, name), os.O_RDWR|os.O_CREATE, 0o600)
	if err != nil {
		return nil, fmt.Errorf("open lock file: %w", err)
	}
	if err := tryLock(f, shared); err != nil {
		f.Close()
		return nil, err
	}
	return func() {
		unlock(f)
		f.Close()
	}, nil
}
