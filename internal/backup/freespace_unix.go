//go:build unix

package backup

import "syscall"

// freeBytes reports the space available to this process on dir's filesystem;
// ok is false when it cannot be determined.
func freeBytes(dir string) (int64, bool) {
	var st syscall.Statfs_t
	if err := syscall.Statfs(dir, &st); err != nil {
		return 0, false
	}
	return int64(st.Bavail) * int64(st.Bsize), true //nolint:unconvert // field types differ per platform
}
