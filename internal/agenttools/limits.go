package agenttools

import (
	"math"
	"sync"
	"time"
)

// Write limits (design D5). Fixed constants in v1, documented in docs/mcp.md;
// the owner cannot tune them (owner decision recorded in design.md).
const (
	// PerCall is the most entities one write call may change.
	PerCall = 50
	// PerMinute is the most write calls one token may make in a rolling minute.
	PerMinute = 30
	// PerDay is the most entities one token may change in a UTC day.
	PerDay = 1000
)

// Limiter keeps the per-token write counters in memory: a ring of the last
// PerMinute call times and the entities changed today. A restart resets them;
// they exist to contain runaway loops, not to bill anyone.
type Limiter struct {
	mu     sync.Mutex
	now    func() time.Time
	tokens map[string]*usage
}

type usage struct {
	calls    []time.Time // at most PerMinute, oldest first
	day      string      // UTC date the entity count belongs to
	entities int
	last     time.Time
}

// NewLimiter returns an empty limiter on the given clock (nil: time.Now).
func NewLimiter(now func() time.Time) *Limiter {
	if now == nil {
		now = time.Now
	}
	return &Limiter{now: now, tokens: map[string]*usage{}}
}

func (l *Limiter) get(token string, now time.Time) *usage {
	u, ok := l.tokens[token]
	if !ok {
		if len(l.tokens) > 1000 {
			// Forget tokens idle for a day so the map stays small.
			for k, v := range l.tokens {
				if now.Sub(v.last) > 24*time.Hour {
					delete(l.tokens, k)
				}
			}
		}
		u = &usage{}
		l.tokens[token] = u
	}
	u.last = now
	if d := now.UTC().Format("2006-01-02"); u.day != d {
		u.day, u.entities = d, 0
	}
	return u
}

// AllowCall counts one write call; when the token made PerMinute calls in the
// last minute it refuses and says how many seconds to wait.
func (l *Limiter) AllowCall(token string) (bool, int) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	u := l.get(token, now)
	cut := now.Add(-time.Minute)
	i := 0
	for i < len(u.calls) && !u.calls[i].After(cut) {
		i++
	}
	u.calls = u.calls[i:]
	if len(u.calls) >= PerMinute {
		wait := u.calls[0].Add(time.Minute).Sub(now)
		return false, max(1, int(math.Ceil(wait.Seconds())))
	}
	u.calls = append(u.calls, now)
	return true, 0
}

// Reserve books n changed entities against today's budget, or refuses with the
// seconds until the next UTC day.
func (l *Limiter) Reserve(token string, n int) (bool, int) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	u := l.get(token, now)
	if u.entities+n > PerDay {
		y, m, d := now.UTC().Date()
		next := time.Date(y, m, d+1, 0, 0, 0, 0, time.UTC)
		return false, max(1, int(math.Ceil(next.Sub(now).Seconds())))
	}
	u.entities += n
	return true, 0
}

// Refund returns n entities reserved for a call that changed nothing.
func (l *Limiter) Refund(token string, n int) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if u, ok := l.tokens[token]; ok {
		u.entities = max(0, u.entities-n)
	}
}
