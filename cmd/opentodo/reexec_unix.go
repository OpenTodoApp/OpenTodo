//go:build unix

package main

import (
	"errors"
	"os"
	"os/exec"
	"syscall"
)

// reexec replaces this process with a fresh copy of the same binary: same PID,
// arguments and environment, so supervisors and containers see no exit.
func reexec() error {
	exe, err := restartTarget()
	if err != nil {
		return err
	}
	return syscall.Exec(exe, os.Args, os.Environ())
}

// restartTarget is the binary reexec starts. os.Executable reads
// /proc/self/exe on Linux, which a chroot may lack (#1961); the command the
// process was started as is the fallback.
func restartTarget() (string, error) {
	return resolveExecutable(os.Executable, os.Args[0])
}

func resolveExecutable(executable func() (string, error), arg0 string) (string, error) {
	exe, err := executable()
	if err != nil {
		if arg0 == "" {
			return "", err
		}
		fallback, lerr := exec.LookPath(arg0)
		if lerr != nil {
			return "", errors.Join(err, lerr)
		}
		exe = fallback
	}
	info, err := os.Stat(exe)
	if err != nil {
		return "", err
	}
	if info.IsDir() || info.Mode().Perm()&0o111 == 0 {
		return "", errors.New(exe + " is not an executable file")
	}
	return exe, nil
}
