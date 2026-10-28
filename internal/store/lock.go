package store

import (
	"errors"
	"fmt"
	"io/fs"
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
		return nil, notWritable(dataDir, fmt.Errorf("create data dir: %w", err))
	}
	f, err := os.OpenFile(filepath.Join(dataDir, name), os.O_RDWR|os.O_CREATE, 0o600)
	if err != nil {
		return nil, notWritable(dataDir, fmt.Errorf("open lock file: %w", err))
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

// DataDirGuide is where the guide explains data directory ownership.
const DataDirGuide = "https://github.com/OpenTodoApp/OpenTodo/blob/main/docs/self-hosting/docker.md#bind-mounts"

// notWritable explains a permission error on the data directory (OpenSpec
// change unwritable-data-dir, issue #511): the lock file is the first thing the
// server writes, so a folder the process cannot write always fails here. The
// message names the user and group the process runs as and the command that
// gives the folder to them; other errors are returned as they are.
func notWritable(dataDir string, err error) error {
	if !errors.Is(err, fs.ErrPermission) {
		return err
	}
	uid, gid := os.Getuid(), os.Getgid()
	if uid < 0 {
		return fmt.Errorf("%w: the data directory %s is not writable for this process; give it write permission and start again (%s)", err, dataDir, DataDirGuide)
	}
	return fmt.Errorf("%w: the data directory %s is not writable for user %d (group %d), the user this process runs as. "+
		"Give the folder mounted at %s to that user and start again, for example: chown -R %d:%d <that folder> (%s)",
		err, dataDir, uid, gid, dataDir, uid, gid, DataDirGuide)
}
