package httpapi

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"strings"

	"github.com/OpenTodoApp/opentodo/internal/audit"
	"github.com/OpenTodoApp/opentodo/internal/auth"
	"github.com/OpenTodoApp/opentodo/internal/mcpoauth"
	"github.com/OpenTodoApp/opentodo/internal/oidc"
	"github.com/OpenTodoApp/opentodo/internal/textutil"
)

// ---- single sign-on (OpenSpec change `oidc-login`) ----
//
// The start and callback routes are part of the sign-in flow and therefore
// anonymous (rate limited per address); everything else requires a session or
// token. Provider settings are owner-only and changing them needs a fresh
// session (mfa-totp D4).

// oidcStateCookie carries the signed flow state between start and callback.
const oidcStateCookie = "ot_oidc"

const oidcCallbackPath = "/api/v1/auth/oidc/callback"

// App flow (OpenSpec change app-sso-system-browser): the OpenTodo app opens
// the start route in the system's authentication sheet with its own PKCE
// challenge, because identity providers such as Google refuse sign-in inside
// an app's web view. The callback asks the person to confirm (appSSOContinuePath),
// then sends a single-use code to appSSORedirect,
// and the app redeems it with its verifier from its web view at
// appSSOSessionPath, where the session cookie belongs.
const (
	appSSORedirect    = "opentodo://sso"
	appSSOSessionPath = "/api/v1/auth/oidc/app-session"
)

func (s *Server) registerOIDCRoutes(mux *routes) {
	mux.handle("GET /api/v1/auth/oidc/start", public("single sign-on starts before there is a session").DemoDenied(), s.handleOIDCStart)
	mux.handle("GET "+oidcCallbackPath, public("the provider redirects the browser back here").DemoDenied(), s.handleOIDCCallback)
	mux.handle("POST "+appSSOContinuePath, public("the person confirms an app sign-in in the system browser before there is a session").DemoDenied(), s.handleOIDCAppContinue)
	mux.handle("POST "+appSSOSessionPath, public("the app redeems its single sign-on code before there is a session").DemoDenied(), s.handleOIDCAppSession)
	mux.handle("GET /api/v1/settings/oidc", ownerOnly("manage single sign-on"), s.handleGetOIDCSettings)
	mux.handle("PUT /api/v1/settings/oidc", ownerOnly("manage single sign-on").Sensitive().DemoDenied(), s.handlePutOIDCSettings)
	mux.handle("POST /api/v1/settings/oidc/test", ownerOnly("manage single sign-on").DemoDenied(), s.handleTestOIDC)
	mux.handle("GET /api/v1/me/identities", signedIn, s.handleListIdentities)
	mux.handle("DELETE /api/v1/me/identities/{id}", signedIn.Credential().DemoDenied(), s.handleUnlinkIdentity)
}

// oidcRedirectURI is the callback URL registered at the provider (design D5):
// the configured base URL, or the request origin when none is set.
func (s *Server) oidcRedirectURI(r *http.Request) string { return s.publicOrigin(r) + oidcCallbackPath }

// oidcConfig loads the effective configuration, answering 404 oidc_disabled
// when no provider is configured.
func (s *Server) oidcConfig(w http.ResponseWriter, r *http.Request) (oidc.Config, bool) {
	c, err := s.oidc.Config(r.Context())
	if err != nil {
		s.internal(w, err)
		return c, false
	}
	if !c.Enabled() {
		writeError(w, http.StatusNotFound, "oidc_disabled", "single sign-on is not configured on this server")
		return c, false
	}
	return c, true
}

// oidcStatus is the additive `oidc` field of GET /api/v1/auth/status.
func (s *Server) oidcStatus(ctx context.Context) map[string]any {
	c, err := s.oidc.Config(ctx)
	if err != nil || !c.Enabled() {
		return map[string]any{"enabled": false, "displayName": "", "ssoOnly": false}
	}
	return map[string]any{"enabled": true, "displayName": c.Name(), "ssoOnly": c.SSOOnly}
}

