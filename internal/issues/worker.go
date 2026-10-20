package issues

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"sync"
	"time"

	"github.com/pixari/opentodo/internal/e2ee"
	ob "github.com/pixari/opentodo/internal/outbound"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// Worker pacing and bounds (design D9, spec "Connection limits per server").
const (
	PollInterval = 30 * time.Second
	InFlight     = 2
	MaxPages     = 10
	sweepEvery   = time.Hour
)

// PollError is a failed poll with the reason stored on the connection; Until
// is set for the provider's rate limit.
type PollError struct {
	Reason string
	Until  time.Time
}

func (e *PollError) Error() string { return "issue poll failed: " + e.Reason }

// Worker polls due connections in the background, under the jobs leader, and
// runs the hand-triggered syncs and token checks of the routes and the CLI.
type Worker struct {
	Store  *Store
	Tokens *Tokens
	Sync   *opsync.Service
	// Client is the outbound client of every provider request; Dialer checks a
	// connection's host before each poll (the same AllowPrivate switch).
	Client  *http.Client
	Dialer  *ob.Dialer
	Version string
	// Enabled reports the owner switch; nothing is polled while it is off.
	Enabled func(ctx context.Context) bool
	Log     *slog.Logger
	// NewProvider builds a connection's client (tests use a fake).
	NewProvider func(c *Connection, token string) (Provider, error)

	keys  *e2ee.Store
	now   func() time.Time
	sem   chan struct{}
	mu    sync.Mutex
	locks map[string]*sync.Mutex
}

// NewWorker wires the worker on the server database and data directory, with
// the webhooks' private-network switch.
func NewWorker(db *sql.DB, dataDir string, syncSvc *opsync.Service, allowPrivate func(context.Context) bool, version string, log *slog.Logger) *Worker {
	w := &Worker{Store: NewStore(db), Tokens: NewTokens(dataDir), Sync: syncSvc, Client: NewHTTPClient(allowPrivate),
		Dialer: &ob.Dialer{Resolver: net.DefaultResolver, AllowPrivate: allowPrivate}, Version: version, Log: log, keys: e2ee.NewStore(db)}
	w.NewProvider = func(c *Connection, token string) (Provider, error) {
		return NewProvider(w.Client, c.Provider, c.Host, token, w.Version)
	}
	return w
}

// SetClock replaces the worker's and its store's clock (tests).
func (w *Worker) SetClock(now func() time.Time) { w.now = now; w.Store.SetClock(now) }

func (w *Worker) clock() time.Time {
	if w.now != nil {
		return w.now()
	}
	return time.Now()
}

func (w *Worker) log() *slog.Logger {
	if w.Log == nil {
		return slog.Default()
	}
	return w.Log
}

func (w *Worker) slots() chan struct{} {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.sem == nil {
		w.sem = make(chan struct{}, InFlight)
	}
	return w.sem
}

// lock serialises polls of one connection (a hand sync waits for a scheduled one).
func (w *Worker) lock(id string) *sync.Mutex {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.locks == nil {
		w.locks = map[string]*sync.Mutex{}
	}
	if w.locks[id] == nil {
		w.locks[id] = &sync.Mutex{}
	}
	return w.locks[id]
}

