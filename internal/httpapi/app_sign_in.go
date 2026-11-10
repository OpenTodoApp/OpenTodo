package httpapi

import (
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/audit"
	"github.com/OpenTodoApp/opentodo/internal/httpapi/httpx"
	"github.com/OpenTodoApp/opentodo/internal/mcpoauth"
)

// App sign-in (OpenSpec change native-app-foundation, design D5). The OpenTodo
// app opens /app/sign-in in the system's authentication sheet, which shares the
// browser's cookies and passkeys: the server's own sign-in runs when there is
// no session, then the web app asks to confirm, and Confirm sends the sheet to
// opentodo://signed-in with a single-use code bound to the app's PKCE
// challenge and state. The app exchanges the code and its verifier at
// /api/v1/app/token for an access token of the `app` scope (one hour) and a
// refresh token that rotates on every use. None of it depends on the owner's
// MCP switch.

const (
	appSignInPath   = "/app/sign-in"
	appConsentPath  = "/api/v1/me/app-sign-in"
	appTokenPath    = "/api/v1/app/token"
	appSignOutPath  = "/api/v1/app/sign-out"
	appSessionsPath = "/api/v1/me/apps"
)

// appTokensPerMinute is how many exchanges an address may make a minute: an
// app needs one per sign-in and one an hour after.
const appTokensPerMinute = 20

func (s *Server) registerAppSignInRoutes(mux *routes) {
	s.appTokenLimiter = s.limit("app.token", appTokensPerMinute, time.Minute)
	// The browser steps: a session in this browser, never a token, so a token
	// holder cannot mint a code; Confirm is a same-origin POST, so a link alone
	// grants nothing.
	mux.handle("GET "+appSignInPath, signedIn.SessionOnly().SignInFirst().DemoDenied(), s.handleAppSignIn)
	mux.handle("POST "+appConsentPath, signedIn.SessionOnly().DemoDenied(), s.handleAppSignInAnswer)
	mux.handle("POST "+appTokenPath, public("app code exchange").DemoDenied(), s.handleAppToken)
	mux.handle("POST "+appSignOutPath, signedIn.DemoDenied(), s.handleAppSignOut)
	mux.handle("GET "+appSessionsPath, signedIn, s.handleListAppSessions)
	mux.handle("DELETE "+appSessionsPath+"/{id}", signedIn.DemoDenied(), s.handleRevokeAppSession)
}

// appSignInRequest is a validated sign-in request of the app.
type appSignInRequest struct {
	challenge, state, device string
}

// parseAppSignIn validates the app's parameters: an S256 challenge and a state,
// and optionally the device's name.
func parseAppSignIn(q url.Values) (appSignInRequest, string) {
	req := appSignInRequest{challenge: q.Get("code_challenge"), state: q.Get("state"), device: mcpoauth.CleanDevice(q.Get("device"))}
	switch {
	case q.Get("code_challenge_method") != "S256" || !mcpoauth.ValidChallenge(req.challenge):
		return req, "code_challenge with code_challenge_method=S256 is required"
	case req.state == "" || len(req.state) > mcpoauth.MaxState:
		return req, "state is required, at most 512 bytes"
	}
	return req, ""
}

// handleAppSignIn checks the request and hands it to the web app's consent
// host, naming the app's client, which shows the app's confirmation (loaded
// lazily, like the MCP consent). The policy already sent a browser without a
// session to sign in.
func (s *Server) handleAppSignIn(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if _, msg := parseAppSignIn(r.URL.Query()); msg != "" {
		writeError(w, http.StatusBadRequest, "invalid_request", msg)
		return
	}
	http.Redirect(w, r, "/?oauth_consent="+url.QueryEscape("client_id="+mcpoauth.AppClientID+"&"+r.URL.RawQuery), http.StatusFound)
}

// handleAppSignInAnswer records the person's answer on the confirmation:
// Confirm issues the code, Cancel answers access_denied, both at the app's
// address, which the web app then opens.
func (s *Server) handleAppSignInAnswer(w http.ResponseWriter, r *http.Request) {
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
		writeError(w, http.StatusBadRequest, "invalid_request", "the sign-in request is not a query string")
		return
	}
	req, msg := parseAppSignIn(q)
	if msg != "" {
		writeError(w, http.StatusBadRequest, "invalid_request", msg)
		return
	}
	back := url.Values{"state": {req.state}}
	if !in.Allow {
		back.Set("error", "access_denied")
		writeJSON(w, http.StatusOK, map[string]any{"redirect": mcpoauth.AppRedirect + "?" + back.Encode()})
		return
	}
	u := userFrom(r.Context())
	code, err := s.mcpOAuth.CreateAppCode(r.Context(), u.ID, req.challenge, req.state, req.device)
	if err != nil {
		s.internal(w, err)
		return
	}
	s.audit.Record(r.Context(), audit.MCPOAuthGranted(u.ID, mcpoauth.AppClientID, mcpoauth.ScopeApp))
	back.Set("code", code)
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, map[string]any{"redirect": mcpoauth.AppRedirect + "?" + back.Encode()})
}