func (s *Server) setStateCookie(w http.ResponseWriter, r *http.Request, value string, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name: oidcStateCookie, Value: value, Path: "/api/v1/auth/oidc", MaxAge: maxAge,
		HttpOnly: true, Secure: s.secureCookie(r), SameSite: http.SameSiteLaxMode,
	})
}

// redirectTo sends the browser to an app page with an optional query.
func redirectTo(w http.ResponseWriter, r *http.Request, page string, q url.Values) {
	if len(q) > 0 {
		page += "?" + q.Encode()
	}
	w.Header().Set("Cache-Control", "no-store")
	http.Redirect(w, r, page, http.StatusSeeOther)
}

// oidcFail returns the browser to page with a generic error indication; the
// reason stays in the server log and the audit log.
func (s *Server) oidcFail(w http.ResponseWriter, r *http.Request, page, code string) {
	redirectTo(w, r, page, url.Values{"error": {code}})
}

// oidcError answers a JSON error (scripts, tests) or, for a browser
// navigation, redirects to page with the same code so people never see raw JSON.
func (s *Server) oidcError(w http.ResponseWriter, r *http.Request, status int, code, msg, page string) {
	if strings.Contains(r.Header.Get("Accept"), "text/html") {
		s.oidcFail(w, r, page, code)
		return
	}
	writeError(w, status, code, msg)
}

func (s *Server) handleOIDCStart(w http.ResponseWriter, r *http.Request) {
	if !s.oidcLimiter.allow(clientIP(r)) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many attempts, try again later")
		return
	}
	c, ok := s.oidcConfig(w, r)
	if !ok {
		return
	}
	m, err := s.oidc.Provider(c.Issuer).Metadata(r.Context())
	if err != nil {
		s.log.Warn("oidc discovery failed", "err", err)
		s.oidcFail(w, r, "/", "oidc_failed")
		return
	}
	app, msg := parseAppSSO(r.URL.Query())
	if msg != "" {
		writeError(w, http.StatusBadRequest, "invalid_request", msg)
		return
	}
	// With a session the flow links an identity to that account (design D4).
	// An app flow never does: the sheet's browser session is not the app's, so
	// the app's web view decides when it redeems the code.
	mode, userID := oidc.ModeLogin, ""
	if _, sess, _, err := s.authenticateSession(r); err == nil && sess != nil && app == nil {
		mode, userID = oidc.ModeLink, sess.User.ID
	}
	f := s.oidc.States().New(mode, userID, c.Issuer)
	if app != nil {
		f.AppChallenge, f.AppState = app.challenge, app.state
	}
	s.setStateCookie(w, r, s.oidc.States().Encode(f), int(oidc.FlowTTL.Seconds()))
	w.Header().Set("Cache-Control", "no-store")
	http.Redirect(w, r, oidc.AuthCodeURL(m, c.ClientID, s.oidcRedirectURI(r), c.Scopes, f.State, f.Nonce, f.Verifier), http.StatusFound)
}

