package host

import (
	"context"
	"database/sql"
	"sync"
	"time"

	"github.com/pixari/opentodo/internal/config"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// quota is one open tenant's write limits (design D5), installed as the sync
// service's Quota. The database size is read in each batch's transaction; the
// operation counts are seeded from the op log when the tenant opens and then
// kept in memory, so a batch costs no scan of the log.
type quota struct {
	lim config.Limits
	now func() time.Time

	mu     sync.Mutex
	seeded bool
	total  int
	// minutes holds the ops stored in each of the last 60 minutes.
	minutes [60]int
	stamp   [60]int64 // the minute (Unix minutes) each slot counts
}

func newQuota(lim config.Limits, now func() time.Time) *quota {
	if lim.DBMB == 0 && lim.OpsPerHour == 0 && lim.OpsTotal == 0 {
		return nil
	}
	return &quota{lim: lim, now: now}
}

// Admit implements opsync.Quota.
func (q *quota) Admit(ctx context.Context, tx *sql.Tx) (func(op opsync.Op) string, error) {
	q.mu.Lock()
	defer q.mu.Unlock()
	if !q.seeded && (q.lim.OpsTotal > 0 || q.lim.OpsPerHour > 0) {
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM ops`).Scan(&q.total); err != nil {
			return nil, err
		}
		var hour int
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM ops WHERE received_at >= ?`, q.now().Add(-time.Hour).UnixMilli()).Scan(&hour); err != nil {
			return nil, err
		}
		q.addLocked(hour)
		q.seeded = true
	}
	full := false
	if q.lim.DBMB > 0 {
		var pages, free, size int64
		if err := tx.QueryRowContext(ctx, `SELECT (SELECT page_count FROM pragma_page_count()), (SELECT freelist_count FROM pragma_freelist_count()), (SELECT page_size FROM pragma_page_size())`).Scan(&pages, &free, &size); err != nil {
			return nil, err
		}
		full = (pages-free)*size >= int64(q.lim.DBMB)<<20
	}
	total, hour := q.total, q.hourLocked()
	admitted := 0
	return func(op opsync.Op) string {
		switch {
		// Moving things to the Trash is always allowed, so a full tenant can
		// make room (emptying the Trash purges them).
		case full && op.Field != "deleted_at":
			return opsync.ReasonLimitStorage
		case q.lim.OpsTotal > 0 && total+admitted >= q.lim.OpsTotal:
			return opsync.ReasonLimitOpsTotal
		case q.lim.OpsPerHour > 0 && hour+admitted >= q.lim.OpsPerHour:
			return opsync.ReasonLimitOpsHour
		}
		admitted++
		return ""
	}, nil
}

// Stored implements opsync.Quota.
func (q *quota) Stored(n int) {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.total += n
	q.addLocked(n)
}

func (q *quota) addLocked(n int) {
	m := q.now().Unix() / 60
	i := m % 60
	if q.stamp[i] != m {
		q.stamp[i], q.minutes[i] = m, 0
	}
	q.minutes[i] += n
}

func (q *quota) hourLocked() int {
	m := q.now().Unix() / 60
	sum := 0
	for i := range q.minutes {
		if m-q.stamp[i] < 60 {
			sum += q.minutes[i]
		}
	}
	return sum
}

// requestLimiter counts requests per tenant in fixed one-minute windows.
type requestLimiter struct {
	now func() time.Time
	mu  sync.Mutex
	win map[string]*window
}

type window struct {
	start time.Time
	n     int
}

func newRequestLimiter(now func() time.Time) *requestLimiter {
	return &requestLimiter{now: now, win: map[string]*window{}}
}

// allow counts one request for name and reports whether it is within limit
// per minute (0 means unlimited).
func (l *requestLimiter) allow(name string, limit int) bool {
	if limit <= 0 {
		return true
	}
	now := l.now()
	l.mu.Lock()
	defer l.mu.Unlock()
	w := l.win[name]
	if w == nil || now.Sub(w.start) >= time.Minute {
		if len(l.win) > 10000 {
			for k, v := range l.win {
				if now.Sub(v.start) >= time.Minute {
					delete(l.win, k)
				}
			}
		}
		w = &window{start: now}
		l.win[name] = w
	}
	w.n++
	return w.n <= limit
}
