//go:build unix

package main

import (
	"context"
	"io"
	"log/slog"
	"sync/atomic"
	"testing"
	"time"
)

func TestJobsStartAfterLeaderExits(t *testing.T) {
	dir := t.TempDir()
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	var first, second atomic.Int32
	firstStarted, releaseFirst := runJobsWhenLeader(ctx, dir, log, 10*time.Millisecond, func() { first.Add(1) })
	if !firstStarted() || first.Load() != 1 {
		t.Fatal("the first process should run the jobs at once")
	}
	secondStarted, releaseSecond := runJobsWhenLeader(ctx, dir, log, 10*time.Millisecond, func() { second.Add(1) })
	defer releaseSecond()
	time.Sleep(50 * time.Millisecond)
	if secondStarted() || second.Load() != 0 {
		t.Fatal("a second process must not run the jobs while the first holds them")
	}

	releaseFirst() // the old container stops
	deadline := time.Now().Add(2 * time.Second)
	for !secondStarted() && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if !secondStarted() || second.Load() != 1 {
		t.Fatalf("the second process should take the jobs over (started=%v, calls=%d)", secondStarted(), second.Load())
	}
}

func TestJobsWaitingStopsWithContext(t *testing.T) {
	dir := t.TempDir()
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	_, releaseLeader := runJobsWhenLeader(context.Background(), dir, log, 10*time.Millisecond, func() {})
	ctx, cancel := context.WithCancel(context.Background())
	var calls atomic.Int32
	started, release := runJobsWhenLeader(ctx, dir, log, 10*time.Millisecond, func() { calls.Add(1) })
	defer release()
	cancel() // shutting down before ever becoming leader
	time.Sleep(30 * time.Millisecond)
	releaseLeader()
	time.Sleep(50 * time.Millisecond)
	if started() || calls.Load() != 0 {
		t.Fatal("a process shutting down must not start the jobs")
	}
}