func (s *Server) handleOIDCCallback(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if !s.oidcLimiter.allow(clientIP(r)) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many attempts, try again later")
		return
	}
	c, ok := s.oidcConfig(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()
	// The state cookie is single-use: cleared whatever happens next.
	s.setStateCookie(w, r, "", -1)
	ck, err := r.Cookie(oidcStateCookie)
	var f *oidc.FlowState
	if err == nil {
		f, err = s.oidc.States().Consume(ck.Value, q.Get("state"))
	}
	if err != nil || f.Issuer != c.Issuer {
		s.oidcError(w, r, http.StatusBadRequest, "oidc_state_invalid", oidc.ErrStateInvalid.Error(), "/")
		return
	}
	page := "/"
	if f.Mode == oidc.ModeLink {
		page = "/settings/account/security"
	}
	fail := func(code string) {
		if f.AppChallenge != "" {
			toApp(w, r, f, url.Values{"error": {code}})
			return
		}
		s.oidcFail(w, r, page, code)
	}
	if e := q.Get("error"); e != "" || q.Get("code") == "" {
		s.log.Info("oidc provider refused sign-in", "error", truncateLog(e))
		s.audit.Record(ctx, audit.LoginFailed("", "", "oidc_provider_error"))
		fail("oidc_failed")
		return
	}
	prov := s.oidc.Provider(c.Issuer)
	m, err := prov.Metadata(ctx)
	var raw string
	var claims *oidc.Claims
	if err == nil {
		raw, err = oidc.Exchange(ctx, s.oidc.Client(), m, c.ClientID, c.ClientSecret, q.Get("code"), f.Verifier, s.oidcRedirectURI(r))
	}
	if err == nil {
		claims, err = prov.Verify(ctx, raw, c.ClientID, f.Nonce, s.oidc.Now())
	}
	if err != nil {
		s.log.Warn("oidc sign-in failed", "err", err)
		s.audit.Record(ctx, audit.LoginFailed("", "", "oidc_token_invalid"))
		fail("oidc_failed")
		return
	}
	if f.AppChallenge != "" {
		// Held until the person confirms on the page that names the account (design D6).
		ticket := s.oidc.Handoffs().Hold(oidc.Handoff{Claims: *claims, IDToken: raw, Issuer: f.Issuer, Challenge: f.AppChallenge, AppState: f.AppState})
		if ticket == "" {
			fail("rate_limited")
			return
		}
		s.showAppContinue(w, r, ticket, claims)
		return
	}
	if f.Mode == oidc.ModeLink {
		s.finishOIDCLink(w, r, c, f.UserID, identityOf(claims), claims.Picture)
		return
	}
	s.finishOIDCLogin(w, r, c, identityOf(claims), raw, claims.Picture)
}

// identityOf is the account-side view of verified claims.
func identityOf(claims *oidc.Claims) auth.ExternalIdentity {
	id := auth.ExternalIdentity{Issuer: claims.Issuer, Subject: claims.Subject, Email: claims.Email,
		EmailVerified: bool(claims.EmailVerified), Name: claims.Name}
	if id.Name == "" {
		id.Name = claims.PreferredUsername
	}
	return id
}

// finishOIDCLogin signs in the account of a verified identity, provisioning or
// linking it by email when the rules allow (design D3).
func (s *Server) finishOIDCLogin(w http.ResponseWriter, r *http.Request, c oidc.Config, id auth.ExternalIdentity, raw, picture string) {
	ctx := r.Context()
	u, _, linked, err := s.auth.MatchOrProvision(ctx, id, c.AllowProvision, c.Name())
	switch {
	case errors.Is(err, auth.ErrLinkRequiresSession):
		// The owner, admins and accounts with a second factor or passkeys link
		// only from Settings while signed in (route-authorization-policy).
		s.audit.Record(ctx, audit.LoginFailed("", "", "oidc_link_required"))
		s.oidcFail(w, r, "/", "oidc_link_required")
		return
	case errors.Is(err, auth.ErrEmailUnverified):
		s.audit.Record(ctx, audit.LoginFailed("", "", "oidc_email_unverified"))
		s.oidcFail(w, r, "/", "oidc_email_unverified")
		return
	case errors.Is(err, auth.ErrSignupClosed):
		s.audit.Record(ctx, audit.LoginFailed("", "", "signup_closed"))
		s.oidcFail(w, r, "/", "signup_closed")
		return
	case errors.Is(err, auth.ErrMemberLimit):
		s.audit.Record(ctx, audit.LoginFailed("", "", "limit_members"))
		s.oidcFail(w, r, "/", "limit_members")
		return
	case err != nil:
		s.log.Warn("oidc account mapping failed", "err", err)
		s.oidcFail(w, r, "/", "oidc_failed")
		return
	}
	// The provider applied its own factor policy: the session satisfies the
	// second factor, so an enrolled account is not asked for a code (mfa-totp
	// D5, oidc-login task 5.1). The owner's enrolment policy still applies to
	// the session like any other (requireAuth restricts it until enrolment).
	// An identity linked by email in this very sign-in never stands in for an
	// account's own factor: MatchOrProvision refuses such accounts, and should
	// one have gained a factor meanwhile, the sign-in is refused here too
	// (route-authorization-policy).
	if linked {
		has, err := s.auth.HasLocalMFA(ctx, u.ID)
		if err != nil {
			s.internal(w, err)
			return
		}
		if has {
			s.audit.Record(ctx, audit.LoginFailed(u.ID, u.Email, "oidc_link_required"))
			s.oidcFail(w, r, "/", "oidc_link_required")
			return
		}
	}
	secret, ok := s.issueSession(w, r, u, true)
	if !ok {
		return
	}
	if err := s.auth.SetSessionIDToken(ctx, secret, raw); err != nil {
		s.log.Warn("store identity-token hint", "err", err)
	}
	s.audit.Record(ctx, audit.LoginSucceeded(u.ID, u.Email, "oidc"))
	s.syncProviderPicture(ctx, u, c, picture)
	redirectTo(w, r, "/", nil)
}

