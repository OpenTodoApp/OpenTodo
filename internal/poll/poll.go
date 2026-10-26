// Package poll is the shape shared by the subscription pollers (calendar
// feeds, issue connections): a ticker loop and a pass that handles the items
// due now with bounded concurrency.
package poll

import (
	"context"
	"sync"
	"time"
)

// Every runs pass now and then every interval until ctx ends.
func Every(ctx context.Context, interval time.Duration, pass func(context.Context)) {
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		pass(ctx)
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

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
