//go:build unix

package backup

import (
	"os"
	"syscall"
)

// freeBytes reports the space available to this process on dir's filesystem;
// ok is false when it cannot be determined.
func freeBytes(dir string) (int64, bool) {
	var st syscall.Statfs_t
	if err := syscall.Statfs(dir, &st); err != nil {
		return 0, false
	}
	return int64(st.Bavail) * int64(st.Bsize), true //nolint:unconvert // field types differ per platform
}

// sameFilesystem reports whether a and b are on one filesystem (a free-space
// check must then add up what both hold); true when it cannot tell.
func sameFilesystem(a, b string) bool {
	fa, errA := os.Stat(a)
	fb, errB := os.Stat(b)
	if errA != nil || errB != nil {
		return true
	}
	sa, okA := fa.Sys().(*syscall.Stat_t)
	sb, okB := fb.Sys().(*syscall.Stat_t)
	if !okA || !okB {
		return true
	}
	return sa.Dev == sb.Dev
}