// appSSORequest is the app's part of an app flow.
type appSSORequest struct{ challenge, state string }

// parseAppSSO reads the app's challenge and state from the start route's
// query: nil when there are none, an error message when they are malformed.
func parseAppSSO(q url.Values) (*appSSORequest, string) {
	req := &appSSORequest{challenge: q.Get("app_challenge"), state: q.Get("app_state")}
	switch {
	case req.challenge == "" && req.state == "":
		return nil, ""
	case !mcpoauth.ValidChallenge(req.challenge):
		return nil, "app_challenge must be an S256 code challenge"
	case req.state == "" || len(req.state) > mcpoauth.MaxState:
		return nil, "app_state is required, at most 512 bytes"
	}
	return req, ""
}

// toApp ends an app flow in the sheet: it sends the browser to the app with
// the app's state and a code or an error code.
func toApp(w http.ResponseWriter, r *http.Request, f *oidc.FlowState, q url.Values) {
	q.Set("state", f.AppState)
	redirectTo(w, r, appSSORedirect, q)
}

// handleOIDCAppSession redeems an app flow's code from the app's web view. It
// finishes like the callback of a flow run in that web view: with a session
// there it links the identity to that account, without one it signs in.
func (s *Server) handleOIDCAppSession(w http.ResponseWriter, r *http.Request) {
	if !s.oidcLimiter.allow(clientIP(r)) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many attempts, try again later")
		return
	}
	// A browser page of another site may not redeem a code: holding its own
	// code and verifier, it could sign the web view in to the wrong account or
	// link a foreign identity to a signed-in one. This refuses what a browser
	// declares cross-site (Origin, Sec-Fetch-Site); a client that is not a
	// browser sends neither, and is let through like any API client. Such a
	// client holding a code and its verifier gets a session for itself, which
	// is the accepted risk of a custom URL scheme (design D6).
	if !s.cookieWriteAllowed(r) {
		writeError(w, http.StatusForbidden, "bad_origin", "cross-site request rejected")
		return
	}
	c, ok := s.oidcConfig(w, r)
	if !ok {
		return
	}
	var in struct {
		Code     string `json:"code"`
		Verifier string `json:"code_verifier"`
	}
	if err := readJSON(r, &in); err != nil {
		badBody(w, err)
		return
	}
	h, ok := s.oidc.Handoffs().Take(in.Code, func(challenge string) bool { return mcpoauth.VerifyS256(challenge, in.Verifier) })
	if !ok || h.Issuer != c.Issuer {
		s.audit.Record(r.Context(), audit.LoginFailed("", "", "oidc_state_invalid"))
		writeError(w, http.StatusBadRequest, "oidc_state_invalid", oidc.ErrStateInvalid.Error())
		return
	}
	if _, sess, _, err := s.authenticateSession(r); err == nil && sess != nil {
		s.finishOIDCLink(w, r, c, sess.User.ID, identityOf(&h.Claims), h.Claims.Picture)
		return
	}
	s.finishOIDCLogin(w, r, c, identityOf(&h.Claims), h.IDToken, h.Claims.Picture)
}

