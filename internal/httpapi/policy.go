package httpapi

import (
	"fmt"
	"net/http"

	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/httpapi/httpx"
)

// ---- route authorization policy (OpenSpec change `route-authorization-policy`) ----
//
// Every route is registered through routes.handle with one declared policy:
// who may call it (anonymous with a reason, any signed-in user, the owner, or
// the owner and admins), which credentials (sessions and tokens by scope),
// whether a session must have re-authenticated recently, and whether a demo
// instance refuses it. The router records the table; policy_test.go fails for a
// route registered any other way and checks the table of the security-relevant
// routes and the demo deny list against it.

// routeEntry is one registration: its pattern and policy.
type routeEntry struct {
	pattern string
	policy  routePolicy
}

// routes registers handlers on the mux together with their policy.
type routes struct {
	s     *Server
	mux   *http.ServeMux
	table []routeEntry
}

// handle registers h for pattern behind policy p.
func (rt *routes) handle(pattern string, p routePolicy, h http.HandlerFunc) {
	rt.handler(pattern, p, h)
}

// Handle is handle for the route packages (httpx.Router).
func (rt *routes) Handle(pattern string, p httpx.Policy, h http.HandlerFunc) {
	rt.handler(pattern, p, h)
}

// handler is handle for an http.Handler (the web app, sub-handlers).
func (rt *routes) handler(pattern string, p routePolicy, h http.Handler) {
	switch {
	case p.Kind == httpx.KindUnset:
		panic(fmt.Sprintf("route %q registered without a policy", pattern))
	case p.Kind == httpx.KindPublic && p.Reason == "":
		panic(fmt.Sprintf("public route %q registered without a reason", pattern))
	case p.Role != httpx.AnyRole && p.What == "":
		panic(fmt.Sprintf("route %q limited to a role without a refusal message", pattern))
	}
	rt.table = append(rt.table, routeEntry{pattern: pattern, policy: p})
	if p.Kind == httpx.KindPublic {
		rt.mux.Handle(pattern, h)
		return
	}
	rt.mux.Handle(pattern, rt.s.requireAuth(func(w http.ResponseWriter, r *http.Request) {
		if rt.s.admits(w, r, p) {
			h.ServeHTTP(w, r)
		}
	}))
}

// admits applies the role, token and freshness rules of p to an authenticated
// request (requireAuth already ran), answering the refusal when it does not.
// The role comes first, so a member is told "forbidden" rather than asked to
// re-authenticate or to use another credential.
func (s *Server) admits(w http.ResponseWriter, r *http.Request, p routePolicy) bool {
	u := userFrom(r.Context())
	switch p.Role {
	case httpx.OwnerRole:
		if u == nil || u.Role != auth.RoleOwner {
			writeError(w, http.StatusForbidden, "forbidden", "only the owner can "+p.What)
			return false
		}
	case httpx.AdminRole:
		if u == nil || (u.Role != auth.RoleOwner && u.Role != auth.RoleAdmin) {
			writeError(w, http.StatusForbidden, "forbidden", "only the owner and admins can "+p.What)
			return false
		}
	}
	sess := sessionFrom(r.Context())
	if sess == nil {
		scope := tokenFrom(r.Context()).Scope
		switch {
		case p.Tokens == httpx.TokensNone:
			writeError(w, http.StatusForbidden, "session_required", "this needs a signed-in browser session, not an API token")
			return false
		case p.Tokens == httpx.TokensAdmin && scope != auth.ScopeAdmin:
			writeError(w, http.StatusForbidden, "insufficient_scope", "credential and administration routes need a signed-in session or an admin API token (see docs/api.md#token-scopes)")
			return false
		case p.Tokens == httpx.TokensFull && !auth.FullAccess(scope):
			writeError(w, http.StatusForbidden, "insufficient_scope", "this needs a signed-in session or a full-access API token")
			return false
		}
		return true
	}
	if p.Fresh && !sess.FreshWithin(FreshWindow, s.auth.Now()) {
		writeError(w, http.StatusForbidden, "reauth_required", "confirm your password or a code to continue")
		return false
	}
	return true
}
