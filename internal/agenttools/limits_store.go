package agenttools

import (
	"time"

	"github.com/OpenTodoApp/opentodo/internal/ratelimit"
)

// Stored agent limits (OpenSpec change persistent-limits, design D4): one row
// per token or account, holding the UTC day its entity count belongs to (Start,
// that day's midnight), the count, and the call times of the last minute.

// LimiterName is the stored rows' limiter.
const LimiterName = "agent"

// Attach makes store keep the limiter's counters and restores what it held.
// Keys are then the store's hashes of token ids and accounts.
func (l *Limiter) Attach(store *ratelimit.Store) {
	l.mu.Lock()
	l.store = store
	l.mu.Unlock()
	store.Register(LimiterName, l)
}

// Restore implements ratelimit.Part.
func (l *Limiter) Restore(rows []ratelimit.Row) {
	l.mu.Lock()
	defer l.mu.Unlock()
	for _, r := range rows {
		u := &usage{day: time.UnixMilli(r.Start).UTC().Format(dayLayout), entities: r.Count}
		for _, h := range r.Hits {
			u.calls = append(u.calls, time.UnixMilli(h))
		}
		u.last = time.UnixMilli(r.Start)
		if n := len(u.calls); n > 0 {
			u.last = u.calls[n-1]
		}
		l.tokens[r.Key] = u
	}
}

// Flush implements ratelimit.Part.
func (l *Limiter) Flush(now time.Time) (put []ratelimit.Row, gone []string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	for k := range l.dirty {
		u, ok := l.tokens[k]
		day, err := time.Parse(dayLayout, u.dayOr(""))
		if !ok || err != nil {
			gone = append(gone, k)
			continue
		}
		r := ratelimit.Row{Key: k, Start: day.UnixMilli(), Ends: day.AddDate(0, 0, 1).UnixMilli(), Count: u.entities}
		for _, c := range u.calls {
			r.Hits = append(r.Hits, c.UnixMilli())
			r.Ends = max(r.Ends, c.Add(time.Minute).UnixMilli())
		}
		put = append(put, r)
	}
	clear(l.dirty)
	return put, gone
}

func (u *usage) dayOr(def string) string {
	if u == nil {
		return def
	}
	return u.day
}
