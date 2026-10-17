package httpapi

import (
	"sync"
	"time"
	"weak"
)

// sweepInterval is how often the background sweep runs.
const sweepInterval = time.Minute

// limiterSweeper sweeps every live limiter once per sweepInterval. It holds
// weak pointers, so a limiter of a closed server (a tenant, a test) is
// collected and dropped from the list.
var limiterSweeper sweeper

type sweeper struct {
	mu    sync.Mutex
	once  sync.Once
	limit []weak.Pointer[rateLimiter]
}

func (s *sweeper) add(l *rateLimiter) {
	s.mu.Lock()
	s.limit = append(s.limit, weak.Make(l))
	s.mu.Unlock()
	s.once.Do(func() {
		go func() {
			for now := range time.Tick(sweepInterval) {
				s.run(now)
			}
		}()
	})
}

func (s *sweeper) run(now time.Time) {
	s.mu.Lock()
	live := s.limit[:0]
	var todo []*rateLimiter
	for _, p := range s.limit {
		if l := p.Value(); l != nil {
			live = append(live, p)
			todo = append(todo, l)
		}
	}
	clear(s.limit[len(live):])
	s.limit = live
	s.mu.Unlock()
	for _, l := range todo {
		l.sweep(now)
	}
}
