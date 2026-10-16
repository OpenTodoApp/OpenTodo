package host

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/store"
	opsync "github.com/pixari/opentodo/internal/sync"
	"github.com/pixari/opentodo/internal/tenant"
	"github.com/pixari/opentodo/internal/web"
)

// Options configure Open.
type Options struct {
	Version string
	Log     *slog.Logger
	// Now is the clock of the pool, the limits and the scheduler (tests).
	Now func() time.Time
	// Tenant adjusts a tenant's options before it opens (tests point web push
	// at a fake push service through it).
	Tenant func(name string, o *tenant.Options)
}

// Host routes requests to tenants by host name and runs their background work.
type Host struct {
	cfg     config.Config
	hc      *config.HostConfig
	root    string
	reg     *Registry
	pool    *pool
	reqs    *requestLimiter
	log     *slog.Logger
	version string
	now     func() time.Time
	web     http.Handler
	adjust  func(string, *tenant.Options)
	unlock  func()

	// records caches registry lookups of the request path for a moment.
	recMu   sync.Mutex
	records map[string]cachedRecord

	// Scheduler state (scheduler.go).
	dirtyMu  sync.Mutex
	dirty    map[string]bool
	wake     chan struct{}
	lastFull time.Time
	// createMu serialises tenant creation (operator.go).
	createMu sync.Mutex
}

type cachedRecord struct {
	rec Record
	err error
	at  time.Time
}

// recordTTL bounds how stale a cached registry entry may be; operator actions
// in this process invalidate it at once.
const recordTTL = 2 * time.Second

// Open prepares host mode for cfg (cfg.Host must be set): the registry in
// cfg.DataDir and the tenants directory beside it. Tenants open on demand.
func Open(cfg config.Config, o Options) (*Host, error) {
	if cfg.Host == nil {
		return nil, errors.New("host mode is not configured")
	}
	root := cfg.DataDir
	if _, err := os.Stat(store.DBPath(root)); err == nil {
		return nil, fmt.Errorf("%s holds a self-hosted server's database: host mode needs its own data directory (create a tenant from an archive of this one instead)", root)
	}
	unlock, err := store.LockShared(root)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", root, err)
	}
	now := o.Now
	if now == nil {
		now = time.Now
	}
	log := o.Log
	if log == nil {
		log = slog.Default()
	}
	if err := os.MkdirAll(filepath.Join(root, TenantsDir), 0o750); err != nil {
		unlock()
		return nil, err
	}
	reg, err := OpenRegistry(root, now)
	if err != nil {
		unlock()
		return nil, err
	}
	h := &Host{cfg: cfg, hc: cfg.Host, root: root, reg: reg, reqs: newRequestLimiter(now), log: log, version: o.Version,
		now: now, web: web.HandlerWith(web.Options{}), adjust: o.Tenant, unlock: unlock,
		records: map[string]cachedRecord{}, dirty: map[string]bool{}, wake: make(chan struct{}, 1)}
	h.pool = newPool(cfg.Host.MaxOpen, cfg.Host.IdleTimeout, now)
	h.pool.open = h.openTenant
	h.pool.beforeClose = func(name string, t *tenant.Tenant) { h.refreshDue(context.Background(), name, t, nil) }
	return h, nil
}

// Close closes every open tenant, the registry and the root lock.
func (h *Host) Close() error {
	h.pool.closeAll()
	err := h.reg.Close()
	h.unlock()
	return err
}

// Registry exposes the host registry (tests and the operator interface).
func (h *Host) Registry() *Registry { return h.reg }

// TenantDir is the data directory of a tenant.
func (h *Host) TenantDir(name string) string { return filepath.Join(h.root, TenantsDir, name) }

// tenantConfig derives a tenant's configuration from the process's: its own
// data directory and public address, its setup token and limits, and the
// operator's settings for everything else (design D4).
func (h *Host) tenantConfig(rec Record) (config.Config, config.Limits) {
	c := h.cfg
	c.Host = nil
	c.DataDir = h.TenantDir(rec.Name)
	c.BaseURL = h.hc.TenantURL(rec.Name)
	c.SetupToken = rec.setupToken
	c.Warnings = nil
	lim := h.hc.Limits.Merge(rec.Limits)
	if lim.ImportMB > 0 {
		c.ImportMaxMB = lim.ImportMB
	}
	// Backup presets (seeded when a tenant first opens): each tenant writes
	// under its own name at the operator's destination.
	if c.Backup.Present {
		b := c.Backup
		if b.LocalDir != "" {
			b.LocalDir = filepath.Join(b.LocalDir, rec.Name)
		}
		b.S3Prefix = path.Join(b.S3Prefix, rec.Name)
		if b.WebDAVURL != "" {
			b.WebDAVURL = strings.TrimRight(b.WebDAVURL, "/") + "/" + rec.Name
		}
		c.Backup = b
	}
	return c, lim
}

