//go:build linux || darwin || freebsd

package store

import "syscall"

func freeSpace(dir string) (uint64, bool, error) {
	var st syscall.Statfs_t
	if err := syscall.Statfs(dir, &st); err != nil {
		return 0, false, err
	}
	return uint64(st.Bavail) * uint64(st.Bsize), true, nil //nolint:unconvert // field types differ per platform
}
