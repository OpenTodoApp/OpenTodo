package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/calfeed"
	"github.com/pixari/opentodo/internal/calsync"
)

// Calendar sync (OpenSpec change calendar-two-way): a user's own calendar
// account (CalDAV or Google) that receives their dated tasks as events and
// whose changes come back to the tasks. One owner switch, off by default,
// governs every route and the worker (design D1, D14).

const calsyncSettingKey = "calendar_sync.enabled"

// Hand-triggered discoveries and syncs share one window per user.
const (
	calsyncActionsPerHr = 12
	maxCalsyncName      = 200
	maxCalsyncUser      = 256
	maxCalsyncSecret    = 1024
	calsyncPanel        = "/settings/integrations/calendar-sync"
	calsyncCallback     = "/api/v1/calendar-sync/google/callback"
)

// WithCalendarSync hands the server the worker the tenant runs, so the routes
// and the background job share one store, secrets file and policy.
func WithCalendarSync(w *calsync.Worker) Option { return func(s *Server) { s.calsync = w } }

// CalendarSync is the calendar sync worker, run by the jobs leader.
func (s *Server) CalendarSync() *calsync.Worker { return s.calsync }

func (s *Server) registerCalendarSyncRoutes(mux *routes) {
	s.calsyncOn = &ownerSwitch{key: calsyncSettingKey, code: "calendar_sync_disabled", message: "the server owner has not enabled calendar sync"}
	if s.calsync == nil {
		s.calsync = calsync.NewWorker(s.sync.DB(), s.cfg.DataDir, s.sync, s.allowPrivate(), s.cfg.Google, s.version, s.log)
	}
	w := s.calsync
	w.Enabled = s.calendarSyncEnabled
	w.Tasks = s.feedTasksFor
	w.Notify = s.sync.Notifier().NotifyCalendar
	if s.cfg.BaseURL != nil {
		w.BaseURL = strings.TrimRight(s.cfg.BaseURL.String(), "/")
	}
	s.calsyncLimiter = newRateLimiter(calsyncActionsPerHr, time.Hour)
	gate := s.calsyncOn.gate

	mux.handle("GET /api/v1/settings/calendar-sync", signedIn.demoDenied(), s.calsyncOn.get(s, s.calsyncSettingExtra))
	mux.handle("PUT /api/v1/settings/calendar-sync", ownerOnly("manage the calendar sync setting").demoDenied(),
		s.calsyncOn.put(s, func(context.Context, bool) { w.Changed() }))
	mux.handle("GET /api/v1/settings/calendar-sync/google", ownerOnly("manage the Google client of calendar sync").demoDenied(), s.handleGetGoogleClient)
	mux.handle("PUT /api/v1/settings/calendar-sync/google", ownerOnly("manage the Google client of calendar sync").credential().demoDenied(), s.handlePutGoogleClient)
	mux.handle("GET /api/v1/calendar-sync/connections", signedIn.demoDenied(), gate(s, s.handleListCalendarConnections))
	mux.handle("POST /api/v1/calendar-sync/connections", signedIn.recent().demoDenied(), gate(s, s.handleCreateCalendarConnection))
	// One route, one policy: the handler asks for a fresh session when the body carries a password.
	mux.handle("PATCH /api/v1/calendar-sync/connections/{id}", signedIn.demoDenied(), gate(s, s.handlePatchCalendarConnection))
	mux.handle("DELETE /api/v1/calendar-sync/connections/{id}", signedIn.demoDenied(), gate(s, s.handleDeleteCalendarConnection))
	mux.handle("POST /api/v1/calendar-sync/connections/{id}/sync", signedIn.demoDenied(), gate(s, s.handleSyncCalendarConnection))
	mux.handle("POST /api/v1/calendar-sync/google/start", signedIn.recent().demoDenied(), gate(s, s.handleGoogleStart))
	mux.handle("GET "+calsyncCallback, signedIn.sessionOnly().demoDenied(), gate(s, s.handleGoogleCallback))
}

// calendarSyncEnabled reads the owner switch (never on a demo instance).
func (s *Server) calendarSyncEnabled(ctx context.Context) bool {
	return s.calsyncOn != nil && s.calsyncOn.on(ctx, s)
}

// calsyncSettingExtra tells every user whether Google can be connected.
func (s *Server) calsyncSettingExtra(r *http.Request) map[string]any {
	c, err := s.calsync.Google.Client(r.Context())
	return map[string]any{"google": err == nil && c.Complete(), "max_connections": calsync.MaxConnections}
}

