package httpapi

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"slices"
	"strings"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/calsync"
	"github.com/pixari/opentodo/internal/ids"
	ob "github.com/pixari/opentodo/internal/outbound"
)

// remoteError answers a failed discovery with a code the form explains.
func (s *Server) remoteError(w http.ResponseWriter, err error) {
	var ce *calsync.Error
	if !errors.As(err, &ce) {
		if errors.Is(err, ob.ErrBadURL) {
			writeFieldError(w, "server_url", strings.TrimPrefix(err.Error(), ob.ErrBadURL.Error()+": "))
			return
		}
		s.internal(w, err)
		return
	}
	switch ce.Reason {
	case calsync.ReasonUnauthorized:
		writeError(w, http.StatusBadRequest, "unauthorized_remote", "the calendar server refused the username or the app password")
	case calsync.ReasonNoCalendars:
		writeError(w, http.StatusBadRequest, "no_calendars", "this account has no calendar that holds events")
	case calsync.ReasonPrivateTarget:
		writeError(w, http.StatusBadRequest, "private_target", "this address is on a private network; the server owner can allow private targets in Settings → Integrations → Webhooks")
	default:
		writeError(w, http.StatusBadGateway, "calendar_unreachable", ce.Reason) // the reason code, e.g. timeout or http_500
	}
}

// privateHost refuses an address on a private network unless the owner allows them.
func (s *Server) privateHost(ctx context.Context, raw string) bool {
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	d := &ob.Dialer{Resolver: net.DefaultResolver, AllowPrivate: s.allowPrivate()}
	_, err = d.Allowed(ctx, u.Hostname())
	return errors.Is(err, ob.ErrPrivateTarget)
}

func (s *Server) handleCreateCalendarConnection(w http.ResponseWriter, r *http.Request) {
	uid := userFrom(r.Context()).ID
	var in struct {
		ServerURL string `json:"server_url"`
		Username  string `json:"username"`
		Password  string `json:"password"`
		Name      string `json:"name"`
	}
	if err := readJSON(r, &in); err != nil {
		badBodyWith(w, err, "invalid_input", `body must be {"server_url": "...", "username": "...", "password": "...", "name"?: "..."}`)
		return
	}
	in.ServerURL, in.Username = strings.TrimSpace(in.ServerURL), strings.TrimSpace(in.Username)
	switch {
	case in.ServerURL == "" || len(in.ServerURL) > ob.MaxURLLength:
		writeFieldError(w, "server_url", "enter the calendar server's address, a host name or your email address")
		return
	case in.Username == "" || len(in.Username) > maxCalsyncUser:
		writeFieldError(w, "username", "enter the username")
		return
	case in.Password == "" || len(in.Password) > maxCalsyncSecret:
		writeFieldError(w, "password", "enter an app password")
		return
	}
	list, err := s.calsync.Store.List(r.Context(), uid)
	if err != nil {
		s.internal(w, err)
		return
	}
	if len(list) >= calsync.MaxConnections {
		writeError(w, http.StatusConflict, "limit_reached", fmt.Sprintf("you can connect at most %d calendar accounts", calsync.MaxConnections))
		return
	}
	start, err := calsync.StartURL(in.ServerURL)
	if err != nil {
		s.remoteError(w, err)
		return
	}
	if s.privateHost(r.Context(), start) {
		s.remoteError(w, &calsync.Error{Reason: calsync.ReasonPrivateTarget})
		return
	}
	if !s.calsyncLimiter.allow(uid) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many calendar checks; try again later")
		return
	}
	base, d, err := s.calsync.DiscoverCalDAV(r.Context(), start, in.Username, in.Password)
	if err != nil {
		s.remoteError(w, err)
		return
	}
	name := trimTo(&in.Name, maxCalsyncName)
	if name == "" {
		if u, perr := url.Parse(base); perr == nil {
			name = u.Hostname()
		}
	}
	c, err := s.calsync.Store.Create(r.Context(), &calsync.Connection{UserID: uid, Provider: calsync.ProviderCalDAV, Name: name, ServerURL: base,
		Username: in.Username, PrincipalURL: d.Principal, HomeURL: d.Home, Calendars: d.Calendars})
	if errors.Is(err, calsync.ErrLimit) {
		writeError(w, http.StatusConflict, "limit_reached", fmt.Sprintf("you can connect at most %d calendar accounts", calsync.MaxConnections))
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	if err := s.calsync.Secrets.Set(c.ID, in.Password); err != nil {
		_ = s.calsync.Store.Delete(r.Context(), uid, c.ID)
		s.internal(w, err)
		return
	}
	s.audit.Record(r.Context(), audit.CalendarConnectionCreated(uid, c.ID, c.Provider))
	s.calsync.Changed()
	s.writeCalendarView(w, r, http.StatusCreated, c.ID, nil)
}

