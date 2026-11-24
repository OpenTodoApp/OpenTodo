//go:build unix

package main

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

// TestResolveExecutable (#1961): without /proc/self/exe the command the server
// was started as is used, and a target that cannot be run is reported before
// the server stops.
func TestResolveExecutable(t *testing.T) {
	dir := t.TempDir()
	bin := filepath.Join(dir, "opentodo")
	if err := os.WriteFile(bin, []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	plain := filepath.Join(dir, "plain")
	if err := os.WriteFile(plain, nil, 0o644); err != nil {
		t.Fatal(err)
	}
	noProc := func() (string, error) { return "", errors.New("readlink /proc/self/exe: no such file or directory") }
	found := func(p string) func() (string, error) { return func() (string, error) { return p, nil } }

	if got, err := resolveExecutable(found(bin), ""); err != nil || got != bin {
		t.Fatalf("os.Executable: %q %v", got, err)
	}
	if got, err := resolveExecutable(noProc, bin); err != nil || got != bin {
		t.Fatalf("fallback to the start command: %q %v", got, err)
	}
	for name, c := range map[string]struct {
		exe  func() (string, error)
		arg0 string
	}{
		"no proc, no start command": {noProc, ""},
		"no proc, missing command":  {noProc, filepath.Join(dir, "missing")},
		"binary removed":            {found(filepath.Join(dir, "gone")), ""},
		"not executable":            {found(plain), ""},
		"a directory":               {found(dir), ""},
	} {
		if got, err := resolveExecutable(c.exe, c.arg0); err == nil {
			t.Errorf("%s: resolved %q, want an error", name, got)
		}
	}
}

// TestFinishRestartExitsForSupervisor (#1961): a failed re-exec exits non-zero,
// so Restart=on-failure or a restart policy starts the server and the restore
// is applied.
func TestFinishRestartExitsForSupervisor(t *testing.T) {
	failed := func() error { return errors.New("readlink /proc/self/exe: no such file or directory") }
	if got := finishRestart(failed); got != exitRestartRequired || got == 0 {
		t.Fatalf("exit status %d, want %d", got, exitRestartRequired)
	}
}
