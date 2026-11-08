package httpapi

import (
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/audit"
	"github.com/OpenTodoApp/opentodo/internal/auth"
	"github.com/OpenTodoApp/opentodo/internal/mcpoauth"
)

// OAuth 2.1 for the MCP endpoint (OpenSpec change `mcp-oauth`). A client that
// cannot be handed a pasted API token — Gemini Apps' Connected apps is one —
// discovers the authorization server here, registers (or is registered by the
// owner), and exchanges an authorization code for an ordinary OpenTodo API
// token (design D2), so /mcp keeps its single token-validation path.
//
// The endpoints below are public in the policy table because a client arrives
// before it holds any credential: the client secret, the PKCE verifier and the
// browser session are checked in the handlers.

const (
	mcpProtectedResourcePath = "/.well-known/oauth-protected-resource"
	mcpAuthorizePath         = "/oauth/authorize"
	mcpTokenPath             = "/oauth/token"
	mcpRegisterPath          = "/oauth/register"
	mcpRevokePath            = "/oauth/revoke"
	mcpClientsPath           = "/api/v1/settings/mcp/clients"
	mcpConsentPath           = "/api/v1/me/mcp-consent"
)

// mcpOAuthMaxBody caps an OAuth request body: these are small form posts.
const mcpOAuthMaxBody = 64 << 10

func (s *Server) registerMCPOAuthRoutes(mux *routes) {
	// Discovery (design D1): anonymous, because a client has to find the
	// authorization server before it can authenticate to anything.
	mux.handle("GET "+mcpProtectedResourcePath, public("MCP clients discover the authorization server before they hold a credential"), s.handleOAuthProtectedResource)
	mux.handle("GET "+mcpProtectedResourcePath+"/mcp", public("MCP clients derive this document from the resource path"), s.handleOAuthProtectedResource)
	mux.handle("GET /.well-known/oauth-authorization-server", public("MCP clients read the authorization server's metadata before they hold a credential"), s.handleOAuthAuthorizationServer)
	// The flow itself. Registration and the token endpoints issue credentials,
	// so a demo sandbox refuses them (D10).
	mux.handle("POST "+mcpRegisterPath, public("dynamic client registration runs before the client has a credential").DemoDenied(), s.handleOAuthRegister)
	mux.handle("GET "+mcpAuthorizePath, public("the authorize step is a browser flow that needs a session, checked in the handler").DemoDenied(), s.handleOAuthAuthorize)
	mux.handle("POST "+mcpTokenPath, public("the token endpoint authenticates the client with its secret and PKCE").DemoDenied(), s.handleOAuthToken)
	// The consent screen's two calls (D5): a session in this browser, never a
	// token, and Allow is a same-origin POST, so a link alone grants nothing.
	mux.handle("GET "+mcpConsentPath, signedIn.SessionOnly().DemoDenied(), s.handleOAuthConsentInfo)
	mux.handle("POST "+mcpConsentPath, signedIn.SessionOnly().DemoDenied(), s.handleOAuthConsent)
	mux.handle("POST "+mcpRevokePath, public("revocation authenticates the client with its secret").DemoDenied(), s.handleOAuthRevoke)
	// The owner's client list (design D3).
	mux.handle("GET "+mcpClientsPath, ownerOnly("manage the AI assistants (MCP) clients"), s.handleListMCPClients)
	mux.handle("POST "+mcpClientsPath, ownerOnly("manage the AI assistants (MCP) clients").Credential().DemoDenied(), s.handleCreateMCPClient)
	mux.handle("DELETE "+mcpClientsPath+"/{id}", ownerOnly("manage the AI assistants (MCP) clients").DemoDenied(), s.handleDeleteMCPClient)
}

// mcpOAuthOn reports whether OAuth is served at all: it follows the owner's MCP
// switch, so an endpoint that does not exist yet advertises nothing (D1).
func (s *Server) mcpOAuthOn(w http.ResponseWriter, r *http.Request) bool {
	if s.mcpSettings.Enabled(r.Context()) {
		return true
	}
	writeError(w, http.StatusNotFound, "not_found", "not found")
	return false
}

