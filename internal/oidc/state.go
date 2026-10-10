package oidc

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"time"
)

// Flow state (design D4): state, nonce, PKCE verifier and mode travel in one
// HttpOnly cookie signed with HMAC-SHA256 under a per-process random key, so
// nothing is stored per attempt. A restart only aborts logins in flight. Each
// state value is accepted once: consumed values are remembered in memory until
// they would have expired anyway.

// FlowTTL is how long a started sign-in may take.
const FlowTTL = 10 * time.Minute

// Flow modes.
const (
	ModeLogin = "login"
	ModeLink  = "link"
)

// ErrStateInvalid covers a missing, forged, expired, mismatched or replayed state.
var ErrStateInvalid = errors.New("the sign-in attempt is invalid or expired, start again")

// FlowState is what the cookie carries.
type FlowState struct {
	State    string `json:"s"`
	Nonce    string `json:"n"`
	Verifier string `json:"v"`
	Mode     string `json:"m"`
	UserID   string `json:"u,omitempty"` // link mode: the account that started it
	Issuer   string `json:"i"`           // the issuer the flow was started against
	Expires  int64  `json:"e"`           // Unix milliseconds
}

// StateCodec signs, verifies and consumes flow states.
type StateCodec struct {
	key []byte
	now func() time.Time

	mu   sync.Mutex
	used map[string]int64 // state -> expiry (ms)
}

// NewStateCodec returns a codec with a fresh random key.
func NewStateCodec(now func() time.Time) *StateCodec {
	if now == nil {
		now = time.Now
	}
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		panic(err)
	}
	return &StateCodec{key: key, now: now, used: map[string]int64{}}
}

// New creates a flow state for mode with fresh random values.
func (c *StateCodec) New(mode, userID, issuer string) FlowState {
	return FlowState{
		State: RandomString(24), Nonce: RandomString(24), Verifier: RandomString(48),
		Mode: mode, UserID: userID, Issuer: issuer, Expires: c.now().Add(FlowTTL).UnixMilli(),
	}
}

// Encode returns the signed cookie value.
func (c *StateCodec) Encode(f FlowState) string {
	raw, _ := json.Marshal(f)
	p := base64.RawURLEncoding.EncodeToString(raw)
	return p + "." + base64.RawURLEncoding.EncodeToString(c.sign(p))
}

func (c *StateCodec) sign(payload string) []byte {
	m := hmac.New(sha256.New, c.key)
	m.Write([]byte(payload))
	return m.Sum(nil)
}

// Decode verifies the signature and expiry of a cookie value without consuming it.
func (c *StateCodec) Decode(cookie string) (*FlowState, error) {
	p, s, ok := strings.Cut(cookie, ".")
	if !ok {
		return nil, ErrStateInvalid
	}
	sig, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil || !hmac.Equal(sig, c.sign(p)) {
		return nil, ErrStateInvalid
	}
	raw, err := base64.RawURLEncoding.DecodeString(p)
	if err != nil {
		return nil, ErrStateInvalid
	}
	var f FlowState
	if err := json.Unmarshal(raw, &f); err != nil || f.State == "" {
		return nil, ErrStateInvalid
	}
	if c.now().UnixMilli() > f.Expires {
		return nil, ErrStateInvalid
	}
	return &f, nil
}

// Consume verifies cookie against the state returned by the provider and marks
// it used. A second call with the same state fails.
func (c *StateCodec) Consume(cookie, state string) (*FlowState, error) {
	f, err := c.Decode(cookie)
	if err != nil {
		return nil, err
	}
	if state == "" || !hmac.Equal([]byte(state), []byte(f.State)) {
		return nil, ErrStateInvalid
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	now := c.now().UnixMilli()
	for k, exp := range c.used {
		if exp < now {
			delete(c.used, k)
		}
	}
	if _, seen := c.used[f.State]; seen {
		return nil, ErrStateInvalid
	}
	c.used[f.State] = f.Expires
	return f, nil
}