type calendarPatch struct {
	Name            *string   `json:"name"`
	Target          *string   `json:"target"`
	Read            *[]string `json:"read"`
	IncludeDateOnly *bool     `json:"include_date_only"`
	Enabled         *bool     `json:"enabled"`
	Password        *string   `json:"password"`
}

// patchOf checks a patch against the connection's calendars; it returns the
// store patch, the names of the changed settings, or a field error.
func patchOf(c *calsync.Connection, in calendarPatch) (calsync.Patch, []string, string, string) {
	p := calsync.Patch{IncludeDateOnly: in.IncludeDateOnly, Enabled: in.Enabled}
	var changed []string
	if in.Name != nil {
		v := trimTo(in.Name, maxCalsyncName)
		if v == "" {
			return p, nil, "name", "enter a name"
		}
		p.Name = &v
		changed = append(changed, "name")
	}
	if in.Target != nil {
		cal := c.Calendar(*in.Target)
		if cal == nil || cal.ReadOnly {
			return p, nil, "target", "choose one of this account's calendars that can be written"
		}
		p.TargetURL = in.Target
	}
	if in.Read != nil {
		read := []string{}
		for _, u := range *in.Read {
			if c.Calendar(u) == nil {
				return p, nil, "read", "choose calendars of this account"
			}
			if !slices.Contains(read, u) {
				read = append(read, u)
			}
		}
		if len(read) > calsync.MaxReadCalendars {
			return p, nil, "read", fmt.Sprintf("show at most %d calendars", calsync.MaxReadCalendars)
		}
		p.ReadURLs = &read
	}
	if in.Target != nil || in.Read != nil {
		changed = append(changed, "calendars")
	}
	if in.IncludeDateOnly != nil {
		changed = append(changed, "options")
	}
	if in.Enabled != nil {
		changed = append(changed, "enabled")
	}
	return p, changed, "", ""
}

func (s *Server) handlePatchCalendarConnection(w http.ResponseWriter, r *http.Request) {
	ctx, uid := r.Context(), userFrom(r.Context()).ID
	var in calendarPatch
	if err := readJSON(r, &in); err != nil {
		badBodyWith(w, err, "invalid_input", "body must be a JSON object")
		return
	}
	c, err := s.calsync.Store.Get(ctx, uid, r.PathValue("id"))
	if errors.Is(err, calsync.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "calendar connection not found")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	p, changed, field, msg := patchOf(c, in)
	if field != "" {
		writeFieldError(w, field, msg)
		return
	}
	if in.Password != nil {
		if !s.newCalendarPassword(w, r, c, *in.Password) {
			return
		}
		changed = append(changed, "password")
	}
	if _, err := s.calsync.Store.Update(ctx, uid, c.ID, p); err != nil {
		s.internal(w, err)
		return
	}
	if len(changed) > 0 {
		s.audit.Record(ctx, audit.CalendarConnectionUpdated(uid, c.ID, c.Provider, strings.Join(changed, ",")))
	}
	s.calsync.Changed()
	s.writeCalendarView(w, r, http.StatusOK, c.ID, nil)
}

// newCalendarPassword checks a new app password with discovery before storing
// it and resumes the connection; it answers the request itself when it fails.
func (s *Server) newCalendarPassword(w http.ResponseWriter, r *http.Request, c *calsync.Connection, password string) bool {
	ctx := r.Context()
	if sess := sessionFrom(ctx); sess != nil && !sess.FreshWithin(FreshWindow, s.auth.Now()) {
		writeError(w, http.StatusForbidden, "reauth_required", "confirm your password or a code to continue")
		return false
	}
	if c.Provider != calsync.ProviderCalDAV {
		writeFieldError(w, "password", "a Google connection is renewed with Reconnect")
		return false
	}
	if password == "" || len(password) > maxCalsyncSecret {
		writeFieldError(w, "password", "enter an app password")
		return false
	}
	if !s.calsyncLimiter.allow(c.UserID) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many calendar checks; try again later")
		return false
	}
	_, d, err := s.calsync.DiscoverCalDAV(ctx, c.ServerURL, c.Username, password)
	if err != nil {
		s.remoteError(w, err)
		return false
	}
	if err := s.calsync.Secrets.Set(c.ID, password); err != nil {
		s.internal(w, err)
		return false
	}
	if err := s.calsync.Store.SaveDiscovery(ctx, c, d.Principal, d.Home, d.Calendars); err != nil {
		s.internal(w, err)
		return false
	}
	if err := s.calsync.Store.Resume(ctx, c.ID); err != nil {
		s.internal(w, err)
		return false
	}
	return true
}