// handleOAuthProtectedResource is RFC 9728: which authorization server guards
// the MCP resource.
func (s *Server) handleOAuthProtectedResource(w http.ResponseWriter, r *http.Request) {
	if !s.mcpOAuthOn(w, r) {
		return
	}
	origin := s.publicOrigin(r)
	writeJSON(w, http.StatusOK, map[string]any{
		"resource":                 origin + "/mcp",
		"authorization_servers":    []string{origin},
		"scopes_supported":         []string{mcpoauth.ScopeRead, mcpoauth.ScopeAgent},
		"bearer_methods_supported": []string{"header"},
	})
}

// handleOAuthAuthorizationServer is RFC 8414: where the flow lives and what it
// supports. `registration_endpoint` is always advertised, because the Gemini app
// requires it to be present even when the client id is entered by hand.
func (s *Server) handleOAuthAuthorizationServer(w http.ResponseWriter, r *http.Request) {
	if !s.mcpOAuthOn(w, r) {
		return
	}
	origin := s.publicOrigin(r)
	writeJSON(w, http.StatusOK, map[string]any{
		"issuer":                                origin,
		"authorization_endpoint":                origin + mcpAuthorizePath,
		"token_endpoint":                        origin + mcpTokenPath,
		"registration_endpoint":                 origin + mcpRegisterPath,
		"revocation_endpoint":                   origin + mcpRevokePath,
		"response_types_supported":              []string{"code"},
		"grant_types_supported":                 []string{"authorization_code", "refresh_token"},
		"code_challenge_methods_supported":      []string{"S256"},
		"scopes_supported":                      []string{mcpoauth.ScopeRead, mcpoauth.ScopeAgent},
		"token_endpoint_auth_methods_supported": []string{"client_secret_post", "client_secret_basic"},
	})
}

// registrationPlatform is the platform a dynamic registration is for: every
// requested address must be one of a known connector platform's, all of the
// same platform (mcp-oauth-connector-redirects D3).
func registrationPlatform(uris []string) (mcpoauth.Platform, bool) {
	var platform mcpoauth.Platform
	for i, u := range uris {
		p, ok := mcpoauth.PlatformOf(u)
		if !ok || (i > 0 && p.ID != platform.ID) {
			return mcpoauth.Platform{}, false
		}
		platform = p
	}
	return platform, len(uris) > 0
}

// handleOAuthRegister is RFC 7591 dynamic client registration, confined to the
// redirect addresses of known AI connector platforms (Gemini, ChatGPT, Claude;
// mcp-oauth-connector-redirects D3) so that registering can never be a way for
// an arbitrary site to collect a code.
func (s *Server) handleOAuthRegister(w http.ResponseWriter, r *http.Request) {
	if !s.mcpOAuthOn(w, r) {
		return
	}
	// Registration is anonymous: each address may register a few clients a
	// minute, and the table holds at most MaxDynamicClients at once, after
	// clients nobody authorized within a day are removed.
	if allowed, _ := s.oauthRegisterLimiter.hit(clientIP(r)); !allowed {
		oauthError(w, http.StatusTooManyRequests, "rate_limited", "too many registrations, try again later")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, mcpOAuthMaxBody)
	var in struct {
		ClientName   string   `json:"client_name"`
		RedirectURIs []string `json:"redirect_uris"`
		Scope        string   `json:"scope"`
	}
	if err := readJSON(r, &in); err != nil {
		badBody(w, err)
		return
	}
	if len(in.RedirectURIs) == 0 {
		oauthError(w, http.StatusBadRequest, "invalid_redirect_uri", "redirect_uris is required")
		return
	}
	platform, ok := registrationPlatform(in.RedirectURIs)
	if !ok {
		oauthError(w, http.StatusBadRequest, "invalid_redirect_uri",
			"this server registers only the redirect addresses of Gemini, ChatGPT and Claude automatically; an owner can create a client for another address in Settings")
		return
	}
	name := in.ClientName
	if strings.TrimSpace(name) == "" {
		name = platform.Name
	}
	n, err := s.mcpOAuth.PruneDynamicClients(r.Context())
	if err != nil {
		s.internal(w, err)
		return
	}
	if n >= mcpoauth.MaxDynamicClients {
		oauthError(w, http.StatusServiceUnavailable, "temporarily_unavailable", "this server holds as many registered clients as it accepts; an owner can register one in Settings")
		return
	}
	c, secret, err := s.mcpOAuth.CreateClient(r.Context(), name, platform.Registration(), mcpoauth.ScopeRead, true, "")
	if err != nil {
		s.internal(w, err)
		return
	}
	// An anonymous registration has no account to name in the audit log, and
	// creating a client grants nothing until a person authorizes it.
	s.audit.Record(r.Context(), audit.MCPOAuthClientCreated("", c.ID, c.Scope, "dynamic"))
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusCreated, map[string]any{
		"client_id":                  c.ID,
		"client_secret":              secret,
		"client_id_issued_at":        c.CreatedAt / 1000,
		"client_name":                c.Name,
		"redirect_uris":              in.RedirectURIs,
		"grant_types":                []string{"authorization_code", "refresh_token"},
		"response_types":             []string{"code"},
		"token_endpoint_auth_method": "client_secret_post",
		"scope":                      mcpoauth.ScopeRead,
	})
}

