//go:build !unix

package backup

// freeBytes cannot tell the free space here: restores run without a cap.
func freeBytes(string) (int64, bool) { return 0, false }
