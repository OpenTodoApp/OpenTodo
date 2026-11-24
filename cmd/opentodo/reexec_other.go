//go:build !unix

package main

import "errors"

var errNoReexec = errors.New("in-place restart is not supported on this platform")

// reexec is unavailable here: the process exits and the next start applies the restore.
func reexec() error { return errNoReexec }

// restartTarget reports that the server cannot start itself again here.
func restartTarget() (string, error) { return "", errNoReexec }