// handleOAuthAuthorize is the browser step: validate the client and the PKCE
// challenge, require a session, and hand the request to the consent screen
// (design D4, D5). It never issues a code itself: a code is only issued when
// the person presses Allow, which is a same-origin POST a link cannot forge.
func (s *Server) handleOAuthAuthorize(w http.ResponseWriter, r *http.Request) {
	if !s.mcpOAuthOn(w, r) {
		return
	}
	req, ok := s.oauthAuthorizeRequest(w, r, r.URL.Query(), true)
	if !ok {
		return
	}
	// A session cookie, never a bearer token: this is a browser step and a
	// token-holder must not be able to mint browser grants.
	u, sess, viaCookie, err := s.authenticateSession(r)
	if err != nil {
		s.internal(w, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	if u == nil || sess == nil || !viaCookie {
		// Send the browser to sign in, and back here afterwards (D5). Logged
		// without the address or the challenge, so a failed connection can be
		// told apart from one that never reached this handler.
		s.log.Info("oauth authorize: no session in this browser, sending it to sign in", "client_id", req.client.ID)
		next := s.publicOrigin(r) + r.URL.RequestURI()
		http.Redirect(w, r, "/?oauth="+url.QueryEscape(next), http.StatusFound)
		return
	}
	http.Redirect(w, r, "/?oauth_consent="+url.QueryEscape(r.URL.RawQuery), http.StatusFound)
}

// oauthRequest is a validated authorize request.
type oauthRequest struct {
	client   mcpoauth.Client
	redirect string
	scope    string
	state    string
	params   url.Values
}

// oauthAuthorizeRequest validates the parameters of an authorize request in
// the order of design D4. An unknown client or an unregistered address is
// answered 400 here, never redirected; once the address is known to be the
// client's, the browser step (redirectErrors) reports to it as the spec asks,
// while the consent API answers 400 and leaves the redirect to the screen.
func (s *Server) oauthAuthorizeRequest(w http.ResponseWriter, r *http.Request, q url.Values, redirectErrors bool) (oauthRequest, bool) {
	fail := func(redirect, code, description string) (oauthRequest, bool) {
		if redirectErrors {
			oauthRedirectError(w, r, redirect, q.Get("state"), code, description)
		} else {
			oauthError(w, http.StatusBadRequest, code, description)
		}
		return oauthRequest{}, false
	}
	redirect := q.Get("redirect_uri")
	c, err := s.mcpOAuth.Client(r.Context(), q.Get("client_id"))
	if err != nil {
		oauthError(w, http.StatusBadRequest, "invalid_client", "unknown client_id")
		return oauthRequest{}, false
	}
	if !c.AllowsRedirect(redirect) {
		// Never redirect to an address the client did not register.
		oauthError(w, http.StatusBadRequest, "invalid_request", "redirect_uri is not registered for this client")
		return oauthRequest{}, false
	}
	if _, err := url.Parse(redirect); err != nil {
		oauthError(w, http.StatusBadRequest, "invalid_request", "redirect_uri is not a valid address")
		return oauthRequest{}, false
	}
	if q.Get("response_type") != "code" {
		return fail(redirect, "unsupported_response_type", "only response_type=code is supported")
	}
	if q.Get("code_challenge_method") != "S256" || q.Get("code_challenge") == "" {
		return fail(redirect, "invalid_request", "code_challenge with code_challenge_method=S256 is required")
	}
	scope := grantedScope(c.Scope, q.Get("scope"))
	if scope == "" {
		return fail(redirect, "invalid_scope", "this client cannot be granted the requested scope")
	}
	return oauthRequest{client: c, redirect: redirect, scope: scope, state: q.Get("state"), params: q}, true
}

// handleOAuthConsentInfo describes a pending authorize request to the consent
// screen: which client asks, for what, and where the answer goes.
func (s *Server) handleOAuthConsentInfo(w http.ResponseWriter, r *http.Request) {
	if !s.mcpOAuthOn(w, r) {
		return
	}
	req, ok := s.oauthAuthorizeRequest(w, r, r.URL.Query(), false)
	if !ok {
		return
	}
	host := ""
	if target, err := url.Parse(req.redirect); err == nil {
		host = target.Host
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"client":       map[string]any{"id": req.client.ID, "name": req.client.Name, "dynamic": req.client.Dynamic},
		"scope":        req.scope,
		"redirectHost": host,
	})
}

// handleOAuthConsent records the person's answer. Allow issues the code and
// returns the client's address carrying it; Deny returns the same address
// carrying access_denied. Either way the screen sends the browser there.
func (s *Server) handleOAuthConsent(w http.ResponseWriter, r *http.Request) {
	if !s.mcpOAuthOn(w, r) {
		return
	}
	var in struct {
		Query string `json:"query"`
		Allow bool   `json:"allow"`
	}
	if err := readJSON(r, &in); err != nil {
		badBody(w, err)
		return
	}
	q, err := url.ParseQuery(in.Query)
	if err != nil {
		oauthError(w, http.StatusBadRequest, "invalid_request", "the authorize request is not a query string")
		return
	}
	req, ok := s.oauthAuthorizeRequest(w, r, q, false)
	if !ok {
		return
	}
	target, _ := url.Parse(req.redirect)
	tq := target.Query()
	if req.state != "" {
		tq.Set("state", req.state)
	}
	if !in.Allow {
		tq.Set("error", "access_denied")
		tq.Set("error_description", "the person declined the request")
		target.RawQuery = tq.Encode()
		writeJSON(w, http.StatusOK, map[string]any{"redirect": target.String()})
		return
	}
	u := userFrom(r.Context())
	code, err := s.mcpOAuth.CreateCode(r.Context(), mcpoauth.Code{
		ClientID: req.client.ID, UserID: u.ID, RedirectURI: req.redirect, Scope: req.scope, Challenge: q.Get("code_challenge"),
	})
	if err != nil {
		s.internal(w, err)
		return
	}
	s.mcpOAuth.TouchClient(r.Context(), req.client.ID)
	s.audit.Record(r.Context(), audit.MCPOAuthGranted(u.ID, req.client.ID, req.scope))
	tq.Set("code", code)
	target.RawQuery = tq.Encode()
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, map[string]any{"redirect": target.String()})
}

