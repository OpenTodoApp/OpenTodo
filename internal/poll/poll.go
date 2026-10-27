// Package poll is the pass shared by the subscription pollers (calendar
// feeds, issue connections): the items due now, handled with bounded
// concurrency. When a pass runs is the tenant's jobs' business (internal/jobs).
package poll

import "sync"

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
