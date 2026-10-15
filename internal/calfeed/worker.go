package calfeed

import (
	"context"
	"errors"
	"log/slog"
	"net/url"
	"sync"
	"time"
)

// Worker pacing (design D3).
const (
	PollInterval = 30 * time.Second
	InFlight     = 2
)

// Worker fetches due subscriptions in the background, under the jobs leader.
type Worker struct {
	Store   *Store
	Fetcher *Fetcher
	// Enabled reports the owner switch; nothing is fetched while it is off.
	Enabled func(ctx context.Context) bool
	// Notify wakes the user's devices when their events changed.
	Notify func(userID string)
	Log    *slog.Logger
}

// Run polls until ctx ends.
func (w *Worker) Run(ctx context.Context) {
	t := time.NewTicker(PollInterval)
	defer t.Stop()
	for {
		w.RunOnce(ctx)
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

// RunOnce fetches the subscriptions due now, at most InFlight at a time, and
// waits for them.
func (w *Worker) RunOnce(ctx context.Context) {
	if w.Enabled != nil && !w.Enabled(ctx) {
		return
	}
	due, err := w.Store.Due(ctx, 50)
	if err != nil {
		w.log().Error("calendar feeds: due", "err", err)
		return
	}
	sem := make(chan struct{}, InFlight)
	var wg sync.WaitGroup
	for i := range due {
		sub := due[i]
		sem <- struct{}{}
		wg.Add(1)
		go func() {
			defer func() { <-sem; wg.Done() }()
			_, _ = w.Refresh(ctx, &sub)
		}()
	}
	wg.Wait()
}

// Refresh fetches one subscription now and records the outcome (also used by
// the routes for the inline fetch on create, URL change and Refresh now).
func (w *Worker) Refresh(ctx context.Context, sub *Subscription) (*Result, error) {
	res, err := w.Fetcher.Fetch(ctx, sub)
	host := ""
	if u, perr := url.Parse(sub.URL); perr == nil {
		host = u.Host // the path may carry a secret (Google's private address): never logged
	}
	if err != nil {
		var fe *FetchError
		reason := "connection_failed"
		if errors.As(err, &fe) {
			reason = fe.Reason
		}
		w.log().Debug("calendar feeds: fetch failed", "host", host, "reason", reason)
		if rerr := w.Store.Failure(ctx, sub.ID, reason); rerr != nil {
			w.log().Error("calendar feeds: record failure", "err", rerr)
		}
		return nil, err
	}
	w.log().Debug("calendar feeds: fetched", "host", host, "replaced", res.Replaced, "events", len(res.Occurrences))
	if err := w.Store.Success(ctx, sub.ID, res); err != nil {
		w.log().Error("calendar feeds: store", "err", err)
		return nil, err
	}
	if res.Replaced && w.Notify != nil {
		w.Notify(sub.UserID)
	}
	return res, nil
}

func (w *Worker) log() *slog.Logger {
	if w.Log == nil {
		return slog.Default()
	}
	return w.Log
}
