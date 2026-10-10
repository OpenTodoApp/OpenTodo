//go:build windows

package cli

import (
	"errors"
	"os"
	"syscall"
)

const enableEchoInput = 0x0004

var (
	kernel32           = syscall.NewLazyDLL("kernel32.dll")
	procSetConsoleMode = kernel32.NewProc("SetConsoleMode")
)

// isTerminal reports whether f is a console.
func isTerminal(f *os.File) bool {
	var mode uint32
	return syscall.GetConsoleMode(syscall.Handle(f.Fd()), &mode) == nil
}

// disableEcho turns off input echo on the console f and returns a function that
// restores the previous mode.
func disableEcho(f *os.File) (func(), error) {
	h := syscall.Handle(f.Fd())
	var old uint32
	if err := syscall.GetConsoleMode(h, &old); err != nil {
		return nil, err
	}
	set := func(mode uint32) error {
		r, _, err := procSetConsoleMode.Call(uintptr(h), uintptr(mode))
		if r == 0 {
			if err != nil {
				return err
			}
			return errors.New("SetConsoleMode failed")
		}
		return nil
	}
	if err := set(old &^ enableEchoInput); err != nil {
		return nil, err
	}
	return func() { _ = set(old) }, nil
}