// finishOIDCLink links the identity to the account that started the flow
// (userID). The same account must still be signed in on this browser.
func (s *Server) finishOIDCLink(w http.ResponseWriter, r *http.Request, c oidc.Config, userID string, id auth.ExternalIdentity, picture string) {
	ctx := r.Context()
	_, sess, _, err := s.authenticateSession(r)
	if err != nil || sess == nil || sess.User.ID != userID {
		s.oidcError(w, r, http.StatusBadRequest, "oidc_state_invalid", "sign in again before linking an account", "/settings/account/security")
		return
	}
	// Adding a new way to sign in needs a recent proof of identity, like every
	// other credential (credential-freshness); a stale session may only confirm
	// an identity it already has.
	var already bool
	if sess.FreshWithin(FreshWindow, s.auth.Now()) {
		already, err = s.auth.LinkIdentity(ctx, sess.User.ID, id, c.Name())
	} else {
		already, err = s.auth.ConfirmLinkedIdentity(ctx, sess.User.ID, id)
		if err == nil && !already {
			s.oidcError(w, r, http.StatusForbidden, "reauth_required", "confirm your password or a code, then link the account again", "/settings/account/security")
			return
		}
	}
	switch {
	case errors.Is(err, auth.ErrIdentityTaken):
		s.oidcError(w, r, http.StatusConflict, "identity_taken", err.Error(), "/settings/account/security")
		return
	case err != nil:
		s.internal(w, err)
		return
	}
	// Completing the provider flow again with an identity the account already
	// has is a fresh proof of identity for this session, which lets
	// provider-only accounts pass step-up checks. Linking a new identity is not.
	if already {
		if err := s.auth.MarkReauthenticated(ctx, sess.TokenHash, true); err != nil {
			s.internal(w, err)
			return
		}
	}
	s.syncProviderPicture(ctx, sess.User, c, picture)
	v := url.Values{"linked": {"1"}}
	if already {
		v = url.Values{"reauthenticated": {"1"}}
	}
	redirectTo(w, r, "/settings/account/security", v)
}

func truncateLog(s string) string { return textutil.Truncate(s, 100) }

// providerLogoutURL returns where to send the browser after a local sign-out
// of a session that started through the provider, or "" (design D7).
func (s *Server) providerLogoutURL(r *http.Request, idToken string) string {
	c, err := s.oidc.Config(r.Context())
	if err != nil || !c.Enabled() || !c.ProviderLogout {
		return ""
	}
	m, err := s.oidc.Provider(c.Issuer).Metadata(r.Context())
	if err != nil {
		s.log.Warn("oidc discovery for sign-out failed", "err", err)
		return ""
	}
	return oidc.EndSessionURL(m, c.ClientID, idToken, s.publicOrigin(r)+"/")
}

// ---- owner settings ----

func (s *Server) oidcSettingsJSON(r *http.Request, c oidc.Config) map[string]any {
	return map[string]any{
		"enabled":           c.Enabled(),
		"issuer":            c.Issuer,
		"clientId":          c.ClientID,
		"clientSecret":      oidc.MaskSecret(c.ClientSecret),
		"clientSecretSet":   c.ClientSecret != "",
		"displayName":       c.DisplayName,
		"scopes":            c.Scopes,
		"allowProvision":    c.AllowProvision,
		"ssoOnly":           c.SSOOnly,
		"providerLogout":    c.ProviderLogout,
		"syncPictures":      c.SyncPictures,
		"redirectUri":       s.oidcRedirectURI(r),
		"baseUrlConfigured": s.cfg.BaseURL != nil,
		"managedBy":         c.ManagedBy,
	}
}

func (s *Server) handleGetOIDCSettings(w http.ResponseWriter, r *http.Request) {
	c, err := s.oidc.Config(r.Context())
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, s.oidcSettingsJSON(r, c))
}