// handleOAuthToken exchanges a code or refreshes a grant (design D6).
func (s *Server) handleOAuthToken(w http.ResponseWriter, r *http.Request) {
	if !s.mcpOAuthOn(w, r) {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, mcpOAuthMaxBody)
	if err := r.ParseForm(); err != nil {
		oauthError(w, http.StatusBadRequest, "invalid_request", "the request body is not a form")
		return
	}
	c, ok := s.oauthClientCredentials(w, r)
	if !ok {
		return
	}
	switch r.PostForm.Get("grant_type") {
	case "authorization_code":
		s.oauthExchangeCode(w, r, c)
	case "refresh_token":
		s.oauthRefresh(w, r, c)
	default:
		oauthError(w, http.StatusBadRequest, "unsupported_grant_type", "grant_type must be authorization_code or refresh_token")
	}
}

// oauthExchangeCode turns a code and its PKCE verifier into tokens.
func (s *Server) oauthExchangeCode(w http.ResponseWriter, r *http.Request, c mcpoauth.Client) {
	code, err := s.mcpOAuth.ConsumeCode(r.Context(), r.PostForm.Get("code"))
	if err != nil {
		oauthError(w, http.StatusBadRequest, "invalid_grant", "the code is unknown, expired or already used")
		return
	}
	if code.ClientID != c.ID || code.RedirectURI != r.PostForm.Get("redirect_uri") {
		oauthError(w, http.StatusBadRequest, "invalid_grant", "the code was issued to another client or address")
		return
	}
	if !mcpoauth.VerifyS256(code.Challenge, r.PostForm.Get("code_verifier")) {
		oauthError(w, http.StatusBadRequest, "invalid_grant", "the code_verifier does not match the challenge")
		return
	}
	g, refresh, err := s.mcpOAuth.UpsertGrant(r.Context(), c.ID, code.UserID, code.Scope)
	if err != nil {
		s.internal(w, err)
		return
	}
	access, ok := s.issueOAuthAccess(w, r, c, g)
	if !ok {
		return
	}
	s.mcpOAuth.TouchClient(r.Context(), c.ID)
	writeOAuthTokens(w, access, refresh, code.Scope)
}

