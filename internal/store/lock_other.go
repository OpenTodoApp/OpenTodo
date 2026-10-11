//go:build !unix

package store

import "os"

// On platforms without flock the lock is best-effort: restore still refuses when
// SQLite reports the database busy (see internal/backup), and every server runs
// the background jobs.
func tryLock(*os.File, bool) error { return nil }

func unlock(*os.File) {}
