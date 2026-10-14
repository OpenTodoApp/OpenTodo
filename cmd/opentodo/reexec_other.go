//go:build !unix

package main

import "errors"

// reexec is unavailable here: the process exits and the next start applies the restore.
func reexec() error { return errors.New("in-place restart is not supported on this platform") }
