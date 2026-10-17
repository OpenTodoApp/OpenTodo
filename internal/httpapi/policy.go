package httpapi

import (
	"fmt"
	"net/http"

	"github.com/pixari/opentodo/internal/auth"
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

type policyKind uint8

const (
	kindUnset  policyKind = iota // never valid: registration panics
	kindPublic                   // anonymous by design; the reason says why
	kindAuth                     // a session or an API token (requireAuth)
)

// roleRule limits a route to account roles.
type roleRule uint8

const (
	anyRole   roleRule = iota
	ownerRole          // the server owner
	adminRole          // the owner and admins
)

// tokenRule says which API tokens a route accepts. Sessions are not affected.
type tokenRule uint8

const (
	// tokensByMethod: read and agent tokens are refused on writes (requireAuth,
	// mcp-server D2); full and admin tokens are accepted.
	tokensByMethod tokenRule = iota
	// tokensFull: read and agent tokens are refused even on reads.
	tokensFull
	// tokensAdmin: only admin tokens (credential and administration routes).
	tokensAdmin
	// tokensNone: sessions only.
	tokensNone
)

// routePolicy is the declared access policy of one route.
type routePolicy struct {
	kind   policyKind
	reason string // why a public route needs no sign-in
	role   roleRule
	what   string // completes "only the owner can …" for role refusals
	tokens tokenRule
	// fresh: a session must have proved its identity within FreshWindow
	// (mfa-totp D4); tokens are governed by tokens alone.
	fresh bool
	// demo: a demo instance refuses the route (demoRules in demo.go, checked
	// against this flag by TestDemoDenyListMatchesPolicy).
	demo bool
}

// public is a route that needs no sign-in, with the reason it is safe.
func public(reason string) routePolicy { return routePolicy{kind: kindPublic, reason: reason} }

// signedIn is any session or API token (read and agent tokens only on reads).
var signedIn = routePolicy{kind: kindAuth}

// ownerOnly is the server owner; what completes "only the owner can …".
func ownerOnly(what string) routePolicy {
	return routePolicy{kind: kindAuth, role: ownerRole, what: what}
}

// adminsOnly is the owner and admins; what completes "only the owner and admins can …".
func adminsOnly(what string) routePolicy {
	return routePolicy{kind: kindAuth, role: adminRole, what: what}
}

// credential marks a credential or administration route (SEC-3): API tokens
// need the admin scope; sessions are accepted as the other flags say.
func (p routePolicy) credential() routePolicy { p.tokens = tokensAdmin; return p }

// recent requires a session to have re-authenticated within FreshWindow.
func (p routePolicy) recent() routePolicy { p.fresh = true; return p }

// sensitive is credential plus recent: a recently confirmed session or an admin token.
func (p routePolicy) sensitive() routePolicy { return p.credential().recent() }

// sessionOnly refuses every API token.
func (p routePolicy) sessionOnly() routePolicy { p.tokens = tokensNone; return p }

// fullTokens refuses read and agent tokens on every method.
func (p routePolicy) fullTokens() routePolicy { p.tokens = tokensFull; return p }

// demoDenied marks a route a demo instance refuses.
func (p routePolicy) demoDenied() routePolicy { p.demo = true; return p }

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

// handler is handle for an http.Handler (the web app, sub-handlers).
func (rt *routes) handler(pattern string, p routePolicy, h http.Handler) {
	switch {
	case p.kind == kindUnset:
		panic(fmt.Sprintf("route %q registered without a policy", pattern))
	case p.kind == kindPublic && p.reason == "":
		panic(fmt.Sprintf("public route %q registered without a reason", pattern))
	case p.role != anyRole && p.what == "":
		panic(fmt.Sprintf("route %q limited to a role without a refusal message", pattern))
	}
	rt.table = append(rt.table, routeEntry{pattern: pattern, policy: p})
	if p.kind == kindPublic {
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
	switch p.role {
	case ownerRole:
		if u == nil || u.Role != auth.RoleOwner {
			writeError(w, http.StatusForbidden, "forbidden", "only the owner can "+p.what)
			return false
		}
	case adminRole:
		if u == nil || (u.Role != auth.RoleOwner && u.Role != auth.RoleAdmin) {
			writeError(w, http.StatusForbidden, "forbidden", "only the owner and admins can "+p.what)
			return false
		}
	}
	sess := sessionFrom(r.Context())
	if sess == nil {
		scope := tokenFrom(r.Context()).Scope
		switch {
		case p.tokens == tokensNone:
			writeError(w, http.StatusForbidden, "session_required", "this needs a signed-in browser session, not an API token")
			return false
		case p.tokens == tokensAdmin && scope != auth.ScopeAdmin:
			writeError(w, http.StatusForbidden, "insufficient_scope", "credential and administration routes need a signed-in session or an admin API token (see docs/api.md#token-scopes)")
			return false
		case p.tokens == tokensFull && !auth.FullAccess(scope):
			writeError(w, http.StatusForbidden, "insufficient_scope", "this needs a signed-in session or a full-access API token")
			return false
		}
		return true
	}
	if p.fresh && !sess.FreshWithin(FreshWindow, s.auth.Now()) {
		writeError(w, http.StatusForbidden, "reauth_required", "confirm your password or a code to continue")
		return false
	}
	return true
}