// appTokenRequest is the body of POST /api/v1/app/token.
type appTokenRequest struct {
	GrantType    string `json:"grant_type"`
	Code         string `json:"code"`
	CodeVerifier string `json:"code_verifier"`
	State        string `json:"state"`
	RefreshToken string `json:"refresh_token"`
}

// handleAppToken exchanges a code or a refresh token.
func (s *Server) handleAppToken(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if allowed, _ := s.appTokenLimiter.hit(clientIP(r)); !allowed {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many sign-in exchanges from this address, try again in a minute")
		return
	}
	var in appTokenRequest
	if err := httpx.ReadJSONLimit(r, &in, 16<<10); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "the body must be a JSON object with grant_type and its fields")
		return
	}
	switch {
	case in.GrantType == "authorization_code" && in.Code != "":
		s.appExchangeCode(w, r, in)
	case in.GrantType == "refresh_token" && in.RefreshToken != "":
		s.appRefresh(w, r, in.RefreshToken)
	case in.GrantType == "authorization_code":
		writeError(w, http.StatusBadRequest, "invalid_request", "code is required")
	case in.GrantType == "refresh_token":
		writeError(w, http.StatusBadRequest, "invalid_request", "refresh_token is required")
	default:
		writeError(w, http.StatusBadRequest, "invalid_request", "grant_type must be authorization_code or refresh_token")
	}
}

