//go:build unix

package main

import (
	"os"
	"syscall"
)

// reexec replaces this process with a fresh copy of the same binary: same PID,
// arguments and environment, so supervisors and containers see no exit.
func reexec() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	return syscall.Exec(exe, os.Args, os.Environ())
}
