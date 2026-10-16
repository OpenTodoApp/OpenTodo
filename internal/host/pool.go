package host

import (
	"context"
	"errors"
	"sync"
	"time"

	"github.com/pixari/opentodo/internal/tenant"
)

// ErrBusy means every open tenant is in use and the cap of open tenants is
// reached: the request is answered 503 and retried by the client.
var ErrBusy = errors.New("too many tenants are in use on this host")

// ErrUnavailable wraps a failure to open a tenant (a failing migration). The
// tenant answers 503 until an attempt succeeds; others are unaffected.
var ErrUnavailable = errors.New("this tenant is temporarily unavailable")

// failRetry is how long a tenant that failed to open is answered 503 without
// another attempt.
const failRetry = time.Minute

// pool keeps the open tenants (design D2): opened on first use, closed after
// being idle, never while a request (a live event stream included) uses
// them, and at most max at a time, closing the least recently used idle one
// first.
type pool struct {
	max  int
	idle time.Duration
	now  func() time.Time
	// open opens a tenant; beforeClose runs on an open tenant just before it
	// closes (the host refreshes its "next due" entries there).
	open        func(ctx context.Context, name string) (*tenant.Tenant, error)
	beforeClose func(name string, t *tenant.Tenant)

	mu      sync.Mutex
	entries map[string]*entry
	failed  map[string]failure
	// opens counts successful opens (tests and the operator status).
	opens int
}

type entry struct {
	t        *tenant.Tenant
	err      error
	ready    chan struct{} // closed once the open attempt finished
	active   int           // requests and jobs using the tenant
	lastUsed time.Time
}

type failure struct {
	at  time.Time
	err error
}

func newPool(max int, idle time.Duration, now func() time.Time) *pool {
	return &pool{max: max, idle: idle, now: now, entries: map[string]*entry{}, failed: map[string]failure{}}
}

// acquire returns the open tenant, opening it when needed (which runs its
// pending migrations). release must be called when the caller is done.
func (p *pool) acquire(ctx context.Context, name string) (*tenant.Tenant, func(), error) {
	p.mu.Lock()
	e := p.entries[name]
	if e == nil {
		if f, ok := p.failed[name]; ok && p.now().Sub(f.at) < failRetry {
			p.mu.Unlock()
			return nil, nil, f.err
		}
		var victim *tenant.Tenant
		var victimName string
		if len(p.entries) >= p.max {
			victimName = p.lruIdleLocked()
			if victimName == "" {
				p.mu.Unlock()
				return nil, nil, ErrBusy
			}
			victim = p.entries[victimName].t
			delete(p.entries, victimName)
		}
		e = &entry{ready: make(chan struct{}), active: 1, lastUsed: p.now()}
		p.entries[name] = e
		p.mu.Unlock()
		if victim != nil {
			p.closeTenant(victimName, victim)
		}
		t, err := p.open(ctx, name)
		p.mu.Lock()
		if err != nil {
			err = errors.Join(ErrUnavailable, err)
			e.err = err
			p.failed[name] = failure{at: p.now(), err: err}
			if p.entries[name] == e {
				delete(p.entries, name)
			}
		} else {
			e.t = t
			p.opens++
			delete(p.failed, name)
		}
		close(e.ready)
		p.mu.Unlock()
		if err != nil {
			return nil, nil, err
		}
		return t, p.releaser(name, e), nil
	}
	e.active++
	e.lastUsed = p.now()
	p.mu.Unlock()
	select {
	case <-e.ready:
	case <-ctx.Done():
		p.releaser(name, e)()
		return nil, nil, ctx.Err()
	}
	if e.err != nil {
		p.releaser(name, e)()
		return nil, nil, e.err
	}
	return e.t, p.releaser(name, e), nil
}

func (p *pool) releaser(name string, e *entry) func() {
	var once sync.Once
	return func() {
		once.Do(func() {
			p.mu.Lock()
			e.active--
			e.lastUsed = p.now()
			p.mu.Unlock()
		})
	}
}

// lruIdleLocked names the least recently used open tenant nobody uses.
func (p *pool) lruIdleLocked() string {
	var name string
	var oldest time.Time
	for n, e := range p.entries {
		if e.active > 0 || e.t == nil {
			continue
		}
		if name == "" || e.lastUsed.Before(oldest) {
			name, oldest = n, e.lastUsed
		}
	}
	return name
}

func (p *pool) closeTenant(name string, t *tenant.Tenant) {
	if p.beforeClose != nil {
		p.beforeClose(name, t)
	}
	_ = t.Close()
}

// sweep closes the tenants idle for longer than the idle time.
func (p *pool) sweep() int {
	now := p.now()
	p.mu.Lock()
	var closing []*tenant.Tenant
	var names []string
	for n, e := range p.entries {
		if e.t != nil && e.active == 0 && now.Sub(e.lastUsed) >= p.idle {
			closing = append(closing, e.t)
			names = append(names, n)
			delete(p.entries, n)
		}
	}
	p.mu.Unlock()
	for i, t := range closing {
		p.closeTenant(names[i], t)
	}
	return len(closing)
}

// evict closes a tenant now, whoever uses it (suspend, delete, restore):
// its live event streams end and in-flight requests may fail.
func (p *pool) evict(name string) {
	p.mu.Lock()
	e := p.entries[name]
	delete(p.entries, name)
	delete(p.failed, name)
	p.mu.Unlock()
	if e == nil {
		return
	}
	<-e.ready
	if e.t != nil {
		p.closeTenant(name, e.t)
	}
}

// closeAll closes every open tenant (shutdown).
func (p *pool) closeAll() {
	p.mu.Lock()
	names := make([]string, 0, len(p.entries))
	for n := range p.entries {
		names = append(names, n)
	}
	p.mu.Unlock()
	for _, n := range names {
		p.evict(n)
	}
}

// isOpen reports whether a tenant is open now.
func (p *pool) isOpen(name string) bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	e := p.entries[name]
	return e != nil && e.t != nil
}

// openNames lists the open tenants.
func (p *pool) openNames() []string {
	p.mu.Lock()
	defer p.mu.Unlock()
	out := make([]string, 0, len(p.entries))
	for n, e := range p.entries {
		if e.t != nil {
			out = append(out, n)
		}
	}
	return out
}

// stats reports the open tenants and how many opens succeeded so far.
func (p *pool) stats() (open, opens int) {
	p.mu.Lock()
	defer p.mu.Unlock()
	for _, e := range p.entries {
		if e.t != nil {
			open++
		}
	}
	return open, p.opens
}

// use returns a tenant only when it is open already, marking it in use.
func (p *pool) use(name string) (*tenant.Tenant, func(), bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	e := p.entries[name]
	if e == nil || e.t == nil {
		return nil, nil, false
	}
	e.active++
	return e.t, p.releaser(name, e), true
}