// appExchangeCode turns a code, its verifier and its state into a grant. The
// code is used up by the attempt whatever its outcome, so an intercepted code
// presented without the verifier is gone for the interceptor and the app alike.
func (s *Server) appExchangeCode(w http.ResponseWriter, r *http.Request, in appTokenRequest) {
	code, err := s.mcpOAuth.ConsumeAppCode(r.Context(), in.Code, in.CodeVerifier, in.State)
	switch {
	case errors.Is(err, mcpoauth.ErrNotFound), errors.Is(err, mcpoauth.ErrExpired), errors.Is(err, mcpoauth.ErrMismatch):
		writeError(w, http.StatusBadRequest, "invalid_grant", "the code is unknown, expired, already used, or does not match the code_verifier or state")
		return
	case err != nil:
		s.internal(w, err)
		return
	}
	g, refresh, err := s.mcpOAuth.CreateAppGrant(r.Context(), code.UserID, code.Device)
	if errors.Is(err, mcpoauth.ErrNotFound) {
		writeError(w, http.StatusBadRequest, "invalid_grant", "the account was deactivated")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	access, ok := s.issueAppAccess(w, r, g)
	if !ok {
		return
	}
	writeAppTokens(w, access, refresh)
}

// appRefresh rotates the refresh token and mints a new access token. A refresh
// token that was already exchanged revokes the grant: two holders of one token
// family mean one of them is not the app (RFC 6819 §5.2.2.3).
func (s *Server) appRefresh(w http.ResponseWriter, r *http.Request, plain string) {
	g, err := s.mcpOAuth.AppGrantByRefresh(r.Context(), plain)
	if errors.Is(err, mcpoauth.ErrNotFound) {
		if used, uerr := s.mcpOAuth.AppGrantByUsedRefresh(r.Context(), plain); uerr == nil {
			s.revokeAppGrant(r, used, true)
		}
		writeError(w, http.StatusBadRequest, "invalid_grant", "the refresh token is unknown, revoked or was already used; sign in again")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	if s.mcpOAuth.LiveApp(g) != nil {
		writeError(w, http.StatusBadRequest, "invalid_grant", "the refresh token has expired; sign in again")
		return
	}
	next, err := s.mcpOAuth.RotateAppRefresh(r.Context(), g.ID, plain)
	switch {
	case errors.Is(err, mcpoauth.ErrReused):
		// Another request exchanged this token between the read and the rotation.
		s.revokeAppGrant(r, g, true)
		writeError(w, http.StatusBadRequest, "invalid_grant", "the refresh token was already used; sign in again")
		return
	case errors.Is(err, mcpoauth.ErrNotFound), errors.Is(err, mcpoauth.ErrRevoked):
		writeError(w, http.StatusBadRequest, "invalid_grant", "the refresh token is unknown, revoked or was already used; sign in again")
		return
	case err != nil:
		s.internal(w, err)
		return
	}
	access, ok := s.issueAppAccess(w, r, g)
	if !ok {
		return
	}
	writeAppTokens(w, access, next)
}

// revokeAppGrant ends a grant and deletes its access token, recording
// mcp_oauth.refresh_reused when a reused refresh token is why and
// mcp_oauth.revoked otherwise.
func (s *Server) revokeAppGrant(r *http.Request, g mcpoauth.AppGrant, reused bool) {
	tokenID, err := s.mcpOAuth.RevokeAppGrant(r.Context(), g.UserID, g.ID)
	if errors.Is(err, mcpoauth.ErrNotFound) {
		return
	}
	if err != nil {
		slog.Error("app sign-in: revoking a grant", "grant", g.ID, "err", err)
		return
	}
	if tokenID != "" {
		_ = s.auth.DeleteToken(r.Context(), g.UserID, tokenID)
	}
	if reused {
		s.audit.Record(r.Context(), audit.MCPOAuthRefreshReused(g.UserID, mcpoauth.AppClientID))
		return
	}
	s.audit.Record(r.Context(), audit.MCPOAuthRevoked(g.UserID, mcpoauth.AppClientID))
}

// appTokenName is the name of an app's access token, as the audit log shows it.
func appTokenName(device string) string {
	if device == "" {
		return "OpenTodo app"
	}
	return "OpenTodo app · " + device
}

// issueAppAccess mints an access token of the `app` scope that expires after
// AccessTTL and swaps it onto the grant, then retires the token the grant held.
// Like issueOAuthAccess, a swap that loses a race is retried on the grant as it
// now is, and a grant revoked meanwhile drops the minted token.
func (s *Server) issueAppAccess(w http.ResponseWriter, r *http.Request, g mcpoauth.AppGrant) (string, bool) {
	ctx := r.Context()
	tok, plain, err := s.auth.CreateAppToken(ctx, g.UserID, appTokenName(g.Device), s.now().Add(mcpoauth.AccessTTL))
	if err != nil {
		s.internal(w, err)
		return "", false
	}
	for attempt := 0; attempt < oauthSwapAttempts; attempt++ {
		swapped, err := s.mcpOAuth.SwapAppToken(ctx, g.ID, g.TokenID, tok.ID)
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
		if g, err = s.mcpOAuth.AppGrantByID(ctx, g.ID); err != nil {
			break
		}
	}
	_ = s.auth.DeleteToken(ctx, g.UserID, tok.ID)
	writeError(w, http.StatusBadRequest, "invalid_grant", "the sign-in was revoked while this request ran; sign in again")
	return "", false
}

// writeAppTokens is the token response, in the shape of RFC 6749 §5.1.
func writeAppTokens(w http.ResponseWriter, access, refresh string) {
	w.Header().Set("Pragma", "no-cache")
	writeJSON(w, http.StatusOK, map[string]any{
		"access_token":  access,
		"token_type":    "Bearer",
		"expires_in":    int(mcpoauth.AccessTTL / time.Second),
		"refresh_token": refresh,
		"scope":         mcpoauth.ScopeApp,
	})
}

// handleAppSignOut ends the grant of the app token the request carries:
// signing out in the app.
func (s *Server) handleAppSignOut(w http.ResponseWriter, r *http.Request) {
	g, err := s.mcpOAuth.AppGrantByToken(r.Context(), tokenFrom(r.Context()).ID)
	if errors.Is(err, mcpoauth.ErrNotFound) {
		writeError(w, http.StatusBadRequest, "invalid_request", "only the app's own access token can sign the app out")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	s.revokeAppGrant(r, g, false)
	w.WriteHeader(http.StatusNoContent)
}

// handleListAppSessions lists the person's signed-in apps for the sessions
// list in Settings.
func (s *Server) handleListAppSessions(w http.ResponseWriter, r *http.Request) {
	grants, err := s.mcpOAuth.AppGrants(r.Context(), userFrom(r.Context()).ID)
	if err != nil {
		s.internal(w, err)
		return
	}
	out := make([]map[string]any, 0, len(grants))
	for _, g := range grants {
		out = append(out, map[string]any{"id": g.ID, "device": g.Device, "createdAt": g.CreatedAt, "lastUsedAt": g.LastUsedAt})
	}
	writeJSON(w, http.StatusOK, map[string]any{"apps": out})
}

// handleRevokeAppSession signs one of the person's apps out: its next request
// is refused.
func (s *Server) handleRevokeAppSession(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	g, err := s.mcpOAuth.AppGrantByID(r.Context(), r.PathValue("id"))
	if errors.Is(err, mcpoauth.ErrNotFound) || (err == nil && g.UserID != u.ID) {
		writeError(w, http.StatusNotFound, "not_found", "no such signed-in app")
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	s.revokeAppGrant(r, g, false)
	w.WriteHeader(http.StatusNoContent)
}
