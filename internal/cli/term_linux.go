//go:build linux

package cli

import (
	"os"
	"syscall"
	"unsafe"
)

func termios(fd uintptr) (syscall.Termios, bool) {
	var t syscall.Termios
	_, _, errno := syscall.Syscall(syscall.SYS_IOCTL, fd, syscall.TCGETS, uintptr(unsafe.Pointer(&t)))
	return t, errno == 0
}

func setTermios(fd uintptr, t *syscall.Termios) bool {
	_, _, errno := syscall.Syscall(syscall.SYS_IOCTL, fd, syscall.TCSETS, uintptr(unsafe.Pointer(t)))
	return errno == 0
}

// isTerminal reports whether f is a terminal.
func isTerminal(f *os.File) bool {
	_, ok := termios(f.Fd())
	return ok
}

// disableEcho turns off input echo on the terminal f and returns a function that
// restores the previous mode.
func disableEcho(f *os.File) (func(), error) {
	fd := f.Fd()
	old, ok := termios(fd)
	if !ok {
		return nil, syscall.ENOTTY
	}
	t := old
	t.Lflag &^= syscall.ECHO
	if !setTermios(fd, &t) {
		return nil, syscall.EIO
	}
	return func() { setTermios(fd, &old) }, nil
}
