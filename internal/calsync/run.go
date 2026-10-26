package calsync

import (
	"context"
	"encoding/base64"
	"errors"
	"net/http"
	"time"
)

// CycleError is a failed cycle with the reason stored on the connection.
type CycleError struct{ Reason string }

func (e *CycleError) Error() string { return "calendar sync failed: " + e.Reason }

// Cycle runs one sync of c now and records the outcome (also Sync now). A
// failed cycle keeps what it already did; the error is a *CycleError.
func (w *Worker) Cycle(ctx context.Context, c *Connection) (RunCounts, error) {
	sem := w.slots()
	select {
	case sem <- struct{}{}:
	case <-ctx.Done():
		return RunCounts{}, ctx.Err()
	}
	defer func() { <-sem }()
	l := w.lock(c.ID)
	l.Lock()
	defer l.Unlock()
	// Reload: a cycle that waited may find the connection changed or gone.
	fresh, err := w.Store.ByID(ctx, c.ID)
	if err != nil {
		return RunCounts{}, err
	}
	c = fresh
	if !c.Enabled || c.StoppedReason != "" || c.TargetURL == "" {
		return RunCounts{}, &CycleError{Reason: firstOf(c.StoppedReason, "not_syncable")}
	}
	cctx, cancel := context.WithTimeout(ctx, CycleTimeout)
	defer cancel()
	r := &cycle{w: w, c: c, target: dirURL(c.TargetURL)}
	err = w.prepare(cctx, r)
	if err == nil {
		err = r.run(cctx)
	}
	if err != nil {
		return r.counts, w.fail(ctx, r, err)
	}
	if err := w.Store.Success(ctx, c.ID, r.syncToken, r.ver.key(), r.counts); err != nil {
		return r.counts, err
	}
	w.log().Debug("calendar sync: cycle", "connection", c.ID, "moved", r.counts.Moved, "written", r.counts.Written, "removed", r.counts.Removed)
	return r.counts, nil
}

func (w *Worker) prepare(ctx context.Context, r *cycle) error {
	if w.Tasks == nil {
		return errors.New("calendar sync: no task source")
	}
	dav, err := w.Client(ctx, r.c)
	if err != nil {
		return err
	}
	r.dav = dav
	return nil
}

// fail records a failed cycle and returns its *CycleError.
func (w *Worker) fail(ctx context.Context, r *cycle, err error) error {
	reason := reasonOf(err)
	if errors.Is(err, context.DeadlineExceeded) {
		reason = ReasonTimeout
	}
	if reason == "internal_error" {
		w.log().Error("calendar sync: cycle", "connection", r.c.ID, "err", err)
	} else {
		w.log().Debug("calendar sync: cycle failed", "connection", r.c.ID, "reason", reason)
	}
	var until time.Time
	var e *Error
	if errors.As(err, &e) {
		until = e.Until
	}
	if reason == ReasonUnauthorized {
		w.Forget(r.c.ID)
	}
	if rerr := w.Store.Failure(ctx, r.c, reason, until, r.counts); rerr != nil {
		w.log().Error("calendar sync: record failure", "err", rerr)
	}
	return &CycleError{Reason: reason}
}

func firstOf(a, b string) string {
	if a != "" {
		return a
	}
	return b
}

// DiscoverCalDAV runs discovery for a CalDAV account before it is stored (the
// create route): start is what the user typed.
func (w *Worker) DiscoverCalDAV(ctx context.Context, start, username, password string) (string, *Discovery, error) {
	base, err := StartURL(start)
	if err != nil {
		return "", nil, err
	}
	d, err := basicDAV(w, base, username, password).Discover(ctx, base)
	return base, d, err
}

func basicDAV(w *Worker, base, username, password string) *DAV {
	auth := "Basic " + base64.StdEncoding.EncodeToString([]byte(username+":"+password))
	return NewDAV(w.HTTP, base, func(h http.Header) { h.Set("Authorization", auth) }, w.Version)
}

// DiscoverGoogle runs discovery for a Google account with a fresh access token.
func (w *Worker) DiscoverGoogle(ctx context.Context, access string) (*Discovery, error) {
	dav := NewDAV(w.HTTP, w.GoogleBase, func(h http.Header) { h.Set("Authorization", "Bearer "+access) }, w.Version)
	return dav.Discover(ctx, w.GoogleBase)
}

// Rediscover runs discovery again for a stored connection (Sync now, a new
// password, a Google reconnect) and records what it found.
func (w *Worker) Rediscover(ctx context.Context, c *Connection) error {
	dav, err := w.Client(ctx, c)
	if err != nil {
		return err
	}
	start := c.ServerURL
	if c.Provider == ProviderGoogle {
		start = w.GoogleBase
	}
	d, err := dav.Discover(ctx, start)
	if err != nil {
		return err
	}
	return w.Store.SaveDiscovery(ctx, c, d.Principal, d.Home, d.Calendars)
}

// RememberToken caches a Google access token just obtained (the callback).
func (w *Worker) RememberToken(connID string, t Token) { w.tokens.put(connID, t) }
