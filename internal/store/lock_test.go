//go:build unix

package store

import (
	"errors"
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