func (s *Server) handleDeleteCalendarConnection(w http.ResponseWriter, r *http.Request) {
	ctx, uid := r.Context(), userFrom(r.Context()).ID
	c, err := s.calsync.Store.Get(ctx, uid, r.PathValue("id"))
	if errors.Is(err, calsync.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "calendar connection not found")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	if err := s.calsync.Store.Delete(ctx, uid, c.ID); err != nil {
		s.internal(w, err)
		return
	}
	if err := s.calsync.Secrets.Delete(c.ID); err != nil {
		s.log.Error("calendar sync: remove secret", "err", err)
	}
	s.calsync.Forget(c.ID)
	s.calsync.Changed()
	s.audit.Record(ctx, audit.CalendarConnectionDeleted(uid, c.ID, c.Provider))
	s.sync.Notifier().NotifyCalendar(uid)
	w.WriteHeader(http.StatusNoContent)
}

// handleSyncCalendarConnection finds the account's calendars again and runs a
// cycle now (Sync now).
func (s *Server) handleSyncCalendarConnection(w http.ResponseWriter, r *http.Request) {
	ctx, uid := r.Context(), userFrom(r.Context()).ID
	c, err := s.calsync.Store.Get(ctx, uid, r.PathValue("id"))
	if errors.Is(err, calsync.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "calendar connection not found")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	if !s.calsyncLimiter.allow(uid) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many calendar syncs; try again later")
		return
	}
	out := map[string]any{"ok": true}
	if c.StoppedReason == "" || c.StoppedReason == calsync.ReasonCalendarMissing {
		if err := s.calsync.Rediscover(ctx, c); err != nil {
			s.calendarSyncResult(w, r, c, err)
			return
		}
		if c.StoppedReason == calsync.ReasonCalendarMissing {
			if fresh, ferr := s.calsync.Store.ByID(ctx, c.ID); ferr == nil && fresh.Calendar(fresh.TargetURL) != nil {
				_ = s.calsync.Store.Resume(ctx, c.ID)
			}
		}
	}
	if fresh, err := s.calsync.Store.ByID(ctx, c.ID); err == nil && fresh.Enabled && fresh.StoppedReason == "" && fresh.TargetURL != "" {
		run, err := s.calsync.Cycle(ctx, fresh)
		if err != nil {
			s.calendarSyncResult(w, r, c, err)
			return
		}
		out["run"] = run
	}
	s.writeCalendarView(w, r, http.StatusOK, c.ID, out)
}

// calendarSyncResult answers a failed Sync now with the reason and the
// connection as stored after it.
func (s *Server) calendarSyncResult(w http.ResponseWriter, r *http.Request, c *calsync.Connection, err error) {
	var ce *calsync.CycleError
	var e *calsync.Error
	reason := "internal_error"
	switch {
	case errors.As(err, &ce):
		reason = ce.Reason
	case errors.As(err, &e):
		reason = e.Reason
		if calsync.Stops(reason) {
			_ = s.calsync.Store.Failure(r.Context(), c, reason, e.Until, calsync.RunCounts{})
		}
	default:
		s.internal(w, err)
		return
	}
	s.writeCalendarView(w, r, http.StatusOK, c.ID, map[string]any{"ok": false, "reason": reason})
}

func (s *Server) handleGoogleStart(w http.ResponseWriter, r *http.Request) {
	ctx, uid := r.Context(), userFrom(r.Context()).ID
	var in struct {
		ConnectionID string `json:"connection_id"`
	}
	if r.ContentLength != 0 {
		if err := readJSON(r, &in); err != nil {
			badBodyWith(w, err, "invalid_input", `body must be {"connection_id"?: "..."}`)
			return
		}
	}
	client, err := s.calsync.Google.Client(ctx)
	if err != nil {
		s.internal(w, err)
		return
	}
	if !client.Complete() {
		writeError(w, http.StatusConflict, "google_not_configured", "the server owner has not set up a Google client for calendar sync")
		return
	}
	if in.ConnectionID != "" {
		c, err := s.calsync.Store.Get(ctx, uid, in.ConnectionID)
		if err != nil || c.Provider != calsync.ProviderGoogle {
			writeError(w, http.StatusNotFound, "not_found", "calendar connection not found")
			return
		}
	} else if list, err := s.calsync.Store.List(ctx, uid); err != nil {
		s.internal(w, err)
		return
	} else if len(list) >= calsync.MaxConnections {
		writeError(w, http.StatusConflict, "limit_reached", fmt.Sprintf("you can connect at most %d calendar accounts", calsync.MaxConnections))
		return
	}
	state := ids.Secret(32)
	verifier, challenge := calsync.PKCE()
	redirect := s.googleRedirectURI(r)
	if err := s.calsync.Store.PutState(ctx, calsync.StateHash(state), calsync.OAuthState{UserID: uid, Verifier: verifier, ConnectionID: in.ConnectionID,
		RedirectURI: redirect}, calsync.StateTTL); err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"url": calsync.AuthorizationURL(s.googleAuthURL(), client.ID, redirect, state, challenge)})
}

