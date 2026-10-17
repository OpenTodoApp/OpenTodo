package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base32"
	"errors"
	"fmt"
	"strings"
	"sync"
)

// ErrSetupCodeInvalid refuses a first registration from a public address
// without the setup code printed in the server log.
var ErrSetupCodeInvalid = errors.New("setting up this server from outside its local network needs the setup code printed in the server log")

// setupCode guards a first registration from a public address when no
// OPENTODO_SETUP_TOKEN is configured (OpenSpec change trusted-client-identity):
// the server generates it at startup while no account exists, prints it once
// in its log, and forgets it as soon as the owner exists. It lives in memory
// only, so a restart prints a new one.
type setupCode struct {
	mu   sync.Mutex
	code string // normalized: 16 base32 characters, no separators
}

// newSetupCode is four groups of four base32 characters (80 random bits).
func newSetupCode() string {
	b := make([]byte, 10)
	_, _ = rand.Read(b) // crypto/rand.Read never fails
	return base32.StdEncoding.EncodeToString(b)
}

// normalizeSetupCode accepts the code in any case, with or without the dashes
// and spaces people copy along.
func normalizeSetupCode(s string) string {
	return strings.Map(func(r rune) rune {
		if r == '-' || r == ' ' || r == '\t' {
			return -1
		}
		return r
	}, strings.ToUpper(strings.TrimSpace(s)))
}

// matches compares in constant time; no code (none generated, or already
// discarded) matches nothing.
func (c *setupCode) matches(given string) bool {
	c.mu.Lock()
	want := c.code
	c.mu.Unlock()
	if want == "" {
		return false
	}
	w := sha256.Sum256([]byte(want))
	g := sha256.Sum256([]byte(normalizeSetupCode(given)))
	return subtle.ConstantTimeCompare(w[:], g[:]) == 1
}

func (c *setupCode) discard() {
	c.mu.Lock()
	c.code = ""
	c.mu.Unlock()
}

// PrepareSetupCode generates the setup code when it is needed: no account
// exists and no setup token is configured. It returns the code formatted for
// the log (XXXX-XXXX-XXXX-XXXX), or "" when none is needed. Calling it again
// keeps the code already generated.
func (s *Service) PrepareSetupCode(ctx context.Context) (string, error) {
	if s.setupToken != "" {
		return "", nil
	}
	n, err := s.UserCount(ctx)
	if err != nil {
		return "", fmt.Errorf("setup code: %w", err)
	}
	if n > 0 {
		return "", nil
	}
	s.setupCode.mu.Lock()
	defer s.setupCode.mu.Unlock()
	if s.setupCode.code == "" {
		s.setupCode.code = newSetupCode()
	}
	c := s.setupCode.code
	return c[0:4] + "-" + c[4:8] + "-" + c[8:12] + "-" + c[12:16], nil
}

// SetupCodeRequired reports whether a first registration from a public address
// needs the setup code: no setup token is configured. It matters only while no
// account exists.
func (s *Service) SetupCodeRequired() bool { return s.setupToken == "" }
