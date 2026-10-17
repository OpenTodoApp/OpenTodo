package auth

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

// TestHashSlotsBusy (SEC-5): when every hashing slot is taken, hashing and
// verification give up after a short wait with ErrBusy instead of queueing.
func TestHashSlotsBusy(t *testing.T) {
	ctx := context.Background()
	s, _ := newService(t, true)
	mustOwner(t, s)
	if hashSlotCount() < 2 {
		t.Fatalf("slots = %d, want at least 2", hashSlotCount())
	}
	restore := setHashWait(t, 0)
	defer restore()
	release := fillHashSlots(t)
	if _, err := HashPassword("correct horse battery"); !errors.Is(err, ErrBusy) {
		t.Fatalf("hash: %v", err)
	}
	if _, err := s.Authenticate(ctx, "owner@example.com", "correct horse battery"); !errors.Is(err, ErrBusy) {
		t.Fatalf("authenticate: %v", err)
	}
	if _, err := s.Register(ctx, "m@example.com", "M", "correct horse battery", ""); !errors.Is(err, ErrBusy) {
		t.Fatalf("register: %v", err)
	}
	release()
	if _, err := s.Authenticate(ctx, "owner@example.com", "correct horse battery"); err != nil {
		t.Fatalf("after release: %v", err)
	}
}

func hashSlotCount() int { return cap(hashSlots) }

// setHashWait shortens the wait for a hashing slot for one test.
func setHashWait(t *testing.T, d time.Duration) func() {
	t.Helper()
	orig := hashWait
	hashWait = d
	return func() { hashWait = orig }
}

// fillHashSlots takes every hashing slot; the returned func frees them.
func fillHashSlots(t *testing.T) func() {
	t.Helper()
	for i := 0; i < cap(hashSlots); i++ {
		hashSlots <- struct{}{}
	}
	var once sync.Once
	release := func() {
		once.Do(func() {
			for i := 0; i < cap(hashSlots); i++ {
				<-hashSlots
			}
		})
	}
	t.Cleanup(release)
	return release
}
