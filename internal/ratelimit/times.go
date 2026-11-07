package ratelimit

import (
	"sync"
	"time"
)

// Times is a sliding window of counted times per key (the device relay's
// calls per account, outgoing email per recipient), kept by a Store once
// attached. It is safe for concurrent use.
type Times struct {
	window time.Duration

	mu    sync.Mutex
	store *Store
	m     map[string][]time.Time
	dirty map[string]struct{}
}

// NewTimes returns an empty window of the given length, in memory only until
// Attach.
func NewTimes(window time.Duration) *Times {
	return &Times{window: window, m: map[string][]time.Time{}, dirty: map[string]struct{}{}}
}

// Attach makes store keep the window under name and restores what it held.
func (t *Times) Attach(store *Store, name string) {
	t.mu.Lock()
	t.store = store
	t.mu.Unlock()
	store.Register(name, t)
}

func (t *Times) key(raw string) string { return t.store.Key(raw) }

// Recent is the times of key within the window before now, oldest first.
func (t *Times) Recent(key string, now time.Time) []time.Time {
	t.mu.Lock()
	defer t.mu.Unlock()
	return append([]time.Time(nil), t.recentLocked(t.key(key), now)...)
}

func (t *Times) recentLocked(k string, now time.Time) []time.Time {
	cut := now.Add(-t.window)
	ts := t.m[k]
	i := 0
	for i < len(ts) && !ts[i].After(cut) {
		i++
	}
	if i == len(ts) {
		if len(ts) > 0 {
			delete(t.m, k)
			t.dirty[k] = struct{}{}
		}
		return nil
	}
	if i > 0 {
		t.m[k] = ts[i:]
	}
	return t.m[k]
}

// Add counts one time for key.
func (t *Times) Add(key string, now time.Time) {
	t.mu.Lock()
	k := t.key(key)
	t.m[k] = append(t.recentLocked(k, now), now)
	t.dirty[k] = struct{}{}
	// Keep the map bounded by the window.
	if len(t.m) > 10000 {
		for other := range t.m {
			t.recentLocked(other, now)
		}
	}
	store := t.store
	t.mu.Unlock()
	store.Changed()
}

// Restore implements Part.
func (t *Times) Restore(rows []Row) {
	t.mu.Lock()
	defer t.mu.Unlock()
	for _, r := range rows {
		ts := make([]time.Time, 0, len(r.Hits))
		for _, h := range r.Hits {
			ts = append(ts, time.UnixMilli(h))
		}
		if len(ts) > 0 {
			t.m[r.Key] = ts
		}
	}
}

// Flush implements Part.
func (t *Times) Flush(now time.Time) (put []Row, gone []string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	for k := range t.dirty {
		ts := t.recentLocked(k, now)
		if len(ts) == 0 {
			gone = append(gone, k)
			continue
		}
		hits := make([]int64, len(ts))
		for i, x := range ts {
			hits[i] = x.UnixMilli()
		}
		put = append(put, Row{Key: k, Start: hits[0], Ends: ts[len(ts)-1].Add(t.window).UnixMilli(), Count: len(ts), Hits: hits})
	}
	clear(t.dirty)
	return put, gone
}
