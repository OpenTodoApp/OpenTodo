//go:build !linux && !darwin && !freebsd && !netbsd && !openbsd && !dragonfly && !windows

package cli

import (
	"errors"
	"os"
)

// isTerminal is conservative on platforms without terminal control: never a TTY,
// so colour and prompts stay off.
func isTerminal(*os.File) bool { return false }

func disableEcho(*os.File) (func(), error) {
	return nil, errors.New("terminal control not supported on this platform")
}
