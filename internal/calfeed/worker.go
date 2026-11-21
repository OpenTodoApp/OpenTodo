package calfeed

import (
	"context"
	"errors"
	"log/slog"
	"net/url"
	"sync"

	"github.com/OpenTodoApp/opentodo/internal/poll"
)

// InFlight bounds the fetches running at once (design D3): a background pass
// and the inline fetches of the routes share it.
const InFlight = 2

// Worker fetches due subscriptions in the background, under the jobs leader.
type Worker struct {
	Store   *Store
	Fetcher *Fetcher
	// Enabled reports the owner switch; nothing is fetched while it is off.
	Enabled func(ctx context.Context) bool
	// Notify wakes the user's devices when their events changed.
	Notify func(userID string)
	Log    *slog.Logger

	slotsOnce sync.Once
	slots     chan struct{}
}

// acquire waits for one of the InFlight slots, or for ctx to end.
func (w *Worker) acquire(ctx context.Context) error {
	w.slotsOnce.Do(func() { w.slots = make(chan struct{}, InFlight) })
	select {
	case w.slots <- struct{}{}:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (w *Worker) release() { <-w.slots }

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
	poll.Each(due, InFlight, func(sub *Subscription) { _, _ = w.Refresh(ctx, sub) })
}

// Refresh fetches one subscription now and records the outcome (also used by
// the routes for the inline fetch on create, URL change and Refresh now). It
// waits for one of the InFlight slots first; a ctx that ends while it waits
// returns its error and records nothing.
func (w *Worker) Refresh(ctx context.Context, sub *Subscription) (*Result, error) {
	if err := w.acquire(ctx); err != nil {
		return nil, err
	}
	defer w.release()
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
