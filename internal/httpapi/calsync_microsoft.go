package httpapi

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/OpenTodoApp/opentodo/internal/audit"
	"github.com/OpenTodoApp/opentodo/internal/calsync"
	"github.com/OpenTodoApp/opentodo/internal/ids"
)

// Microsoft calendars in calendar sync (OpenSpec change outlook-calendar-sync,
// design D2, D3, D11): the owner's app registration, and the sign-in that
// creates or reconnects a Microsoft connection.

const microsoftCallback = "/api/v1/calendar-sync/microsoft/callback"

// microsoftRedirectURI is the callback address registered in Entra ID.
func (s *Server) microsoftRedirectURI(r *http.Request) string {
	return s.publicOrigin(r) + microsoftCallback
}

func (s *Server) microsoftClientView(r *http.Request, c calsync.MicrosoftClient) map[string]any {
	var refused any
	if c.RefusedAt > 0 {
		refused = c.RefusedAt
	}
	return map[string]any{"client_id": c.ID, "tenant": c.Tenant, "secret_set": c.Secret != "", "from_env": c.FromEnv,
		"redirect_uri": s.microsoftRedirectURI(r), "refused_at": refused}
}

func (s *Server) handleGetMicrosoftClient(w http.ResponseWriter, r *http.Request) {
	c, err := s.calsync.Microsoft.Client(r.Context())
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, s.microsoftClientView(r, c))
}

func (s *Server) handlePutMicrosoftClient(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var in struct {
		ClientID     *string `json:"client_id"`
		Tenant       *string `json:"tenant"`
		ClientSecret *string `json:"client_secret"`
	}
	if err := readJSON(r, &in); err != nil || in.ClientID == nil {
		badBodyWith(w, err, "invalid_input", `body must be {"client_id": "...", "tenant"?: "...", "client_secret"?: "..."}`)
		return
	}
	if len(*in.ClientID) > maxCalsyncSecret || (in.ClientSecret != nil && len(*in.ClientSecret) > maxCalsyncSecret) {
		writeError(w, http.StatusBadRequest, "invalid_input", "the client id and secret are too long")
		return
	}
	m := s.calsync.Microsoft
	before, err := m.Client(ctx)
	if err != nil {
		s.internal(w, err)
		return
	}
	if before.FromEnv {
		writeError(w, http.StatusConflict, "managed_by_environment", "OPENTODO_MICROSOFT_CLIENT_ID and OPENTODO_MICROSOFT_CLIENT_SECRET set the Microsoft client on this server")
		return
	}
	tenant := before.Tenant
	if in.Tenant != nil {
		if tenant = strings.TrimSpace(*in.Tenant); tenant == "" {
			tenant = calsync.DefaultTenant
		}
	}
	if !calsync.ValidTenant(tenant) {
		writeFieldError(w, "tenant", "enter common, organizations, consumers, a tenant id or a domain name")
		return
	}
	if err := m.Save(ctx, *in.ClientID, tenant, in.ClientSecret); err != nil {
		s.internal(w, err)
		return
	}
	after, err := m.Client(ctx)
	if err != nil {
		s.internal(w, err)
		return
	}
	if after.ID != before.ID || after.Tenant != before.Tenant || in.ClientSecret != nil {
		s.audit.Record(ctx, audit.SettingsChanged(userFrom(ctx).ID, "calendar_sync.microsoft_client", boolText(before.Complete()), boolText(after.Complete())))
	}
	if after.Complete() && (in.ClientSecret != nil || !before.Complete()) {
		// A new secret resumes the connections a refused or missing client stopped.
		if err := s.calsync.MicrosoftClientSaved(ctx); err != nil {
			s.internal(w, err)
			return
		}
	}
	writeJSON(w, http.StatusOK, s.microsoftClientView(r, after))
}