// oauthRefresh mints a new access token. A rotating client gets a new refresh
// token and the one it sent stops working; a refresh token that was already
// exchanged revokes the whole grant, because two holders of one token family
// mean one of them is not the client (mcp-oauth-refresh-rotation). A client
// registered only for Google's connector gets the same refresh token back, as
// Google's guide requires (D6).
func (s *Server) oauthRefresh(w http.ResponseWriter, r *http.Request, c mcpoauth.Client) {
	plain := r.PostForm.Get("refresh_token")
	g, err := s.mcpOAuth.GrantByRefresh(r.Context(), plain)
	if errors.Is(err, mcpoauth.ErrNotFound) {
		s.oauthRefreshReused(w, r, c, plain)
		return
	}
	if err != nil || g.ClientID != c.ID {
		oauthError(w, http.StatusBadRequest, "invalid_grant", "the refresh token is unknown")
		return
	}
	if err := s.mcpOAuth.Live(g); err != nil {
		oauthError(w, http.StatusBadRequest, "invalid_grant", "the grant was revoked or has expired; authorize again")
		return
	}
	refresh := plain
	if c.RotatesRefresh() {
		refresh, err = s.mcpOAuth.RotateRefresh(r.Context(), g.ID, plain)
		switch {
		case errors.Is(err, mcpoauth.ErrReused):
			// Another request exchanged this token between the read and the
			// rotation: the same token was presented twice.
			s.revokeReusedGrant(r, g)
			oauthError(w, http.StatusBadRequest, "invalid_grant", "the refresh token was already used; authorize again")
			return
		case errors.Is(err, mcpoauth.ErrRevoked), errors.Is(err, mcpoauth.ErrNotFound):
			oauthError(w, http.StatusBadRequest, "invalid_grant", "the grant was revoked or has expired; authorize again")
			return
		case err != nil:
			s.internal(w, err)
			return
		}
	}
	access, ok := s.issueOAuthAccess(w, r, c, g)
	if !ok {
		return
	}
	writeOAuthTokens(w, access, refresh, g.Scope)
}

// oauthRefreshReused answers a refresh token no grant holds. When it is one a
// grant of this client already exchanged, the grant and its access token are
// revoked and the event is audited; either way the client is told the grant is
// gone.
func (s *Server) oauthRefreshReused(w http.ResponseWriter, r *http.Request, c mcpoauth.Client, plain string) {
	g, err := s.mcpOAuth.GrantByUsedRefresh(r.Context(), plain)
	switch {
	case errors.Is(err, mcpoauth.ErrNotFound) || (err == nil && g.ClientID != c.ID):
		oauthError(w, http.StatusBadRequest, "invalid_grant", "the refresh token is unknown")
	case err != nil:
		s.internal(w, err)
	default:
		if !g.Revoked() {
			s.revokeReusedGrant(r, g)
		}
		oauthError(w, http.StatusBadRequest, "invalid_grant", "the refresh token was already used; authorize again")
	}
}

