// Package httpx is what the HTTP API's route packages share with
// internal/httpapi (OpenSpec change `route-authorization-policy`): the route
// policy and the Router that registers a handler behind one, the JSON
// envelope and body helpers, and the authenticated caller of a request.
// httpapi enforces the policies; a sub-package (CalDAV, maps, speech to text)
// registers its routes through the Router it is handed and never builds a
// ServeMux of its own.
package httpx

import "net/http"

// Kind is who may call a route at all.
type Kind uint8

const (
	KindUnset  Kind = iota // never valid: registration panics
	KindPublic             // anonymous by design; the reason says why
	KindAuth               // a session or an API token
)

// Role limits a route to account roles.
type Role uint8

const (
	AnyRole   Role = iota
	OwnerRole      // the server owner
	AdminRole      // the owner and admins
)

// Tokens says which API tokens a route accepts. Sessions are not affected.
type Tokens uint8

const (
	// TokensByMethod: read and agent tokens are refused on writes (mcp-server
	// D2); full and admin tokens are accepted.
	TokensByMethod Tokens = iota
	// TokensFull: read and agent tokens are refused even on reads.
	TokensFull
	// TokensAdmin: only admin tokens (credential and administration routes).
	TokensAdmin
	// TokensNone: sessions only.
	TokensNone
)

// Policy is the declared access policy of one route.
type Policy struct {
	Kind   Kind
	Reason string // why a public route needs no sign-in
	Role   Role
	What   string // completes "only the owner can …" for role refusals
	Tokens Tokens
	// Fresh: a session must have proved its identity within FreshWindow
	// (mfa-totp D4); tokens are governed by Tokens alone.
	Fresh bool
	// Demo: a demo instance refuses the route (the deny list in httpapi's
	// demo.go is checked against this flag by TestDemoDenyListMatchesPolicy).
	Demo bool
}

// Public is a route that needs no sign-in, with the reason it is safe.
func Public(reason string) Policy { return Policy{Kind: KindPublic, Reason: reason} }

// SignedIn is any session or API token (read and agent tokens only on reads).
var SignedIn = Policy{Kind: KindAuth}

// OwnerOnly is the server owner; what completes "only the owner can …".
func OwnerOnly(what string) Policy { return Policy{Kind: KindAuth, Role: OwnerRole, What: what} }

// AdminsOnly is the owner and admins; what completes "only the owner and admins can …".
func AdminsOnly(what string) Policy { return Policy{Kind: KindAuth, Role: AdminRole, What: what} }

// Credential marks a credential or administration route (SEC-3): API tokens
// need the admin scope; sessions are accepted as the other flags say.
func (p Policy) Credential() Policy { p.Tokens = TokensAdmin; return p }

// Recent requires a session to have re-authenticated within FreshWindow.
func (p Policy) Recent() Policy { p.Fresh = true; return p }

// Sensitive is Credential plus Recent: a recently confirmed session or an admin token.
func (p Policy) Sensitive() Policy { return p.Credential().Recent() }

// SessionOnly refuses every API token.
func (p Policy) SessionOnly() Policy { p.Tokens = TokensNone; return p }

// FullTokens refuses read and agent tokens on every method.
func (p Policy) FullTokens() Policy { p.Tokens = TokensFull; return p }

// DemoDenied marks a route a demo instance refuses.
func (p Policy) DemoDenied() Policy { p.Demo = true; return p }

// Router registers a handler for a pattern behind a policy (httpapi's routes).
type Router interface {
	Handle(pattern string, p Policy, h http.HandlerFunc)
}
