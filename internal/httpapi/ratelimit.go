package httpapi

import (
	"sync"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/ratelimit"
)

// rateLimiter is a fixed-window per-key counter, enough to blunt password
// guessing. Keys that are IPv6 addresses count per /64 (addrKey). Expired
// windows are removed by a background sweep, never while counting a hit
// (trusted-client-identity). A limiter made with Server.limit is kept by the
// tenant's ratelimit.Store, so its windows survive a restart
// (persistent-limits); its keys are then the store's hashes.
type rateLimiter struct {
	mu     sync.Mutex
	limit  int
	window time.Duration
	hits   map[string]*window
	store  *ratelimit.Store
	dirty  map[string]struct{}
}

type window struct {
	start   time.Time
	count   int
	refused int // refusals counted by check
}

func newRateLimiter(limit int, w time.Duration) *rateLimiter {
	l := &rateLimiter{limit: limit, window: w, hits: map[string]*window{}, dirty: map[string]struct{}{}}
	limiterSweeper.add(l)
	return l
}

// limit is a rate limiter whose windows the tenant's store keeps under name
// (persistent-limits D2). Names are stable: they are the stored rows' limiter.
func (s *Server) limit(name string, limit int, w time.Duration) *rateLimiter {
	l := newRateLimiter(limit, w)
	if st := s.limitStore(); st != nil {
		l.store = st
		st.Register(name, l)
	}
	return l
}

// limitStore is the tenant's store of limit windows (nil: memory only).
func (s *Server) limitStore() *ratelimit.Store {
	if s.set == nil {
		return nil
	}
	return s.set.Limits
}

// key is the map key of a caller's key: its /64 for IPv6, hashed when stored.
func (l *rateLimiter) key(key string) string { return l.store.Key(addrKey(key)) }

// changed marks key's window for the store (l.mu held).
func (l *rateLimiter) changed(k string) {
	if l.store != nil {
		l.dirty[k] = struct{}{}
	}
}

// blocked reports whether key already used up its window, without counting an
// attempt (callers that count only failures check this first, then hit).
func (l *rateLimiter) blocked(key string) bool {
	k := l.key(key)
	l.mu.Lock()
	defer l.mu.Unlock()
	w, ok := l.hits[k]
	return ok && time.Since(w.start) <= l.window && w.count >= l.limit
}

// check is blocked plus firstRefusal: true for exactly one refused check per
// window, so callers log one event per window instead of one per attempt.
func (l *rateLimiter) check(key string) (blocked, firstRefusal bool) {
	k := l.key(key)
	l.mu.Lock()
	w, ok := l.hits[k]
	if !ok || time.Since(w.start) > l.window || w.count < l.limit {
		l.mu.Unlock()
		return false, false
	}
	w.refused++
	first := w.refused == 1
	l.changed(k)
	l.mu.Unlock()
	l.store.Changed()
	return true, first
}

// retryAfter is how long until key's window ends (0 when it is not blocked).
func (l *rateLimiter) retryAfter(key string) time.Duration {
	k := l.key(key)
	l.mu.Lock()
	defer l.mu.Unlock()
	w, ok := l.hits[k]
	if !ok || w.count < l.limit {
		return 0
	}
	return max(0, l.window-time.Since(w.start))
}

// reset forgets key's attempts (a successful sign-in clears its failures).
func (l *rateLimiter) reset(key string) {
	k := l.key(key)
	l.mu.Lock()
	_, had := l.hits[k]
	delete(l.hits, k)
	if had {
		l.changed(k)
	}
	l.mu.Unlock()
	if had {
		l.store.Changed()
	}
}

func (l *rateLimiter) allow(key string) bool {
	ok, _ := l.hit(key)
	return ok
}

// hit counts one attempt for key. firstRefusal is true for exactly one refused
// attempt per window: the first one over the limit.
func (l *rateLimiter) hit(key string) (allowed, firstRefusal bool) {
	k := l.key(key)
	l.mu.Lock()
	now := time.Now()
	w, ok := l.hits[k]
	if !ok || now.Sub(w.start) > l.window {
		l.hits[k] = &window{start: now, count: 1}
		allowed = true
	} else {
		w.count++
		allowed, firstRefusal = w.count <= l.limit, w.count == l.limit+1
	}
	l.changed(k)
	l.mu.Unlock()
	l.store.Changed()
	return allowed, firstRefusal
}

// sweep removes the windows that ended before now. The store drops their rows
// by their end time.
func (l *rateLimiter) sweep(now time.Time) {
	l.mu.Lock()
	defer l.mu.Unlock()
	for k, v := range l.hits {
		if now.Sub(v.start) > l.window {
			delete(l.hits, k)
		}
	}
}

// Restore implements ratelimit.Part: the windows open at the last close.
func (l *rateLimiter) Restore(rows []ratelimit.Row) {
	l.mu.Lock()
	defer l.mu.Unlock()
	for _, r := range rows {
		l.hits[r.Key] = &window{start: time.UnixMilli(r.Start), count: r.Count, refused: r.Refused}
	}
}

// Flush implements ratelimit.Part.
func (l *rateLimiter) Flush(now time.Time) (put []ratelimit.Row, gone []string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	for k := range l.dirty {
		w, ok := l.hits[k]
		if !ok || now.Sub(w.start) > l.window {
			gone = append(gone, k)
			continue
		}
		put = append(put, ratelimit.Row{Key: k, Start: w.start.UnixMilli(), Ends: w.start.Add(l.window).UnixMilli(), Count: w.count, Refused: w.refused})
	}
	clear(l.dirty)
	return put, gone
}