// revokeReusedGrant ends a grant whose refresh token came back after it was
// rotated: the grant, its current refresh token and its access token stop
// working, and `mcp_oauth.refresh_reused` is recorded.
func (s *Server) revokeReusedGrant(r *http.Request, g mcpoauth.Grant) {
	tokenID, err := s.mcpOAuth.RevokeGrant(r.Context(), g.ID)
	if err != nil {
		slog.Error("mcp oauth: revoking a grant after refresh token reuse", "grant", g.ID, "err", err)
		return
	}
	if tokenID != "" {
		_ = s.auth.DeleteToken(r.Context(), g.UserID, tokenID)
	}
	s.audit.Record(r.Context(), audit.MCPOAuthRefreshReused(g.UserID, g.ClientID))
}

// oauthSwapAttempts bounds how often issueOAuthAccess re-reads a grant that
// another request changed between its read and its swap.
const oauthSwapAttempts = 3

// issueOAuthAccess mints an access token of the grant's scope that expires
// after AccessTTL and swaps it onto the grant, then retires the token the
// grant held, so a person's token list carries one row per grant (D2). The
// swap only succeeds while the grant still holds the token this request read:
// when a concurrent refresh got there first, the grant is read again and the
// new token replaces that one instead; when the grant was revoked or its
// client deleted, the minted token is dropped and the client is told to
// authorize again. No minted token is ever left without a grant pointing to
// it, and the expiry bounds one left by a crash between the two steps.
func (s *Server) issueOAuthAccess(w http.ResponseWriter, r *http.Request, c mcpoauth.Client, g mcpoauth.Grant) (string, bool) {
	ctx := r.Context()
	tok, plain, err := s.auth.CreateTokenExpiring(ctx, g.UserID, "MCP: "+c.Name, tokenScope(g.Scope), s.now().Add(mcpoauth.AccessTTL))
	if err != nil {
		s.internal(w, err)
		return "", false
	}
	for attempt := 0; attempt < oauthSwapAttempts; attempt++ {
		swapped, err := s.mcpOAuth.SwapGrantToken(ctx, g.ID, g.TokenID, tok.ID)
		if err != nil {
			_ = s.auth.DeleteToken(ctx, g.UserID, tok.ID)
			s.internal(w, err)
			return "", false
		}
		if swapped {
			if g.TokenID != "" {
				_ = s.auth.DeleteToken(ctx, g.UserID, g.TokenID)
			}
			return plain, true
		}
		if g, err = s.mcpOAuth.GrantByID(ctx, g.ID); err != nil || s.mcpOAuth.Live(g) != nil {
			break
		}
	}
	_ = s.auth.DeleteToken(ctx, g.UserID, tok.ID)
	oauthError(w, http.StatusBadRequest, "invalid_grant", "the grant was revoked or changed while this request ran; authorize again")
	return "", false
}

