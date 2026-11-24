// Package poll is the pass shared by the subscription pollers (calendar
// feeds, issue connections): the items due now, handled with bounded
// concurrency. When a pass runs is the tenant's jobs' business (internal/jobs).
package poll

import (
	"context"
	"sync"
)

// Each runs fn for every item, at most limit at a time, and waits for all.
func Each[T any](items []T, limit int, fn func(*T)) {
	sem := make(chan struct{}, limit)
	var wg sync.WaitGroup
	for i := range items {
		sem <- struct{}{}
		wg.Add(1)
		go func() {
			defer func() { <-sem; wg.Done() }()
			fn(&items[i])
		}()
	}
	wg.Wait()
}

// Gate bounds a worker's runs: at most limit at once, and one at a time per
// connection, so a run by hand waits for a scheduled one. The zero value is
// ready; the first Enter fixes the limit.
type Gate struct {
	mu    sync.Mutex
	sem   chan struct{}
	locks map[string]*sync.Mutex
}

// Enter waits for a free slot, then for id's lock, and returns the function that
// releases both. It gives up with ctx's error while it waits for the slot.
func (g *Gate) Enter(ctx context.Context, limit int, id string) (release func(), err error) {
	g.mu.Lock()
	if g.sem == nil {
		g.sem = make(chan struct{}, limit)
		g.locks = map[string]*sync.Mutex{}
	}
	sem, l := g.sem, g.locks[id]
	if l == nil {
		l = &sync.Mutex{}
		g.locks[id] = l
	}
	g.mu.Unlock()
	select {
	case sem <- struct{}{}:
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	l.Lock()
	return func() { l.Unlock(); <-sem }, nil
}
