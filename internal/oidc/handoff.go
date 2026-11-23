package oidc

import (
	"sync"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/ids"
)

// App hand-off (OpenSpec change app-sso-system-browser, design D2): when the
// OpenTodo app runs single sign-on in the system's authentication sheet, the
// callback does not sign that browser in. It keeps the verified identity under
// a single-use code bound to the app's PKCE challenge and sends the code to the
// app, which redeems it from its own web view. Codes live in memory only, like
// the consumed flow states: a restart aborts a hand-off in flight and the
// person starts again.
//
// The callback holds a hand-off until the person confirms it on a page of the
// server (design D6): the page carries only a ticket, and the code exists for
// the app only once the ticket is posted back. Another app that starts its
// own flow therefore still needs that tap.

// HandoffTTL is how long the app has to redeem a code.
const HandoffTTL = 2 * time.Minute

// maxHandoffs bounds the codes waiting at once; the start and callback routes
// are rate limited per address, so this only matters under a flood.
const maxHandoffs = 1000

// maxPerSubject bounds the codes one identity has waiting at once. The
// callback cannot refuse an identity the provider accepted before the app
// redeems it (a signed-in web view may link it to its account), so without it
// one account at the provider could fill the store and hold every app sign-in
// off for HandoffTTL. A new sign-in replaces that identity's oldest waiting
// code rather than being refused: a sheet closed without Cancel leaves its code
// behind, and three of those must not lock the person out.
const maxPerSubject = 3

// Handoff is a verified sign-in waiting for the app.
type Handoff struct {
	Claims    Claims // verified against the provider's keys, issuer, audience and nonce
	IDToken   string // the raw ID token, kept as the session's sign-out hint
	Issuer    string // the configured issuer the flow ran against
	Challenge string // the app's S256 challenge
	AppState  string // the app's state, sent back with the code
	Link      bool   // the app started it to link the identity, not to sign in
	expires   time.Time
	ticket    string // while held: the confirmation page's ticket
}

// Handoffs holds the codes waiting to be redeemed. Safe for concurrent use.
type Handoffs struct {
	now func() time.Time

	mu      sync.Mutex
	codes   map[string]Handoff
	tickets map[string]string // ticket -> code, while held
}

// NewHandoffs returns an empty store on clock now.
func NewHandoffs(now func() time.Time) *Handoffs {
	if now == nil {
		now = time.Now
	}
	return &Handoffs{now: now, codes: map[string]Handoff{}, tickets: map[string]string{}}
}

// Hold stores h until the person confirms it and returns the ticket the
// confirmation page posts back, or "" when the store is full.
func (s *Handoffs) Hold(h Handoff) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.now()
	for k, v := range s.codes {
		if now.After(v.expires) {
			delete(s.codes, k)
			delete(s.tickets, v.ticket)
		}
	}
	s.makeRoomFor(h)
	if len(s.codes) >= maxHandoffs {
		return ""
	}
	code := ids.Secret(32)
	h.expires = now.Add(HandoffTTL)
	h.ticket = ids.Secret(32)
	s.codes[code] = h
	s.tickets[h.ticket] = code
	return h.ticket
}

// makeRoomFor drops the oldest waiting code of h's identity when it has
// maxPerSubject already, preferring one still held (not yet confirmed).
// Callers hold the lock.
func (s *Handoffs) makeRoomFor(h Handoff) {
	var oldest string
	var oldestH Handoff
	same := 0
	for code, v := range s.codes {
		if v.Issuer != h.Issuer || v.Claims.Subject != h.Claims.Subject {
			continue
		}
		same++
		held, oldestHeld := v.ticket != "", oldestH.ticket != ""
		if oldest == "" || held && !oldestHeld || held == oldestHeld && v.expires.Before(oldestH.expires) {
			oldest, oldestH = code, v
		}
	}
	if same >= maxPerSubject {
		delete(s.codes, oldest)
		delete(s.tickets, oldestH.ticket)
	}
}

// Release turns a held hand-off's ticket into its code, once: the app may
// redeem the code for HandoffTTL from now.
func (s *Handoffs) Release(ticket string) (string, Handoff, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	code, ok := s.tickets[ticket]
	delete(s.tickets, ticket)
	h, found := s.codes[code]
	if !ok || !found || s.now().After(h.expires) {
		return "", Handoff{}, false
	}
	h.ticket = ""
	h.expires = s.now().Add(HandoffTTL)
	s.codes[code] = h
	return code, h, true
}

// Drop forgets a held hand-off (the person cancelled) and returns it.
func (s *Handoffs) Drop(ticket string) (Handoff, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	code, ok := s.tickets[ticket]
	delete(s.tickets, ticket)
	h, found := s.codes[code]
	delete(s.codes, code)
	if !ok || !found || s.now().After(h.expires) {
		return Handoff{}, false
	}
	return h, true
}

// Take removes and returns the hand-off of code when it was released and has
// not expired. A code is removed whatever verify answers, so each one gets a
// single try.
func (s *Handoffs) Take(code string, verify func(challenge string) bool) (Handoff, bool) {
	s.mu.Lock()
	h, ok := s.codes[code]
	delete(s.codes, code)
	s.mu.Unlock()
	if !ok || h.ticket != "" || s.now().After(h.expires) || !verify(h.Challenge) {
		return Handoff{}, false
	}
	return h, true
}
