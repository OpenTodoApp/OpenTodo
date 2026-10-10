//go:build !unix

package store

import "os"

// On platforms without flock the lock is best-effort: restore still refuses when
// SQLite reports the database busy (see internal/backup).
func tryLock(*os.File) error { return nil }

func unlock(*os.File) {}
