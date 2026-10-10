package webauthn

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"
)

// ChallengeTTL is how long an issued challenge stays valid.
const ChallengeTTL = 5 * time.Minute

// Challenges is an in-memory store of outstanding ceremony challenges. The
// server is a single process, so memory suffices; a restart only aborts
// in-flight ceremonies. Every challenge is consumed exactly once.
type Challenges struct {
	mu    sync.Mutex
	ttl   time.Duration
	now   func() time.Time
	items map[string]challengeEntry
}

type challengeEntry struct {
	userID  string // "" for sign-in challenges
	expires time.Time
}

// NewChallenges creates a store with the given time-to-live.
func NewChallenges(ttl time.Duration) *Challenges {
	return &Challenges{ttl: ttl, now: time.Now, items: map[string]challengeEntry{}}
}

// Issue creates a 32-byte random challenge bound to userID ("" for sign-in)
// and sweeps expired entries.
func (c *Challenges) Issue(userID string) []byte {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic("webauthn: crypto/rand failed: " + err.Error())
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	now := c.now()
	for k, e := range c.items {
		if !now.Before(e.expires) {
			delete(c.items, k)
		}
	}
	c.items[hex.EncodeToString(b)] = challengeEntry{userID: userID, expires: now.Add(c.ttl)}
	return b
}

// Consume removes the challenge and reports whether it was outstanding, not
// expired and issued to userID. A challenge that fails any check is removed
// too, so it can never be retried.
func (c *Challenges) Consume(challenge []byte, userID string) bool {
	key := hex.EncodeToString(challenge)
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.items[key]
	if !ok {
		return false
	}
	delete(c.items, key)
	return c.now().Before(e.expires) && e.userID == userID
}

// Len reports how many challenges are outstanding (for tests).
func (c *Challenges) Len() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.items)
}
