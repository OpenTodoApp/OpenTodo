package calsync

import (
	"context"
	"database/sql"
	"encoding/base64"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/calfeed"
	"github.com/OpenTodoApp/opentodo/internal/config"
	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	"github.com/OpenTodoApp/opentodo/internal/settings"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Worker runs cycles in the background under the jobs leader, and the
// discovery and Sync now of the routes.
type Worker struct {
	Store   *Store
	Secrets *Secrets
	Sync    *opsync.Service
	// Feeds stores the shown calendars' events (calendar subscriptions).
	Feeds  *calfeed.Store
	HTTP   *http.Client
	Google *GoogleConfig
	// Token is Google's token endpoint (tests use a fake one).
	Token *TokenEndpoint
	// GoogleBase is where Google's CalDAV discovery starts (tests change it).
	GoogleBase string
	// Tasks lists the user's task feed selection (installed by the server).
	Tasks func(ctx context.Context, userID string) ([]calfeed.FeedTask, error)
	// Enabled reports the owner switch; nothing runs while it is off.
	Enabled func(ctx context.Context) bool
	// Notify wakes the user's devices when shown calendars' events changed.
	Notify  func(userID string)
	BaseURL string
	Version string
	Log     *slog.Logger

	keys   *e2ee.Store
	now    func() time.Time
	tokens tokenCache
	mu     sync.Mutex
	sem    chan struct{}
	locks  map[string]*sync.Mutex
	// active caches whether any connection is synced: 0 unknown, 1 none, 2 some.
	active atomic.Int32
}

// NewWorker wires the worker on the server database and data directory, with
// the webhooks' private-network switch.
func NewWorker(db *sql.DB, dataDir string, syncSvc *opsync.Service, allowPrivate func(context.Context) bool, google config.GoogleConfig, version string, log *slog.Logger) *Worker {
	client := NewHTTPClient(allowPrivate)
	secrets := NewSecrets(dataDir)
	return &Worker{Store: NewStore(db), Secrets: secrets, Sync: syncSvc, Feeds: calfeed.NewStore(db), HTTP: client,
		Google: &GoogleConfig{Env: google, Store: settings.New(db), Secrets: secrets}, Token: &TokenEndpoint{HTTP: client, URL: GoogleTokenURL},
		GoogleBase: GoogleCalDAV, Version: version, Log: log, keys: e2ee.NewStore(db)}
}

// SetClock replaces the worker's and its store's clock (tests).
func (w *Worker) SetClock(now func() time.Time) {
	w.now = now
	w.Store.SetClock(now)
	w.Token.now = now
}

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

func (w *Worker) encrypted(ctx context.Context, userID string) (bool, error) {
	if w.keys == nil {
		return false, nil
	}
	return w.keys.Enabled(ctx, userID)
}

func (w *Worker) slots() chan struct{} {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.sem == nil {
		w.sem = make(chan struct{}, InFlight)
	}
	return w.sem
}

// lock serialises cycles of one connection (Sync now waits for a scheduled one).
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

// Changed forgets whether connections exist (after a route changed one).
func (w *Worker) Changed() { w.active.Store(0) }

// RunOnce syncs the connections due now, at most InFlight at a time.
func (w *Worker) RunOnce(ctx context.Context) {
	if w.Enabled != nil && !w.Enabled(ctx) {
		return
	}
	due, err := w.Store.Due(ctx, 50)
	if err != nil {
		w.log().Error("calendar sync: due", "err", err)
		return
	}
	var wg sync.WaitGroup
	for i := range due {
		c := due[i]
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, _ = w.Cycle(ctx, &c)
		}()
	}
	wg.Wait()
}

// NextDue is the earliest due cycle while the owner switch is on (a host's index).
func (w *Worker) NextDue(ctx context.Context) (time.Time, bool, error) {
	if w.Enabled != nil && !w.Enabled(ctx) {
		return time.Time{}, false, nil
	}
	return w.Store.NextDue(ctx)
}

// relevant are the task fields whose change can change an event (design D9).
var relevant = map[string]bool{"due": true, "estimate_minutes": true, "title": true, "description": true, "completed_at": true,
	"deleted_at": true, "project_id": true, "recurrence": true}

// Observe makes the connections of everyone who can see a changed task due
// soon (the tenant's post-commit observer, design D9). It does nothing while
// no connection is synced.
func (w *Worker) Observe(ctx context.Context, changes []opsync.Change) {
	if w.Enabled != nil && !w.Enabled(ctx) {
		return
	}
	switch w.active.Load() {
	case 1:
		return
	case 0:
		any, err := w.Store.AnySyncable(ctx)
		if err != nil {
			return
		}
		if !any {
			w.active.Store(1)
			return
		}
		w.active.Store(2)
	}
	scopes := map[string]bool{}
	for _, ch := range changes {
		if ch.Entity != "task" || strings.HasPrefix(ch.Origin, DevicePrefix) {
			continue
		}
		for f := range ch.Fields {
			if relevant[f] {
				scopes[ch.ScopeID] = true
				break
			}
		}
	}
	users := map[string]bool{}
	for scope := range scopes {
		if id, ok := strings.CutPrefix(scope, "user:"); ok {
			users[id] = true
			continue
		}
		list, err := w.Sync.ScopeUsers(ctx, scope)
		if err != nil {
			continue
		}
		for _, id := range list {
			users[id] = true
		}
	}
	if len(users) == 0 {
		return
	}
	ids := make([]string, 0, len(users))
	for id := range users {
		ids = append(ids, id)
	}
	if err := w.Store.DueSoon(ctx, ids, w.clock().Add(Debounce)); err != nil {
		w.log().Error("calendar sync: schedule", "err", err)
	}
}

// Client builds the DAV client of a connection with its credentials.
func (w *Worker) Client(ctx context.Context, c *Connection) (*DAV, error) {
	secret, err := w.Secrets.Get(c.ID)
	if err != nil {
		return nil, err
	}
	if secret == "" {
		return nil, &Error{Reason: ReasonSecretMissing}
	}
	if c.Provider == ProviderGoogle {
		access, err := w.accessToken(ctx, c.ID, secret)
		if err != nil {
			return nil, err
		}
		return NewDAV(w.HTTP, w.GoogleBase, func(h http.Header) { h.Set("Authorization", "Bearer "+access) }, w.Version), nil
	}
	user := c.Username
	basic := "Basic " + base64.StdEncoding.EncodeToString([]byte(user+":"+secret))
	return NewDAV(w.HTTP, c.ServerURL, func(h http.Header) { h.Set("Authorization", basic) }, w.Version), nil
}

// accessToken returns a Google access token, refreshing it when it expires
// within five minutes (a cycle never outlives it).
func (w *Worker) accessToken(ctx context.Context, connID, refresh string) (string, error) {
	if tok, ok := w.tokens.get(connID, w.clock().Add(4*time.Minute)); ok {
		return tok, nil
	}
	client, err := w.Google.Client(ctx)
	if err != nil {
		return "", err
	}
	if !client.Complete() {
		return "", &Error{Reason: ReasonGoogleMissing}
	}
	t, err := w.Token.Refresh(ctx, client, refresh)
	if err != nil {
		return "", err
	}
	w.tokens.put(connID, *t)
	return t.Access, nil
}

// Forget drops a connection's cached access token (deleted or reconnected).
func (w *Worker) Forget(connID string) { w.tokens.drop(connID) }
