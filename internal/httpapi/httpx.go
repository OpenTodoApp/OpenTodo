package httpapi

import "github.com/pixari/opentodo/internal/httpapi/httpx"

// The shared pieces of internal/httpapi/httpx under the short names the
// handlers of this package use.

// routePolicy is a route's access policy (httpx.Policy).
type routePolicy = httpx.Policy

var (
	signedIn   = httpx.SignedIn
	public     = httpx.Public
	ownerOnly  = httpx.OwnerOnly
	adminsOnly = httpx.AdminsOnly

	writeJSON        = httpx.WriteJSON
	writeError       = httpx.WriteError
	writeErrorWith   = httpx.WriteErrorWith
	writeFieldError  = httpx.WriteFieldError
	invalidField     = httpx.InvalidField
	readJSON         = httpx.ReadJSON
	readJSONLoose    = httpx.ReadJSONLoose
	readJSONLimit    = httpx.ReadJSONLimit
	readOptionalJSON = httpx.ReadOptionalJSON
	badBody          = httpx.BadBody
	badBodyWith      = httpx.BadBodyWith

	userFrom    = httpx.UserFrom
	sessionFrom = httpx.SessionFrom
	tokenFrom   = httpx.TokenFrom
)