// Run polls until ctx ends and sweeps tokens without a connection hourly.
func (w *Worker) Run(ctx context.Context) {
	t := time.NewTicker(PollInterval)
	defer t.Stop()
	var swept time.Time
	for {
		if time.Since(swept) >= sweepEvery {
			swept = time.Now()
			if n, err := w.Tokens.Sweep(ctx, w.Store); err != nil {
				w.log().Error("issue connections: sweep tokens", "err", err)
			} else if n > 0 {
				w.log().Debug("issue connections: removed tokens without a connection", "count", n)
			}
		}
		w.RunOnce(ctx)
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

// RunOnce polls the connections due now, at most InFlight at a time, and
// waits for them.
func (w *Worker) RunOnce(ctx context.Context) {
	if w.Enabled != nil && !w.Enabled(ctx) {
		return
	}
	due, err := w.Store.Due(ctx, 50)
	if err != nil {
		w.log().Error("issue connections: due", "err", err)
		return
	}
	var wg sync.WaitGroup
	for i := range due {
		c := due[i]
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, _ = w.Poll(ctx, &c)
		}()
	}
	wg.Wait()
}

// Check asks the provider for the token's account and records the result on
// the connection's status (spec "Token check"); a refused token is reported
// and stops the schedule until a new token is set. The token is unchanged.
func (w *Worker) Check(ctx context.Context, c *Connection) (Account, error) {
	acc, err := w.check(ctx, c)
	if err != nil {
		pe := w.pollError(err)
		if pe.Reason == "internal_error" {
			return acc, err
		}
		if pe.Reason == ReasonRateLimited {
			err = w.Store.RateLimited(ctx, c, Progress{ETags: c.etags, SinceMs: c.sinceMs, RepoIndex: c.repoIndex, Page: c.page, ReconciledAt: c.reconciledAt,
				Counts: derefRun(c.LastRun)}, pe.Until)
		} else {
			err = w.Store.CheckFailed(ctx, c.ID, pe.Reason)
		}
		if err != nil {
			return acc, err
		}
		return acc, pe
	}
	if err := w.Store.Account(ctx, c.ID, acc.Login, acc.CanReadIssues); err != nil {
		return acc, err
	}
	return acc, w.Store.CheckSucceeded(ctx, c.ID)
}

func (w *Worker) check(ctx context.Context, c *Connection) (Account, error) {
	token, err := w.Tokens.Get(c.ID)
	if err != nil {
		return Account{}, err
	}
	if token == "" {
		return Account{}, &PollError{Reason: ReasonTokenMissing}
	}
	if reason := w.hostReason(ctx, c.Host); reason != "" {
		return Account{}, &PollError{Reason: reason}
	}
	p, err := w.NewProvider(c, token)
	if err != nil {
		return Account{}, err
	}
	return p.Account(ctx)
}

func derefRun(r *RunCounts) RunCounts {
	if r == nil {
		return RunCounts{}
	}
	return *r
}

// hostReason checks the connection's host against the outbound policy:
// "" when allowed, else the reason.
func (w *Worker) hostReason(ctx context.Context, host string) string {
	u, err := url.Parse(host)
	if err != nil || u.Hostname() == "" {
		return ReasonConnection
	}
	if _, err := w.Dialer.Allowed(ctx, u.Hostname()); err != nil {
		if errors.Is(err, ob.ErrPrivateTarget) {
			return ReasonPrivateTarget
		}
		return ReasonConnection
	}
	return ""
}

func (w *Worker) pollError(err error) *PollError {
	var rl *RateLimitedError
	var rej *opsync.RejectedError
	switch {
	case errors.As(err, &rl):
		return &PollError{Reason: ReasonRateLimited, Until: rl.Until}
	case errors.As(err, &rej):
		return &PollError{Reason: rej.Reason}
	}
	var pe *PollError
	if errors.As(err, &pe) {
		return pe
	}
	var e *Error
	if errors.As(err, &e) {
		return &PollError{Reason: e.Reason}
	}
	return &PollError{Reason: "internal_error"}
}

// Poll runs one poll of c now and records the outcome (also the routes' Sync
// now and `ot issues sync`). A failed poll changes nothing about the tasks
// already created; the returned error is a *PollError.
func (w *Worker) Poll(ctx context.Context, c *Connection) (RunCounts, error) {
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
	// Reload: a poll that waited may find the connection changed or gone.
	fresh, err := w.Store.ByID(ctx, c.ID)
	if err != nil {
		return RunCounts{}, err
	}
	c = fresh
	if !c.Enabled || c.StoppedReason != "" {
		// Disabled or stopped while the poll waited: nothing is requested or recorded.
		return RunCounts{}, &PollError{Reason: firstOf(c.StoppedReason, "connection_disabled")}
	}
	r := &run{w: w, c: c, prog: Progress{ETags: map[string]string{}, SinceMs: c.sinceMs, RepoIndex: c.repoIndex, Page: c.page, ReconciledAt: c.reconciledAt}}
	for k, v := range c.etags {
		r.prog.ETags[k] = v
	}
	if err := w.prepare(ctx, r); err != nil {
		return r.prog.Counts, w.fail(ctx, r, err)
	}
	if err := r.all(ctx); err != nil {
		return r.prog.Counts, w.fail(ctx, r, err)
	}
	if err := w.Store.Success(ctx, c, r.prog); err != nil {
		return r.prog.Counts, err
	}
	w.log().Debug("issue connections: polled", "connection", c.ID, "created", r.prog.Counts.Created, "partial", r.prog.Counts.Partial)
	return r.prog.Counts, nil
}

// prepare checks the token, the account's encryption and the host, and builds
// the provider client, learning the account login when the filter needs it.
func (w *Worker) prepare(ctx context.Context, r *run) error {
	token, err := w.Tokens.Get(r.c.ID)
	if err != nil {
		return err
	}
	if token == "" {
		return &PollError{Reason: ReasonTokenMissing}
	}
	if on, err := w.keys.Enabled(ctx, r.c.UserID); err != nil {
		return err
	} else if on {
		return &PollError{Reason: ReasonEncrypted}
	}
	if reason := w.hostReason(ctx, r.c.Host); reason != "" {
		return &PollError{Reason: reason}
	}
	if r.p, err = w.NewProvider(r.c, token); err != nil {
		return err
	}
	if r.c.Filter.Scope == ScopeRepositories && r.c.AccountLogin == "" {
		acc, err := r.p.Account(ctx)
		if err != nil {
			return err
		}
		r.c.AccountLogin = acc.Login
		if err := w.Store.Account(ctx, r.c.ID, acc.Login, acc.CanReadIssues); err != nil {
			return err
		}
	}
	if r.links, err = w.Store.Links(ctx, r.c.ID); err != nil {
		return err
	}
	return nil
}

// fail records a failed poll and returns its *PollError.
func (w *Worker) fail(ctx context.Context, r *run, err error) error {
	pe := w.pollError(err)
	if pe.Reason == "internal_error" {
		w.log().Error("issue connections: poll", "connection", r.c.ID, "err", err)
	} else {
		w.log().Debug("issue connections: poll failed", "connection", r.c.ID, "reason", pe.Reason)
	}
	var rerr error
	if pe.Reason == ReasonRateLimited {
		rerr = w.Store.RateLimited(ctx, r.c, r.prog, pe.Until)
	} else {
		rerr = w.Store.Failure(ctx, r.c, r.prog, pe.Reason)
	}
	if rerr != nil {
		w.log().Error("issue connections: record failure", "err", rerr)
	}
	return pe
}

func firstOf(a, b string) string {
	if a != "" {
		return a
	}
	return b
}