// feedTasksFor is the task feed's selection for the worker, outside a request.
func (s *Server) feedTasksFor(ctx context.Context, uid string) ([]calfeed.FeedTask, error) {
	r, err := http.NewRequestWithContext(ctx, http.MethodGet, "/", nil)
	if err != nil {
		return nil, err
	}
	return s.feedTasks(r, uid)
}

// googleRedirectURI is the callback address registered at Google (design D13).
func (s *Server) googleRedirectURI(r *http.Request) string {
	return s.publicOrigin(r) + calsyncCallback
}

func (s *Server) handleGetGoogleClient(w http.ResponseWriter, r *http.Request) {
	c, err := s.calsync.Google.Client(r.Context())
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"client_id": c.ID, "secret_set": c.Secret != "", "from_env": c.FromEnv, "redirect_uri": s.googleRedirectURI(r)})
}

func (s *Server) handlePutGoogleClient(w http.ResponseWriter, r *http.Request) {
	var in struct {
		ClientID     *string `json:"client_id"`
		ClientSecret *string `json:"client_secret"`
	}
	if err := readJSON(r, &in); err != nil || in.ClientID == nil {
		badBodyWith(w, err, "invalid_input", `body must be {"client_id": "...", "client_secret"?: "..."}`)
		return
	}
	if len(*in.ClientID) > maxCalsyncSecret || (in.ClientSecret != nil && len(*in.ClientSecret) > maxCalsyncSecret) {
		writeError(w, http.StatusBadRequest, "invalid_input", "the client id and secret are too long")
		return
	}
	g := s.calsync.Google
	before, err := g.Client(r.Context())
	if err != nil {
		s.internal(w, err)
		return
	}
	if before.FromEnv {
		writeError(w, http.StatusConflict, "managed_by_environment", "OPENTODO_GOOGLE_CLIENT_ID and OPENTODO_GOOGLE_CLIENT_SECRET set the Google client on this server")
		return
	}
	if err := g.Save(r.Context(), *in.ClientID, in.ClientSecret); err != nil {
		s.internal(w, err)
		return
	}
	after, err := g.Client(r.Context())
	if err != nil {
		s.internal(w, err)
		return
	}
	if after.ID != before.ID || in.ClientSecret != nil {
		s.audit.Record(r.Context(), audit.SettingsChanged(userFrom(r.Context()).ID, "calendar_sync.google_client", boolText(before.Complete()), boolText(after.Complete())))
	}
	writeJSON(w, http.StatusOK, map[string]any{"client_id": after.ID, "secret_set": after.Secret != "", "from_env": false, "redirect_uri": s.googleRedirectURI(r)})
}

// calendarConnectionView is a connection as the API serves it: never the secret.
type calendarConnectionView struct {
	*calsync.Connection
	State       string `json:"state"`
	PasswordSet bool   `json:"password_set"`
	EventCount  int    `json:"event_count"`
}

func (s *Server) calendarViews(ctx context.Context, uid string, list []calsync.Connection) ([]calendarConnectionView, error) {
	keys := make([]string, len(list))
	for i := range list {
		keys[i] = list[i].ID
	}
	has, err := s.calsync.Secrets.Has(keys...)
	if err != nil {
		return nil, err
	}
	counts, err := s.calsync.Store.LinkCounts(ctx, uid)
	if err != nil {
		return nil, err
	}
	out := make([]calendarConnectionView, 0, len(list))
	for i := range list {
		c := &list[i]
		out = append(out, calendarConnectionView{Connection: c, State: c.State(), PasswordSet: has[c.ID], EventCount: counts[c.ID]})
	}
	return out, nil
}

func (s *Server) calendarView(ctx context.Context, uid, id string) (*calendarConnectionView, error) {
	c, err := s.calsync.Store.Get(ctx, uid, id)
	if err != nil {
		return nil, err
	}
	views, err := s.calendarViews(ctx, uid, []calsync.Connection{*c})
	if err != nil {
		return nil, err
	}
	return &views[0], nil
}

// writeCalendarView answers with one connection as stored now.
func (s *Server) writeCalendarView(w http.ResponseWriter, r *http.Request, status int, id string, extra map[string]any) {
	v, err := s.calendarView(r.Context(), userFrom(r.Context()).ID, id)
	if errors.Is(err, calsync.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "calendar connection not found")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	out := map[string]any{"connection": v}
	for k, x := range extra {
		out[k] = x
	}
	writeJSON(w, status, out)
}

func (s *Server) handleListCalendarConnections(w http.ResponseWriter, r *http.Request) {
	uid := userFrom(r.Context()).ID
	list, err := s.calsync.Store.List(r.Context(), uid)
	if err != nil {
		s.internal(w, err)
		return
	}
	views, err := s.calendarViews(r.Context(), uid, list)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"connections": views})
}
