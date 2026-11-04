package httpapi

import (
	"errors"
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
)

// mcpOAuthMaxBody caps an OAuth request body: these are small form posts.
const mcpOAuthMaxBody = 64 << 10

func (s *Server) registerMCPOAuthRoutes(mux *routes) {
	s.mcpOAuth = mcpoauth.New(s.sync.DB())
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

// handleOAuthRegister is RFC 7591 dynamic client registration, confined to
// Google's connector redirect addresses (design D3) so that registering can
// never be a way for an arbitrary site to collect a code.
func (s *Server) handleOAuthRegister(w http.ResponseWriter, r *http.Request) {
	if !s.mcpOAuthOn(w, r) {
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
	for _, u := range in.RedirectURIs {
		if !mcpoauth.IsGoogleRedirect(u) {
			oauthError(w, http.StatusBadRequest, "invalid_redirect_uri",
				"this server registers only Google's oauth-redirect addresses automatically; an owner can register another address in Settings")
			return
		}
	}
	name := in.ClientName
	if strings.TrimSpace(name) == "" {
		name = "Google"
	}
	c, secret, err := s.mcpOAuth.CreateClient(r.Context(), name, mcpoauth.GoogleRegistration(), mcpoauth.ScopeRead, true, "", true)
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
// challenge, require a session, and send the code back to the registered
// address (design D4, D5).
func (s *Server) handleOAuthAuthorize(w http.ResponseWriter, r *http.Request) {
	if !s.mcpOAuthOn(w, r) {
		return
	}
	q := r.URL.Query()
	clientID := q.Get("client_id")
	redirect := q.Get("redirect_uri")
	c, err := s.mcpOAuth.Client(r.Context(), clientID)
	if err != nil {
		oauthError(w, http.StatusBadRequest, "invalid_client", "unknown client_id")
		return
	}
	if !c.AllowsRedirect(redirect) {
		// Never redirect to an address the client did not register.
		oauthError(w, http.StatusBadRequest, "invalid_request", "redirect_uri is not registered for this client")
		return
	}
	if q.Get("response_type") != "code" {
		oauthRedirectError(w, r, redirect, q.Get("state"), "unsupported_response_type", "only response_type=code is supported")
		return
	}
	if q.Get("code_challenge_method") != "S256" || q.Get("code_challenge") == "" {
		oauthRedirectError(w, r, redirect, q.Get("state"), "invalid_request", "code_challenge with code_challenge_method=S256 is required")
		return
	}
	// A session cookie, never a bearer token: this is a browser step and a
	// token-holder must not be able to mint browser grants.
	u, sess, viaCookie, err := s.authenticateSession(r)
	if err != nil {
		s.internal(w, err)
		return
	}
	if u == nil || sess == nil || !viaCookie {
		// Send the browser to sign in, and back here afterwards (D5). Logged
		// without the address or the challenge, so a failed connection can be
		// told apart from one that never reached this handler.
		s.log.Info("oauth authorize: no session in this browser, sending it to sign in", "client_id", c.ID)
		next := s.publicOrigin(r) + r.URL.RequestURI()
		http.Redirect(w, r, "/?oauth="+url.QueryEscape(next), http.StatusFound)
		return
	}
	scope := grantedScope(c.Scope, q.Get("scope"))
	if scope == "" {
		oauthRedirectError(w, r, redirect, q.Get("state"), "invalid_scope", "this client cannot be granted the requested scope")
		return
	}
	code, err := s.mcpOAuth.CreateCode(r.Context(), mcpoauth.Code{
		ClientID: c.ID, UserID: u.ID, RedirectURI: redirect, Scope: scope, Challenge: q.Get("code_challenge"),
	})
	if err != nil {
		s.internal(w, err)
		return
	}
	s.mcpOAuth.TouchClient(r.Context(), c.ID)
	s.audit.Record(r.Context(), audit.MCPOAuthGranted(u.ID, c.ID, scope))
	target, err := url.Parse(redirect)
	if err != nil {
		oauthError(w, http.StatusBadRequest, "invalid_request", "redirect_uri is not a valid address")
		return
	}
	tq := target.Query()
	tq.Set("code", code)
	if state := q.Get("state"); state != "" {
		tq.Set("state", state)
	}
	target.RawQuery = tq.Encode()
	w.Header().Set("Cache-Control", "no-store")
	http.Redirect(w, r, target.String(), http.StatusFound)
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
	access, tokenID, err := s.mintOAuthAccess(r, c, code.UserID, code.Scope, g.TokenID)
	if err != nil {
		s.internal(w, err)
		return
	}
	if err := s.mcpOAuth.SetGrantToken(r.Context(), g.ID, tokenID); err != nil {
		s.internal(w, err)
		return
	}
	s.mcpOAuth.TouchClient(r.Context(), c.ID)
	writeOAuthTokens(w, access, refresh, code.Scope)
}

// oauthRefresh mints a new access token and returns the same refresh token, so
// the client stays linked instead of having to be connected again (D6).
func (s *Server) oauthRefresh(w http.ResponseWriter, r *http.Request, c mcpoauth.Client) {
	plain := r.PostForm.Get("refresh_token")
	g, err := s.mcpOAuth.GrantByRefresh(r.Context(), plain)
	if err != nil || g.ClientID != c.ID {
		oauthError(w, http.StatusBadRequest, "invalid_grant", "the refresh token is unknown")
		return
	}
	if err := s.mcpOAuth.Live(g); err != nil {
		oauthError(w, http.StatusBadRequest, "invalid_grant", "the grant was revoked or has expired; authorize again")
		return
	}
	access, tokenID, err := s.mintOAuthAccess(r, c, g.UserID, g.Scope, g.TokenID)
	if err != nil {
		s.internal(w, err)
		return
	}
	if err := s.mcpOAuth.SetGrantToken(r.Context(), g.ID, tokenID); err != nil {
		s.internal(w, err)
		return
	}
	writeOAuthTokens(w, access, plain, g.Scope)
}

// mintOAuthAccess mints an API token of the granted scope and retires the one
// the grant held, so a person's token list carries one row per grant (D2).
func (s *Server) mintOAuthAccess(r *http.Request, c mcpoauth.Client, userID, scope, previous string) (string, string, error) {
	if previous != "" {
		_ = s.auth.DeleteToken(r.Context(), userID, previous)
	}
	tok, plain, err := s.auth.CreateTokenScoped(r.Context(), userID, "MCP: "+c.Name, tokenScope(scope))
	if err != nil {
		return "", "", err
	}
	return plain, tok.ID, nil
}

// handleOAuthRevoke is RFC 7009. It accepts an access token or a refresh token
// and revokes what it identifies; an unknown token is still 200 (design D8).
func (s *Server) handleOAuthRevoke(w http.ResponseWriter, r *http.Request) {
	if !s.mcpOAuthOn(w, r) {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, mcpOAuthMaxBody)
	if err := r.ParseForm(); err != nil {
		oauthError(w, http.StatusBadRequest, "invalid_request", "the request body is not a form")
		return
	}
	plain := r.PostForm.Get("token")
	if plain == "" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if g, err := s.mcpOAuth.GrantByRefresh(r.Context(), plain); err == nil {
		if tokenID, err := s.mcpOAuth.RevokeGrant(r.Context(), g.ID); err == nil {
			if tokenID != "" {
				_ = s.auth.DeleteToken(r.Context(), g.UserID, tokenID)
			}
			s.audit.Record(r.Context(), audit.MCPOAuthRevoked(g.UserID, g.ClientID))
		}
		w.WriteHeader(http.StatusOK)
		return
	}
	// An access token: retire it, and the grant it came from.
	if u, tok, err := s.auth.UserByTokenInfo(r.Context(), plain); err == nil && u != nil {
		if g, err := s.mcpOAuth.GrantByToken(r.Context(), tok.ID); err == nil {
			if tokenID, rerr := s.mcpOAuth.RevokeGrant(r.Context(), g.ID); rerr == nil && tokenID != "" {
				_ = s.auth.DeleteToken(r.Context(), g.UserID, tokenID)
			}
			s.audit.Record(r.Context(), audit.MCPOAuthRevoked(g.UserID, g.ClientID))
		} else {
			_ = s.auth.DeleteToken(r.Context(), u.ID, tok.ID)
		}
	}
	w.WriteHeader(http.StatusOK)
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
		// A public client (no secret) authenticates with PKCE alone; every
		// client this server creates holds a secret, so this is only reached by
		// a client whose registration failed halfway.
		if reg, cerr := s.mcpOAuth.Client(r.Context(), id); cerr == nil && !reg.SecretSet {
			return reg, true
		}
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
	writeJSON(w, http.StatusOK, map[string]any{
		"clients":       clients,
		"redirect_uris": mcpoauth.GoogleRegistration(),
		"authorize_url": s.publicOrigin(r) + mcpAuthorizePath,
		"token_url":     s.publicOrigin(r) + mcpTokenPath,
		"discovery_url": s.publicOrigin(r) + mcpProtectedResourcePath,
		"metadata_url":  s.publicOrigin(r) + "/.well-known/oauth-authorization-server",
		"resource":      s.publicOrigin(r) + "/mcp",
	})
}

// handleCreateMCPClient registers a client by hand, for a person who has to
// paste a client id and secret into an app (design D3).
func (s *Server) handleCreateMCPClient(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name         string   `json:"name"`
		Scope        string   `json:"scope"`
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
	redirects := in.RedirectURIs
	if len(redirects) == 0 {
		// The Google preset: the six connector addresses Gemini uses.
		redirects = mcpoauth.GoogleRegistration()
	}
	u := userFrom(r.Context())
	c, secret, err := s.mcpOAuth.CreateClient(r.Context(), in.Name, redirects, in.Scope, false, u.ID, true)
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