// handleOAuthRevoke is RFC 7009. The client authenticates as at the token
// endpoint, and only a token issued to that client is revoked: its refresh
// token, or an access token one of its grants holds; either revokes the grant
// and deletes its access token. Any other token, including an ordinary API
// token, is left alone and answered 200 like an unknown one, as the RFC
// requires (design D8).
func (s *Server) handleOAuthRevoke(w http.ResponseWriter, r *http.Request) {
	if !s.mcpOAuthOn(w, r) {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, mcpOAuthMaxBody)
	if err := r.ParseForm(); err != nil {
		oauthError(w, http.StatusBadRequest, "invalid_request", "the request body is not a form")
		return
	}
	c, ok := s.oauthClientCredentials(w, r)
	if !ok {
		return
	}
	plain := r.PostForm.Get("token")
	g, err := s.mcpOAuth.GrantByRefresh(r.Context(), plain)
	if errors.Is(err, mcpoauth.ErrNotFound) {
		g, err = s.oauthGrantByAccess(r, plain)
	}
	if errors.Is(err, mcpoauth.ErrNotFound) || (err == nil && g.ClientID != c.ID) {
		w.WriteHeader(http.StatusOK)
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	tokenID, err := s.mcpOAuth.RevokeGrant(r.Context(), g.ID)
	if err != nil {
		s.internal(w, err)
		return
	}
	if tokenID != "" {
		_ = s.auth.DeleteToken(r.Context(), g.UserID, tokenID)
	}
	s.audit.Record(r.Context(), audit.MCPOAuthRevoked(g.UserID, g.ClientID))
	w.WriteHeader(http.StatusOK)
}

// oauthGrantByAccess resolves the grant whose current access token is plain,
// or ErrNotFound for any token no grant holds.
func (s *Server) oauthGrantByAccess(r *http.Request, plain string) (mcpoauth.Grant, error) {
	if plain == "" {
		return mcpoauth.Grant{}, mcpoauth.ErrNotFound
	}
	_, tok, err := s.auth.UserByTokenInfo(r.Context(), plain)
	if errors.Is(err, auth.ErrNotFound) {
		return mcpoauth.Grant{}, mcpoauth.ErrNotFound
	}
	if err != nil {
		return mcpoauth.Grant{}, err
	}
	return s.mcpOAuth.GrantByToken(r.Context(), tok.ID)
}

// oauthClientCredentials authenticates the client of a token or revoke request:
// HTTP Basic or the form fields, both accepted by the metadata (design D6).
func (s *Server) oauthClientCredentials(w http.ResponseWriter, r *http.Request) (mcpoauth.Client, bool) {
	id, secret := r.PostForm.Get("client_id"), r.PostForm.Get("client_secret")
	if user, pass, ok := r.BasicAuth(); ok {
		if id == "" {
			id = user
		}
		if secret == "" {
			secret = pass
		}
	}
	if id == "" {
		oauthError(w, http.StatusUnauthorized, "invalid_client", "client_id is required")
		return mcpoauth.Client{}, false
	}
	c, err := s.mcpOAuth.Authenticate(r.Context(), id, secret)
	if err != nil {
		oauthError(w, http.StatusUnauthorized, "invalid_client", "the client id or secret is wrong")
		return mcpoauth.Client{}, false
	}
	return c, true
}

// handleListMCPClients lists the registered clients, never a secret.
func (s *Server) handleListMCPClients(w http.ResponseWriter, r *http.Request) {
	clients, err := s.mcpOAuth.ListClients(r.Context())
	if err != nil {
		s.internal(w, err)
		return
	}
	platforms := make([]map[string]any, 0, len(mcpoauth.Platforms))
	for _, p := range mcpoauth.Platforms {
		platforms = append(platforms, map[string]any{"id": p.ID, "name": p.Name, "redirect_uris": p.Registration()})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"clients":       clients,
		"platforms":     platforms,
		"redirect_uris": mcpoauth.GoogleRegistration(),
		"authorize_url": s.publicOrigin(r) + mcpAuthorizePath,
		"token_url":     s.publicOrigin(r) + mcpTokenPath,
		"discovery_url": s.publicOrigin(r) + mcpProtectedResourcePath,
		"metadata_url":  s.publicOrigin(r) + "/.well-known/oauth-authorization-server",
		"resource":      s.publicOrigin(r) + "/mcp",
	})
}

// clientRedirects is the redirect list of a client the owner creates: a known
// platform's addresses, or custom addresses that are each an exact https
// address, or Google's preset when neither is given
// (mcp-oauth-connector-redirects D4). It writes the error itself.
func clientRedirects(w http.ResponseWriter, platform string, uris []string) ([]string, bool) {
	if platform != "" && len(uris) > 0 {
		writeError(w, http.StatusBadRequest, "bad_request", "give either a platform or redirect addresses, not both")
		return nil, false
	}
	if platform != "" {
		p, ok := mcpoauth.PlatformByID(platform)
		if !ok {
			writeError(w, http.StatusBadRequest, "bad_request", "platform must be google, openai or anthropic")
			return nil, false
		}
		return p.Registration(), true
	}
	if len(uris) == 0 {
		// The Google preset: the six connector addresses Gemini uses.
		return mcpoauth.GoogleRegistration(), true
	}
	if len(uris) > mcpoauth.MaxCustomRedirects {
		writeError(w, http.StatusBadRequest, "invalid_redirect_uri", "a client takes at most ten redirect addresses")
		return nil, false
	}
	for _, u := range uris {
		if err := mcpoauth.ValidCustomRedirect(strings.TrimSpace(u)); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_redirect_uri", err.Error())
			return nil, false
		}
	}
	return uris, true
}

