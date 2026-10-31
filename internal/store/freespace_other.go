//go:build !(linux || darwin || freebsd)

package store

// freeSpace is unknown here: the one-time conversion is skipped with a warning
// (op-log-compaction D6).
func freeSpace(string) (uint64, bool, error) { return 0, false, nil }
