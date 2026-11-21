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

// HandoffTTL is how long the app has to redeem a code.
const HandoffTTL = 2 * time.Minute

// maxHandoffs bounds the codes waiting at once; the start and callback routes
// are rate limited per address, so this only matters under a flood.
const maxHandoffs = 1000

// maxPerSubject bounds the codes one identity has waiting at once. The
// callback cannot refuse an identity the provider accepted before the app
// redeems it (a signed-in web view may link it to its account), so without it
// one account at the provider could fill the store and hold every app sign-in
// off for HandoffTTL.
const maxPerSubject = 3

// Handoff is a verified sign-in waiting for the app.
type Handoff struct {
	Claims    Claims // verified against the provider's keys, issuer, audience and nonce
	IDToken   string // the raw ID token, kept as the session's sign-out hint
	Issuer    string // the configured issuer the flow ran against
	Challenge string // the app's S256 challenge
	expires   time.Time
}

// Handoffs holds the codes waiting to be redeemed. Safe for concurrent use.
type Handoffs struct {
	now func() time.Time

	mu    sync.Mutex
	codes map[string]Handoff
}

// NewHandoffs returns an empty store on clock now.
func NewHandoffs(now func() time.Time) *Handoffs {
	if now == nil {
		now = time.Now
	}
	return &Handoffs{now: now, codes: map[string]Handoff{}}
}

// Put stores h and returns its new code, or "" when the store is full.
func (s *Handoffs) Put(h Handoff) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.now()
	for k, v := range s.codes {
		if now.After(v.expires) {
			delete(s.codes, k)
		}
	}
	if len(s.codes) >= maxHandoffs {
		return ""
	}
	same := 0
	for _, v := range s.codes {
		if v.Issuer == h.Issuer && v.Claims.Subject == h.Claims.Subject {
			same++
		}
	}
	if same >= maxPerSubject {
		return ""
	}
	code := ids.Secret(32)
	h.expires = now.Add(HandoffTTL)
	s.codes[code] = h
	return code
}

// Take removes and returns the hand-off of code when it has not expired. A
// code is removed whatever verify answers, so each one gets a single try.
func (s *Handoffs) Take(code string, verify func(challenge string) bool) (Handoff, bool) {
	s.mu.Lock()
	h, ok := s.codes[code]
	delete(s.codes, code)
	s.mu.Unlock()
	if !ok || s.now().After(h.expires) || !verify(h.Challenge) {
		return Handoff{}, false
	}
	return h, true
}