func (s *Server) handleMicrosoftStart(w http.ResponseWriter, r *http.Request) {
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
	client, err := s.calsync.Microsoft.Client(ctx)
	if err != nil {
		s.internal(w, err)
		return
	}
	if !client.Complete() {
		writeError(w, http.StatusConflict, "microsoft_not_configured", "the server owner has not set up a Microsoft client for calendar sync")
		return
	}
	if in.ConnectionID != "" {
		c, err := s.calsync.Store.Get(ctx, uid, in.ConnectionID)
		if err != nil || c.Provider != calsync.ProviderMicrosoft {
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
	if !s.calsyncLimiter.allow(uid) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many calendar checks; try again later")
		return
	}
	state := ids.Secret(32)
	verifier, challenge := calsync.PKCE()
	redirect := s.microsoftRedirectURI(r)
	if err := s.calsync.Store.PutState(ctx, calsync.MicrosoftStateHash(state), calsync.OAuthState{UserID: uid, Verifier: verifier,
		ConnectionID: in.ConnectionID, RedirectURI: redirect}, calsync.StateTTL); err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"url": calsync.MicrosoftAuthorizationURL(s.calsync.MicrosoftToken.Login, client, redirect, state, challenge)})
}

// handleMicrosoftCallback finishes a Microsoft sign-in started by this session
// and returns the browser to the panel (design D3).
func (s *Server) handleMicrosoftCallback(w http.ResponseWriter, r *http.Request) {
	back := func(result, id string) {
		q := url.Values{"calendar-sync": {result}, "provider": {calsync.ProviderMicrosoft}}
		if id != "" {
			q.Set("connection", id)
		}
		http.Redirect(w, r, calsyncPanel+"?"+q.Encode(), http.StatusSeeOther)
	}
	ctx, uid := r.Context(), userFrom(r.Context()).ID
	q := r.URL.Query()
	st, err := s.calsync.Store.TakeState(ctx, calsync.MicrosoftStateHash(q.Get("state")))
	if err != nil || st.UserID != uid {
		back("invalid_state", "")
		return
	}
	if q.Get("error") != "" {
		back(calsync.MicrosoftCallbackReason(q.Get("error"), q.Get("error_description")), "")
		return
	}
	if q.Get("code") == "" {
		back("authorization_failed", "")
		return
	}
	id, result := s.finishMicrosoft(ctx, uid, st, q.Get("code"))
	back(result, id)
}

// finishMicrosoft exchanges the code, reads the account and its calendars and
// creates or reconnects the connection; it returns the connection id and the
// result.
func (s *Server) finishMicrosoft(ctx context.Context, uid string, st *calsync.OAuthState, code string) (string, string) {
	w := s.calsync
	client, err := w.Microsoft.Client(ctx)
	if err != nil || !client.Complete() {
		return "", "microsoft_not_configured"
	}
	tok, err := w.MicrosoftToken.Exchange(ctx, client, code, st.Verifier, st.RedirectURI)
	if err != nil {
		return "", reasonText(err)
	}
	if tok.Refresh == "" {
		return "", "no_refresh_token"
	}
	acct, err := w.DiscoverMicrosoft(ctx, tok.Access)
	if err != nil {
		return "", reasonText(err)
	}
	if st.ConnectionID != "" {
		c, err := w.Store.Get(ctx, uid, st.ConnectionID)
		if err != nil || c.Provider != calsync.ProviderMicrosoft {
			return "", "not_found"
		}
		if w.Secrets.Set(c.ID, tok.Refresh) != nil || w.Store.SaveDiscovery(ctx, c, "", w.GraphBase, acct.Calendars) != nil ||
			w.Store.Resume(ctx, c.ID) != nil {
			return c.ID, "internal_error"
		}
		w.RememberToken(c.ID, *tok)
		s.audit.Record(ctx, audit.CalendarConnectionUpdated(uid, c.ID, c.Provider, "reconnected"))
		w.Changed()
		return c.ID, "connected"
	}
	c, err := w.Store.Create(ctx, &calsync.Connection{UserID: uid, Provider: calsync.ProviderMicrosoft, Name: "Outlook",
		ServerURL: w.GraphBase, Username: acct.Address, HomeURL: w.GraphBase, Calendars: acct.Calendars})
	if errors.Is(err, calsync.ErrLimit) {
		return "", "limit_reached"
	}
	if err != nil {
		return "", "internal_error"
	}
	if err := w.Secrets.Set(c.ID, tok.Refresh); err != nil {
		_ = w.Store.Delete(ctx, uid, c.ID)
		return "", "internal_error"
	}
	w.RememberToken(c.ID, *tok)
	s.audit.Record(ctx, audit.CalendarConnectionCreated(uid, c.ID, c.Provider))
	w.Changed()
	return c.ID, "connected"
}