func (s *Server) handlePutOIDCSettings(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	var in struct {
		Issuer         *string `json:"issuer"`
		ClientID       *string `json:"clientId"`
		ClientSecret   *string `json:"clientSecret"`
		DisplayName    *string `json:"displayName"`
		Scopes         *string `json:"scopes"`
		AllowProvision *bool   `json:"allowProvision"`
		SSOOnly        *bool   `json:"ssoOnly"`
		ProviderLogout *bool   `json:"providerLogout"`
		SyncPictures   *bool   `json:"syncPictures"`
	}
	if err := readJSON(r, &in); err != nil {
		badBody(w, err)
		return
	}
	// The masked value the GET returned means "keep".
	if in.ClientSecret != nil && strings.HasPrefix(*in.ClientSecret, "••••") {
		in.ClientSecret = nil
	}
	changes, err := s.oidc.Save(r.Context(), oidc.Update{Issuer: in.Issuer, ClientID: in.ClientID, ClientSecret: in.ClientSecret,
		DisplayName: in.DisplayName, Scopes: in.Scopes, AllowProvision: in.AllowProvision, SSOOnly: in.SSOOnly, ProviderLogout: in.ProviderLogout,
		SyncPictures: in.SyncPictures})
	var cfgErr *oidc.ErrInvalidConfig
	if errors.As(err, &cfgErr) {
		writeError(w, http.StatusBadRequest, "invalid_input", cfgErr.Error())
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	s.oidc.Reset()
	for _, ch := range changes {
		s.audit.Record(r.Context(), audit.SettingsChanged(u.ID, ch.Key, ch.From, ch.To))
	}
	c, err := s.oidc.Config(r.Context())
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, s.oidcSettingsJSON(r, c))
}

func (s *Server) handleTestOIDC(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Issuer string `json:"issuer"`
	}
	if r.ContentLength != 0 {
		if err := readJSON(r, &in); err != nil {
			badBody(w, err)
			return
		}
	}
	m, err := s.oidc.Test(r.Context(), strings.TrimSpace(in.Issuer))
	var cfgErr *oidc.ErrInvalidConfig
	if errors.As(err, &cfgErr) {
		writeError(w, http.StatusBadRequest, "invalid_input", cfgErr.Error())
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":                    true,
		"issuer":                m.Issuer,
		"authorizationHost":     oidc.HostOf(m.AuthorizationEndpoint),
		"tokenHost":             oidc.HostOf(m.TokenEndpoint),
		"endSessionSupported":   m.EndSessionEndpoint != "",
		"redirectUri":           s.oidcRedirectURI(r),
		"redirectUriConfigured": s.cfg.BaseURL != nil,
	})
}

// ---- linked identities (every user) ----

func (s *Server) handleListIdentities(w http.ResponseWriter, r *http.Request) {
	list, err := s.auth.ListIdentities(r.Context(), userFrom(r.Context()).ID)
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"identities": list, "provider": s.oidcStatus(r.Context())})
}

func (s *Server) handleUnlinkIdentity(w http.ResponseWriter, r *http.Request) {
	c, err := s.oidc.Config(r.Context())
	if err != nil {
		s.internal(w, err)
		return
	}
	err = s.auth.UnlinkIdentity(r.Context(), userFrom(r.Context()), r.PathValue("id"), c.Enabled(), c.Name())
	switch {
	case errors.Is(err, auth.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", "linked account not found")
		return
	case errors.Is(err, auth.ErrLastCredential):
		writeError(w, http.StatusConflict, "last_credential", err.Error())
		return
	case err != nil:
		s.internal(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ssoRequired answers 403 sso_required when SSO-only mode refuses local
// sign-in for u, recording the refusal. It reports whether it answered.
func (s *Server) ssoRequired(w http.ResponseWriter, r *http.Request, u *auth.User) bool {
	if s.auth.LocalLoginAllowed(r.Context(), u) {
		return false
	}
	s.audit.Record(r.Context(), audit.LoginFailed(u.ID, u.Email, "sso_required"))
	writeError(w, http.StatusForbidden, "sso_required", auth.ErrSSORequired.Error())
	return true
}
