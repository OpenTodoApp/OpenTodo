//go:build unix

package store

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// flock locks belong to open file descriptions, so two Lock calls in one test
// process behave like two processes.

func TestSharedLocksCoexist(t *testing.T) {
	dir := t.TempDir()
	a, err := LockShared(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer a()
	b, err := LockShared(dir)
	if err != nil {
		t.Fatalf("second server could not start beside the first: %v", err)
	}
	b()
}

func TestExclusiveConflictsWithShared(t *testing.T) {
	dir := t.TempDir()
	srv, err := LockShared(dir)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := Lock(dir); !errors.Is(err, ErrLocked) {
		t.Fatalf("maintenance lock while a server runs: %v, want ErrLocked", err)
	}
	srv()
	maint, err := Lock(dir)
	if err != nil {
		t.Fatalf("maintenance lock after the server stopped: %v", err)
	}
	if _, err := LockShared(dir); !errors.Is(err, ErrLocked) {
		t.Fatalf("server start during maintenance: %v, want ErrLocked", err)
	}
	maint()
}

func TestJobsLockSingleHolder(t *testing.T) {
	dir := t.TempDir()
	leader, err := LockJobs(dir)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := LockJobs(dir); !errors.Is(err, ErrLocked) {
		t.Fatalf("second jobs lock: %v, want ErrLocked", err)
	}
	// The jobs lock does not interfere with the data-directory lock.
	if rel, err := LockShared(dir); err != nil {
		t.Fatalf("shared lock beside the jobs lock: %v", err)
	} else {
		rel()
	}
	leader()
	next, err := LockJobs(dir)
	if err != nil {
		t.Fatalf("jobs lock after the leader stopped: %v", err)
	}
	next()
}

// self-hosting "An unwritable data directory is explained" (#511).
func TestUnwritableDataDirIsExplained(t *testing.T) {
	if os.Getuid() == 0 {
		t.Skip("root can write anywhere")
	}
	parent := t.TempDir()
	dir := filepath.Join(parent, "data")
	if err := os.Mkdir(dir, 0o500); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(dir, 0o700) })
	_, err := LockShared(dir)
	if !errors.Is(err, fs.ErrPermission) {
		t.Fatalf("err = %v, want a permission error", err)
	}
	want := fmt.Sprintf("not writable for user %d (group %d)", os.Getuid(), os.Getgid())
	for _, part := range []string{want, fmt.Sprintf("chown -R %d:%d", os.Getuid(), os.Getgid()), dir, DataDirGuide} {
		if !strings.Contains(err.Error(), part) {
			t.Fatalf("message %q lacks %q", err, part)
		}
	}
	// A writable directory starts as before.
	if err := os.Chmod(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	release, err := LockShared(dir)
	if err != nil {
		t.Fatal(err)
	}
	release()
}
