package main

import (
	"context"
	"errors"
	"log/slog"
	"sync"
	"time"

	"github.com/pixari/opentodo/internal/store"
)

// jobsRetry is how often a server that does not run the background jobs checks
// whether the process that did has stopped.
const jobsRetry = 2 * time.Second

// runJobsWhenLeader calls start once this process holds the jobs lock (OpenSpec
// `rolling-updates`). During a rolling update the new container serves beside the
// old one and takes the jobs over when the old one exits. It returns whether the
// jobs started (shutdown waits for them only then) and a release for the lock.
func runJobsWhenLeader(ctx context.Context, dataDir string, log *slog.Logger, retry time.Duration, start func()) (started func() bool, release func()) {
	var (
		mu      sync.Mutex
		running bool
		unlock  func()
	)
	try := func() bool {
		rel, err := store.LockJobs(dataDir)
		if err != nil {
			if !errors.Is(err, store.ErrLocked) {
				log.Error("background jobs lock", "err", err)
			}
			return false
		}
		mu.Lock()
		if ctx.Err() != nil {
			mu.Unlock()
			rel()
			return true
		}
		unlock, running = rel, true
		mu.Unlock()
		start()
		return true
	}
	if !try() {
		log.Info("another opentodo process runs the background jobs on this data directory; this one serves requests and takes them over when it stops")
		go func() {
			t := time.NewTicker(retry)
			defer t.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-t.C:
					if try() {
						log.Info("background jobs started: the previous process stopped")
						return
					}
				}
			}
		}()
	}
	started = func() bool {
		mu.Lock()
		defer mu.Unlock()
		return running
	}
	release = func() {
		mu.Lock()
		defer mu.Unlock()
		if unlock != nil {
			unlock()
			unlock = nil
		}
	}
	return started, release
}
