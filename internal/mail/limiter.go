package mail

import (
	"strings"
	"sync"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/ratelimit"
)

// Sending limits (design D7).
const (
	PerRecipientLimit = 5
	ServerLimit       = 100
	LimitWindow       = time.Hour
)

// serverKey is the server-wide window's key among the recipients'.
const serverKey = "\x00server"

// Limiter is a sliding window per (kind, recipient) and one for the server.
// Once kept by a ratelimit.Store its windows survive a restart
// (persistent-limits D4).
type Limiter struct {
	mu   sync.Mutex
	now  func() time.Time
	sent *ratelimit.Times
}

// NewLimiter returns an empty limiter.
func NewLimiter(now func() time.Time) *Limiter {
	if now == nil {
		now = time.Now
	}
	return &Limiter{now: now, sent: ratelimit.NewTimes(LimitWindow)}
}

// Keep makes store keep the limiter's windows.
func (l *Limiter) Keep(store *ratelimit.Store) {
	if store != nil {
		l.sent.Attach(store, "mail")
	}
}

// KeepLimits makes store keep the sending limits (persistent-limits).
func (s *Service) KeepLimits(store *ratelimit.Store) {
	if s != nil {
		s.limiter.Keep(store)
	}
}

// paced kinds are sent by a scheduler that spreads them out (the weekly
// digest, stats-and-review D6): they keep the per-recipient limit but neither
// count towards nor wait for the server-wide transactional window, so a
// Friday morning of digests never blocks a password reset.
func paced(kind Kind) bool { return kind == KindDigest }

func recipientKey(kind Kind, recipient string) string {
	return string(kind) + "\x00" + strings.ToLower(strings.TrimSpace(recipient))
}

// fullLocked reports whether either window is full at now (l.mu held).
func (l *Limiter) fullLocked(kind Kind, key string, now time.Time) bool {
	return len(l.sent.Recent(key, now)) >= PerRecipientLimit || (!paced(kind) && len(l.sent.Recent(serverKey, now)) >= ServerLimit)
}

// Full reports whether a message of kind to recipient would be refused now,
// without reserving anything.
func (l *Limiter) Full(kind Kind, recipient string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.fullLocked(kind, recipientKey(kind, recipient), l.now())
}

// Allow reserves one message of kind to recipient, or reports false when
// either window is full.
func (l *Limiter) Allow(kind Kind, recipient string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	key := recipientKey(kind, recipient)
	if l.fullLocked(kind, key, now) {
		return false
	}
	l.sent.Add(key, now)
	if !paced(kind) {
		l.sent.Add(serverKey, now)
	}
	return true
}