// googleAuthURL is Google's consent page (tests replace the worker's endpoints).
func (s *Server) googleAuthURL() string { return calsync.GoogleAuthURL }

// handleGoogleCallback finishes a Google sign-in started by this session and
// returns the browser to the panel (design D13).
func (s *Server) handleGoogleCallback(w http.ResponseWriter, r *http.Request) {
	back := func(result, id string) {
		q := url.Values{"calendar-sync": {result}}
		if id != "" {
			q.Set("connection", id)
		}
		http.Redirect(w, r, calsyncPanel+"?"+q.Encode(), http.StatusSeeOther)
	}
	ctx, uid := r.Context(), userFrom(r.Context()).ID
	q := r.URL.Query()
	st, err := s.calsync.Store.TakeState(ctx, calsync.StateHash(q.Get("state")))
	if err != nil || st.UserID != uid {
		back("invalid_state", "")
		return
	}
	if q.Get("error") != "" || q.Get("code") == "" {
		back("denied", "")
		return
	}
	id, result := s.finishGoogle(ctx, uid, st, q.Get("code"))
	back(result, id)
}

// finishGoogle exchanges the code, finds the calendars and creates or
// reconnects the connection; it returns the connection id and the result.
func (s *Server) finishGoogle(ctx context.Context, uid string, st *calsync.OAuthState, code string) (string, string) {
	client, err := s.calsync.Google.Client(ctx)
	if err != nil || !client.Complete() {
		return "", "google_not_configured"
	}
	tok, err := s.calsync.Token.Exchange(ctx, client, code, st.Verifier, st.RedirectURI)
	if err != nil {
		return "", reasonText(err)
	}
	if tok.Refresh == "" {
		return "", "no_refresh_token"
	}
	d, err := s.calsync.DiscoverGoogle(ctx, tok.Access)
	if err != nil {
		return "", reasonText(err)
	}
	if st.ConnectionID != "" {
		c, err := s.calsync.Store.Get(ctx, uid, st.ConnectionID)
		if err != nil {
			return "", "not_found"
		}
		if s.calsync.Secrets.Set(c.ID, tok.Refresh) != nil || s.calsync.Store.SaveDiscovery(ctx, c, d.Principal, d.Home, d.Calendars) != nil ||
			s.calsync.Store.Resume(ctx, c.ID) != nil {
			return c.ID, "internal_error"
		}
		s.calsync.RememberToken(c.ID, *tok)
		s.audit.Record(ctx, audit.CalendarConnectionUpdated(uid, c.ID, c.Provider, "reconnected"))
		s.calsync.Changed()
		return c.ID, "connected"
	}
	c, err := s.calsync.Store.Create(ctx, &calsync.Connection{UserID: uid, Provider: calsync.ProviderGoogle, Name: "Google Calendar",
		ServerURL: calsync.GoogleCalDAV, PrincipalURL: d.Principal, HomeURL: d.Home, Calendars: d.Calendars})
	if errors.Is(err, calsync.ErrLimit) {
		return "", "limit_reached"
	}
	if err != nil {
		return "", "internal_error"
	}
	if err := s.calsync.Secrets.Set(c.ID, tok.Refresh); err != nil {
		_ = s.calsync.Store.Delete(ctx, uid, c.ID)
		return "", "internal_error"
	}
	s.calsync.RememberToken(c.ID, *tok)
	s.audit.Record(ctx, audit.CalendarConnectionCreated(uid, c.ID, c.Provider))
	s.calsync.Changed()
	return c.ID, "connected"
}

// reasonText is an error's stored reason, for the panel's message.
func reasonText(err error) string {
	var e *calsync.Error
	if errors.As(err, &e) {
		return e.Reason
	}
	return "internal_error"
}
