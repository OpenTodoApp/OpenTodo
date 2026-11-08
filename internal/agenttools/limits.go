package agenttools

import (
	"math"
	"sync"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/ratelimit"
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

// Limiter keeps the write counters of each token and each account in memory:
// the call times of the last minute and the entities changed today. Attached
// to a ratelimit.Store, they survive a restart (persistent-limits D4); its
// keys are then the store's hashes. They exist to contain runaway loops, not
// to bill anyone.
type Limiter struct {
	mu     sync.Mutex
	now    func() time.Time
	tokens map[string]*usage
	store  *ratelimit.Store
	dirty  map[string]struct{}
}

// dayLayout is the format of a usage's UTC day.
const dayLayout = "2006-01-02"

type usage struct {
	calls    []time.Time // the last minute's, oldest first
	day      string      // UTC date the entity count belongs to
	entities int
	last     time.Time
}

// NewLimiter returns an empty limiter on the given clock (nil: time.Now).
func NewLimiter(now func() time.Time) *Limiter {
	if now == nil {
		now = time.Now
	}
	return &Limiter{now: now, tokens: map[string]*usage{}, dirty: map[string]struct{}{}}
}

func (l *Limiter) get(token string, now time.Time) *usage {
	token = l.key(token)
	l.mark(token)
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
	if d := now.UTC().Format(dayLayout); u.day != d {
		u.day, u.entities = d, 0
	}
	return u
}

// Account limits (OpenSpec change agent-limits-per-account). The token limits
// above stop one runaway token; these stop several agent tokens or OAuth
// clients of one person from multiplying them. They are twice a token's, so
// two assistants working at once rarely meet them, and as fixed as the token
// limits.
const (
	// AccountPerMinute is the most write calls the agent tokens of one account
	// may make together in a rolling minute.
	AccountPerMinute = 2 * PerMinute
	// AccountPerDay is the most entities the agent tokens of one account may
	// change together in a UTC day.
	AccountPerDay = 2 * PerDay
)

// accountKey keeps an account's counters apart from token counters in the one
// map: token ids are UUIDs and never carry this prefix.
func accountKey(userID string) string { return "account:" + userID }

// callWait drops the calls older than a minute and reports whether one more
// fits under limit, or how many seconds until it does.
func (u *usage) callWait(now time.Time, limit int) int {
	cut := now.Add(-time.Minute)
	i := 0
	for i < len(u.calls) && !u.calls[i].After(cut) {
		i++
	}
	u.calls = u.calls[i:]
	if len(u.calls) < limit {
		return 0
	}
	wait := u.calls[len(u.calls)-limit].Add(time.Minute).Sub(now)
	return max(1, int(math.Ceil(wait.Seconds())))
}

// untilNextDay is the seconds until the next UTC day, at least one.
func untilNextDay(now time.Time) int {
	y, m, d := now.UTC().Date()
	next := time.Date(y, m, d+1, 0, 0, 0, 0, time.UTC)
	return max(1, int(math.Ceil(next.Sub(now).Seconds())))
}

// AllowCall counts one write call of a token that belongs to no account
// (tests and callers without a person); see AllowCallFor.
func (l *Limiter) AllowCall(token string) (bool, int) { return l.AllowCallFor("", token) }

// Reserve books n entities for a token that belongs to no account; see
// ReserveFor.
func (l *Limiter) Reserve(token string, n int) (bool, int) { return l.ReserveFor("", token, n) }

// Refund returns n entities to a token that belongs to no account.
func (l *Limiter) Refund(token string, n int) { l.RefundFor("", token, n) }

// AllowCallFor counts one write call against the token and against the
// account of userID. When the token made PerMinute calls, or the account's
// tokens AccountPerMinute calls, in the last minute it refuses, counts
// nothing, and says how many seconds to wait. An empty userID counts the
// token only.
func (l *Limiter) AllowCallFor(userID, token string) (bool, int) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	tu := l.get(token, now)
	if wait := tu.callWait(now, PerMinute); wait > 0 {
		return false, wait
	}
	if userID != "" {
		au := l.get(accountKey(userID), now)
		if wait := au.callWait(now, AccountPerMinute); wait > 0 {
			return false, wait
		}
		au.calls = append(au.calls, now)
	}
	tu.calls = append(tu.calls, now)
	return true, 0
}

// ReserveFor books n changed entities against today's budget of the token and
// of the account of userID, or refuses with the seconds until the next UTC
// day when either would go over (PerDay, AccountPerDay).
func (l *Limiter) ReserveFor(userID, token string, n int) (bool, int) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	tu := l.get(token, now)
	var au *usage
	if userID != "" {
		au = l.get(accountKey(userID), now)
	}
	if tu.entities+n > PerDay || (au != nil && au.entities+n > AccountPerDay) {
		return false, untilNextDay(now)
	}
	tu.entities += n
	if au != nil {
		au.entities += n
	}
	return true, 0
}

// RefundFor returns n entities reserved by ReserveFor for a call that changed
// nothing.
func (l *Limiter) RefundFor(userID, token string, n int) {
	l.mu.Lock()
	defer l.mu.Unlock()
	keys := []string{token}
	if userID != "" {
		keys = append(keys, accountKey(userID))
	}
	for _, k := range keys {
		k = l.key(k)
		if u, ok := l.tokens[k]; ok {
			u.entities = max(0, u.entities-n)
			l.mark(k)
		}
	}
}

// Hold holds what is left of today's budget for a token that belongs to no
// account; see HoldFor.
func (l *Limiter) Hold(token string) (int, int) { return l.HoldFor("", token) }

// Settle ends a Hold for a token that belongs to no account; see SettleFor.
func (l *Limiter) Settle(token string, held, used int) { l.SettleFor("", token, held, used) }

// HoldFor books whatever is left of today's budget, the token's or the
// account's of userID whichever is smaller, for a call whose size is known
// only once it ran (run_routine), and returns it; 0 with the seconds until the
// next UTC day when nothing is left. The caller settles with SettleFor.
func (l *Limiter) HoldFor(userID, token string) (int, int) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	tu := l.get(token, now)
	left := PerDay - tu.entities
	var au *usage
	if userID != "" {
		au = l.get(accountKey(userID), now)
		left = min(left, AccountPerDay-au.entities)
	}
	if left <= 0 {
		return 0, untilNextDay(now)
	}
	tu.entities += left
	if au != nil {
		au.entities += left
	}
	return left, 0
}

// SettleFor ends a HoldFor of held entities of which used were written: the
// rest goes back to the token and the account. A run that wrote more than it
// held (a device run, which the server cannot cap) books the excess, so later
// calls are refused.
func (l *Limiter) SettleFor(userID, token string, held, used int) {
	l.mu.Lock()
	defer l.mu.Unlock()
	keys := []string{token}
	if userID != "" {
		keys = append(keys, accountKey(userID))
	}
	for _, k := range keys {
		k = l.key(k)
		if u, ok := l.tokens[k]; ok {
			u.entities = max(0, u.entities-held+used)
			l.mark(k)
		}
	}
}

// key is the map key of a token or account: the store's hash once attached.
func (l *Limiter) key(raw string) string { return l.store.Key(raw) }

// mark records that key's counters changed, for the store (l.mu held).
func (l *Limiter) mark(key string) {
	if l.store != nil {
		l.dirty[key] = struct{}{}
		l.store.Changed()
	}
}