// handleCreateMCPClient registers a client by hand, for a person who has to
// paste a client id and secret into an app (design D3).
func (s *Server) handleCreateMCPClient(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name         string   `json:"name"`
		Scope        string   `json:"scope"`
		Platform     string   `json:"platform"`
		RedirectURIs []string `json:"redirect_uris"`
	}
	if err := readJSON(r, &in); err != nil {
		badBody(w, err)
		return
	}
	if in.Scope == "" {
		in.Scope = mcpoauth.ScopeRead
	}
	if !mcpoauth.ValidScope(in.Scope) {
		writeError(w, http.StatusBadRequest, "invalid_scope", "scope must be read or agent")
		return
	}
	redirects, ok := clientRedirects(w, in.Platform, in.RedirectURIs)
	if !ok {
		return
	}
	u := userFrom(r.Context())
	c, secret, err := s.mcpOAuth.CreateClient(r.Context(), in.Name, redirects, in.Scope, false, u.ID)
	if errors.Is(err, mcpoauth.ErrInvalidRedirect) {
		writeError(w, http.StatusBadRequest, "invalid_redirect_uri", "at least one redirect address is required")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	s.audit.Record(r.Context(), audit.MCPOAuthClientCreated(u.ID, c.ID, c.Scope, "manual"))
	// The secret exists in this response only.
	writeJSON(w, http.StatusCreated, map[string]any{"client": c, "secret": secret})
}

// handleDeleteMCPClient removes a client and cuts off every grant it had.
func (s *Server) handleDeleteMCPClient(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	tokens, err := s.mcpOAuth.DeleteClient(r.Context(), id)
	if errors.Is(err, mcpoauth.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "no such client")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	for _, t := range tokens {
		_ = s.auth.DeleteToken(r.Context(), t.UserID, t.TokenID)
	}
	s.audit.Record(r.Context(), audit.MCPOAuthClientDeleted(userFrom(r.Context()).ID, id))
	w.WriteHeader(http.StatusNoContent)
}

// grantedScope is the scope a grant gets: the client's own, which the person set
// when creating it in OpenTodo (design D7). The request may not widen it, and it
// does not narrow it either: Gemini asks for the first scope the metadata lists
// (`read`), so honouring that turned an `agent` client into a read-only
// connection. A request naming a scope this server does not know is refused.
func grantedScope(clientScope, requested string) string {
	if clientScope == mcpoauth.ScopeAgent {
		return mcpoauth.ScopeAgent
	}
	if strings.TrimSpace(requested) == "" {
		return clientScope
	}
	for _, want := range strings.Fields(requested) {
		if want == mcpoauth.ScopeRead || want == mcpoauth.ScopeAgent {
			return mcpoauth.ScopeRead
		}
	}
	return ""
}

// tokenScope maps an OAuth scope onto the API token scope the MCP endpoint
// enforces (design D2).
func tokenScope(scope string) string {
	if scope == mcpoauth.ScopeAgent {
		return auth.ScopeAgent
	}
	return auth.ScopeRead
}

// writeOAuthTokens is the token response of RFC 6749 §5.1.
func writeOAuthTokens(w http.ResponseWriter, access, refresh, scope string) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	writeJSON(w, http.StatusOK, map[string]any{
		"access_token":  access,
		"token_type":    "Bearer",
		"expires_in":    int(mcpoauth.AccessTTL / time.Second),
		"refresh_token": refresh,
		"scope":         scope,
	})
}

// oauthError is the error shape of RFC 6749 §5.2.
func oauthError(w http.ResponseWriter, status int, code, description string) {
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, status, map[string]any{"error": code, "error_description": description})
}

// oauthRedirectError reports a failure of the authorize step to the client's
// own registered address, which is what the spec asks once the address is known
// to be the client's.
func oauthRedirectError(w http.ResponseWriter, r *http.Request, redirect, state, code, description string) {
	target, err := url.Parse(redirect)
	if err != nil {
		oauthError(w, http.StatusBadRequest, code, description)
		return
	}
	q := target.Query()
	q.Set("error", code)
	q.Set("error_description", description)
	if state != "" {
		q.Set("state", state)
	}
	target.RawQuery = q.Encode()
	w.Header().Set("Cache-Control", "no-store")
	http.Redirect(w, r, target.String(), http.StatusFound)
}