// openTenant opens one tenant for the pool. A failure (a migration that does
// not apply) is recorded for the operator and makes only this tenant answer 503.
func (h *Host) openTenant(_ context.Context, name string) (*tenant.Tenant, error) {
	// Never cut short by the request that triggered it: others may wait on it.
	ctx := context.Background()
	rec, err := h.reg.Get(ctx, name)
	if err != nil {
		return nil, err
	}
	if rec.State == StateDeleted {
		return nil, ErrNotFound
	}
	cfg, lim := h.tenantConfig(rec)
	var q opsync.Quota
	if qq := newQuota(lim, h.now); qq != nil {
		q = qq
	}
	opts := tenant.Options{Version: h.version, Log: h.log.With("tenant", name), Web: h.web,
		// A web restore is refused on a host; should one be confirmed anyway,
		// closing the tenant applies it on the next open.
		Restart: func() { go h.pool.evict(name) },
		Hosted: &tenant.Hosted{Name: name, PushSubject: h.hc.URL.Scheme + "://" + h.hc.URL.Host, Quota: q,
			MaxMembers: lim.Members, Changed: func() { h.markDirty(name) }}}
	if h.adjust != nil {
		h.adjust(name, &opts)
	}
	start := h.now()
	t, err := tenant.Open(ctx, cfg, opts)
	if err != nil {
		h.log.Error("tenant unavailable: it could not be opened", "tenant", name, "err", err)
		if serr := h.reg.SetError(ctx, name, err.Error()); serr != nil {
			h.log.Error("host registry", "err", serr)
		}
		return nil, err
	}
	if rec.LastError != "" {
		_ = h.reg.SetError(ctx, name, "")
	}
	h.log.Debug("tenant opened", "tenant", name, "duration", h.now().Sub(start))
	h.refreshDue(ctx, name, t, nil)
	return t, nil
}

// record looks a tenant up, through the short cache.
func (h *Host) record(ctx context.Context, name string) (Record, error) {
	now := h.now()
	h.recMu.Lock()
	c, ok := h.records[name]
	h.recMu.Unlock()
	if ok && now.Sub(c.at) < recordTTL {
		return c.rec, c.err
	}
	rec, err := h.reg.Get(ctx, name)
	if err != nil && !errors.Is(err, ErrNotFound) {
		return rec, err
	}
	h.recMu.Lock()
	if len(h.records) > 10000 {
		h.records = map[string]cachedRecord{}
	}
	h.records[name] = cachedRecord{rec: rec, err: err, at: now}
	h.recMu.Unlock()
	return rec, err
}

func (h *Host) forget(name string) {
	h.recMu.Lock()
	delete(h.records, name)
	h.recMu.Unlock()
}

// tenantName returns the tenant label of a request's host name: the one label
// in front of the host URL's name ("smith" in smith.example.cloud).
func (h *Host) tenantName(hostport string) (string, bool) {
	host := strings.ToLower(hostport)
	if hh, _, err := net.SplitHostPort(host); err == nil {
		host = hh
	}
	host = strings.TrimSuffix(host, ".")
	label, ok := strings.CutSuffix(host, "."+h.hc.URL.Hostname())
	if !ok || label == "" || strings.Contains(label, ".") {
		return "", false
	}
	return label, true
}

func writeError(w http.ResponseWriter, status int, code, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"error": map[string]string{"code": code, "message": msg}})
}

// ServeHTTP routes a request to its tenant (design D2). A host name that
// names no active tenant is 404 without saying whether one ever existed; a
// suspended tenant is 503.
func (h *Host) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	name, ok := h.tenantName(r.Host)
	if !ok {
		// The address itself (the container health check) answers health only.
		if r.URL.Path == "/healthz" && (r.Method == http.MethodGet || r.Method == http.MethodHead) {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{"status": "ok", "version": h.version, "mode": "host"})
			return
		}
		writeError(w, http.StatusNotFound, "not_found", "no server answers at this address")
		return
	}
	rec, err := h.record(r.Context(), name)
	switch {
	case errors.Is(err, ErrNotFound) || (err == nil && rec.State == StateDeleted):
		writeError(w, http.StatusNotFound, "not_found", "no server answers at this address")
		return
	case err != nil:
		h.log.Error("host registry", "err", err)
		writeError(w, http.StatusInternalServerError, "internal", "internal error")
		return
	case rec.State == StateSuspended:
		w.Header().Set("Retry-After", "3600")
		writeError(w, http.StatusServiceUnavailable, "suspended", "this server is suspended by its hosting operator; its data is kept")
		return
	}
	lim := h.hc.Limits.Merge(rec.Limits)
	if !h.reqs.allow(name, lim.RequestsPerMinute) {
		w.Header().Set("Retry-After", "60")
		writeError(w, http.StatusTooManyRequests, "limit_requests", "this server reached its limit of requests per minute: try again shortly")
		return
	}
	t, release, err := h.pool.acquire(r.Context(), name)
	if err != nil {
		w.Header().Set("Retry-After", "30")
		switch {
		case errors.Is(err, ErrBusy):
			writeError(w, http.StatusServiceUnavailable, "busy", "this host is busy: try again shortly")
		case errors.Is(err, ErrNotFound):
			writeError(w, http.StatusNotFound, "not_found", "no server answers at this address")
		default:
			writeError(w, http.StatusServiceUnavailable, "unavailable", "this server is temporarily unavailable: its operator has been told")
		}
		return
	}
	defer release()
	t.Handler.ServeHTTP(w, r)
}

// RunSweeper closes idle tenants until ctx is done (every process does this
// for the tenants it opened).
func (h *Host) RunSweeper(ctx context.Context) {
	every := min(h.hc.IdleTimeout/4, time.Minute)
	t := time.NewTicker(max(every, time.Second))
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if n := h.pool.sweep(); n > 0 {
				h.log.Debug("idle tenants closed", "count", n)
			}
		}
	}
}

// CloseStreams ends every open tenant's live event streams (shutdown), so
// clients reconnect to the next process.
func (h *Host) CloseStreams() {
	for _, name := range h.pool.openNames() {
		if t, release, ok := h.pool.use(name); ok {
			t.Sync.Notifier().CloseAll()
			release()
		}
	}
}
