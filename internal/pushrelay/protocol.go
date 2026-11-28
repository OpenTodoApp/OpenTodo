// Package pushrelay is the OpenTodo push relay (OpenSpec change ios-push-relay,
// capability push-relay): a stateless service that holds the iPhone app's
// Apple push key and forwards content-free wake-ups to Apple's push service.
//
// A device is never stored: registration seals its APNs token and a wake key
// into an opaque handle that only the relay can open (handle.go). A wake names
// a handle and a kind and is signed with the handle's wake key (wake.go). The
// relay builds every payload itself (apns.go), limits per device, per source
// address and per instance in memory (limits.go), and writes one line of
// counters an hour and nothing per request (relay.go). PROTOCOL.md is the
// protocol; TestProtocolDoc keeps it equal to the constants here.
package pushrelay

import "time"

// Protocol is the version in every route's path and in the health answer. A
// new version adds routes beside the old ones, which stay for at least a year.
const Protocol = 1

// The relay's routes: there are no others.
const (
	RouteRegister = "POST /v1/register"
	RouteWake     = "POST /v1/wake"
	RouteHealth   = "GET /v1/health"
)

// Routes lists the relay's routes in the order PROTOCOL.md lists them.
func Routes() []string { return []string{RouteRegister, RouteWake, RouteHealth} }

// Error codes, the body {"error": code} of every refusal.
const (
	CodeInvalid   = "invalid"   // a malformed body, an unknown field, a body over MaxBody
	CodeSignature = "signature" // a forged handle, an unknown key, a wrong signature, a stale time
	CodeExpired   = "expired"   // a handle issued more than HandleTTL ago
	CodeGone      = "gone"      // Apple says the device token is dead
	CodeLimit     = "limit"     // a rate limit; Retry-After says when to try again
	CodeAPNs      = "apns"      // Apple could not be reached or failed transiently
	CodeNotFound  = "not-found" // no such route
	CodeMethod    = "method"    // a route with another method
)

// ErrorCodes maps each code to its HTTP status, as PROTOCOL.md lists them.
func ErrorCodes() map[string]int {
	return map[string]int{
		CodeInvalid: 400, CodeSignature: 401, CodeExpired: 410, CodeGone: 410,
		CodeLimit: 429, CodeAPNs: 502, CodeNotFound: 404, CodeMethod: 405,
	}
}

// Kinds of wake-up.
const (
	KindRefresh = "refresh" // a background push: the app refreshes its schedule
	KindDue     = "due"     // a generic alert the notification extension fills in
)

// Limits and sizes.
const (
	// MaxBody bounds every request body.
	MaxBody = 4096
	// HandleTTL is how long a handle opens after it was issued.
	HandleTTL = 30 * 24 * time.Hour
	// SignatureWindow is how far a wake's time may be from the relay's clock.
	SignatureWindow = 300 * time.Second
	// WakeKeySize is the size of the wake key a server mints.
	WakeKeySize = 32
	// TokenHexMin and TokenHexMax bound the APNs device token, in hex digits.
	TokenHexMin = 64
	TokenHexMax = 200
	// MaxSealKeys is how many sealing keys the relay holds at once.
	MaxSealKeys = 4

	RefreshPerDeviceHour = 3
	DuePerDeviceHour     = 4
	DuePerDeviceDay      = 24
	WakesPerAddressHour  = 3000
	RegistersPerAddrHour = 30
	WakesPerSecond       = 50
	// LRUKeys bounds the rate-limit counters held in memory.
	LRUKeys = 200_000
	// IPv6PrefixBits groups IPv6 source addresses for the per-address limits.
	IPv6PrefixBits = 56
	// APNsTokenRenewal is how often the provider token is signed again.
	APNsTokenRenewal = 40 * time.Minute
)

// Limit is one row of PROTOCOL.md's table of limits.
type Limit struct {
	Name  string
	Value int
}

// Limits lists the limits in the order PROTOCOL.md lists them.
func Limits() []Limit {
	return []Limit{
		{"body bytes", MaxBody},
		{"handle lifetime days", int(HandleTTL / (24 * time.Hour))},
		{"signature window seconds", int(SignatureWindow / time.Second)},
		{"wake key bytes", WakeKeySize},
		{"token hex digits min", TokenHexMin},
		{"token hex digits max", TokenHexMax},
		{"sealing keys", MaxSealKeys},
		{"refresh per device per hour", RefreshPerDeviceHour},
		{"due per device per hour", DuePerDeviceHour},
		{"due per device per day", DuePerDeviceDay},
		{"wakes per address per hour", WakesPerAddressHour},
		{"registrations per address per hour", RegistersPerAddrHour},
		{"wakes per second per instance", WakesPerSecond},
		{"rate-limit keys in memory", LRUKeys},
		{"IPv6 prefix bits per address", IPv6PrefixBits},
		{"provider token renewal minutes", int(APNsTokenRenewal / time.Minute)},
	}
}
