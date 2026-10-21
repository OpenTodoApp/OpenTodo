package rules

import (
	"sync"
	"time"
)

// Fixed bounds (design D8, documented in docs/automations.md). Counters are in
// memory per tenant: they contain mistakes, they do not bill, so a restart
// resets them.
const (
	PerMinute     = 60
	PerDay        = 2000
	PerRun        = 500
	MaxRules      = 50
	MaxChainDepth = 3
	// RunawayRefusals per-minute refusals within RunawayWindow pause a rule.
	RunawayRefusals = 3
	RunawayWindow   = time.Hour
)

// Refusal reasons of a limit.
const (
	limitMinute = "limit: per minute"
	limitDay    = "limit: per day"
)

type userCount struct {
	minute    int64 // the minute (Unix) counted
	inMinute  int
	day       string // the UTC day counted
	inDay     int
}

// limiter counts the runs that applied changes per account.
type limiter struct {
	mu    sync.Mutex
	users map[string]*userCount
}

func newLimiter() *limiter { return &limiter{users: map[string]*userCount{}} }

func (l *limiter) count(uid string, now time.Time) *userCount {
	c := l.users[uid]
	if c == nil {
		c = &userCount{}
		l.users[uid] = c
	}
	if m := now.Unix() / 60; c.minute != m {
		c.minute, c.inMinute = m, 0
	}
	if d := now.UTC().Format("2006-01-02"); c.day != d {
		c.day, c.inDay = d, 0
	}
	return c
}

// check reports the limit a run would exceed ("" when it may run).
func (l *limiter) check(uid string, now time.Time) string {
	l.mu.Lock()
	defer l.mu.Unlock()
	c := l.count(uid, now)
	switch {
	case c.inDay >= PerDay:
		return limitDay
	case c.inMinute >= PerMinute:
		return limitMinute
	}
	return ""
}

// take counts one run that applied changes.
func (l *limiter) take(uid string, now time.Time) {
	l.mu.Lock()
	defer l.mu.Unlock()
	c := l.count(uid, now)
	c.inMinute++
	c.inDay++
}

// refusalsWithin keeps the refusals of the last window and adds now: the
// rule is a runaway when the result holds RunawayRefusals or more.
func refusalsWithin(list []int64, now time.Time) []int64 {
	cut := now.Add(-RunawayWindow).UnixMilli()
	out := []int64{}
	for _, at := range list {
		if at > cut {
			out = append(out, at)
		}
	}
	return append(out, now.UnixMilli())
}
