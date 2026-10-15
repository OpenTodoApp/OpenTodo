package mail

import (
	"strings"
	"sync"
	"time"
)

// Sending limits (design D7).
const (
	PerRecipientLimit = 5
	ServerLimit       = 100
	LimitWindow       = time.Hour
)

// Limiter is a sliding window per (kind, recipient) and one for the server.
type Limiter struct {
	mu     sync.Mutex
	now    func() time.Time
	per    map[string][]time.Time
	server []time.Time
}

// NewLimiter returns an empty limiter.
func NewLimiter(now func() time.Time) *Limiter {
	if now == nil {
		now = time.Now
	}
	return &Limiter{now: now, per: map[string][]time.Time{}}
}

func prune(ts []time.Time, cutoff time.Time) []time.Time {
	i := 0
	for i < len(ts) && !ts[i].After(cutoff) {
		i++
	}
	return ts[i:]
}

// Allow reserves one message of kind to recipient, or reports false when
// either window is full.
func (l *Limiter) Allow(kind Kind, recipient string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	cutoff := now.Add(-LimitWindow)
	key := string(kind) + "\x00" + strings.ToLower(strings.TrimSpace(recipient))
	per := prune(l.per[key], cutoff)
	l.server = prune(l.server, cutoff)
	if len(per) >= PerRecipientLimit || len(l.server) >= ServerLimit {
		l.per[key] = per
		return false
	}
	l.per[key] = append(per, now)
	l.server = append(l.server, now)
	// Keep the map bounded by the window.
	if len(l.per) > 10000 {
		for k, v := range l.per {
			if len(prune(v, cutoff)) == 0 {
				delete(l.per, k)
			}
		}
	}
	return true
}
