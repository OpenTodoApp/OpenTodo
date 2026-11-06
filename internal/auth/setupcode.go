package auth

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base32"
	"errors"
	"fmt"
	"strings"
	"sync"

	"github.com/OpenTodoApp/opentodo/internal/ids"
)

// ErrSetupCodeInvalid refuses a first registration from a public address
// without the setup code printed in the server log.
var ErrSetupCodeInvalid = errors.New("setting up this server from another machine needs the setup code printed in the server log")

// ErrSetupHostUnverified refuses a first registration addressed to a domain
// name while no OPENTODO_BASE_URL is set and the code was not given
// (host-check-without-base-url). It answers with the same `setup_code_invalid`
// code; the message says what to do.
var ErrSetupHostUnverified = errors.New("this server was opened under a domain name and has no OPENTODO_BASE_URL: enter the setup code printed in the server log, or set OPENTODO_BASE_URL to this address and restart the server")

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
	return base32.StdEncoding.EncodeToString(ids.Bytes(10))
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

// PrepareSetupCode generates the setup code when it can be asked for: no
// account exists, no setup token is configured, and either the code is on or
// the host check is (no OPENTODO_BASE_URL). It returns the code formatted for
// the log (XXXX-XXXX-XXXX-XXXX), or "" when none is needed. Calling it again
// keeps the code already generated.
func (s *Service) PrepareSetupCode(ctx context.Context) (string, error) {
	if s.setupToken != "" || (!s.setupCodeOn && !s.setupHostCheck) {
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

// SetSetupCodeRequired turns the setup code on (OPENTODO_SETUP_CODE=required,
// OpenSpec change auth-hardening, D6); it is off by default.
func (s *Service) SetSetupCodeRequired(on bool) { s.setupCodeOn = on }

// SetupCodeRequired reports whether a first registration that does not come
// from this machine needs the setup code: the code is turned on and no setup
// token is configured (a token always wins). It matters only while no account
// exists.
func (s *Service) SetupCodeRequired() bool { return s.setupCodeOn && s.setupToken == "" }

// SetSetupHostCheck turns on the first-run host check (OpenSpec change
// host-check-without-base-url): with no OPENTODO_BASE_URL, a first
// registration addressed to a domain name that anyone could point at this
// server needs the setup code, whatever OPENTODO_SETUP_CODE says.
func (s *Service) SetSetupHostCheck(on bool) { s.setupHostCheck = on }

// SetupFrom says where a first registration comes from, which decides whether
// it needs the setup code.
type SetupFrom struct {
	// Local: a loopback connection carrying no forwarding header.
	Local bool
	// UnverifiedHost: the request is addressed to a domain name, not an IP
	// address, localhost or a name that only a local network resolves, so a
	// page under that name may be another site's that resolves here (DNS
	// rebinding).
	UnverifiedHost bool
}

// SetupCodeNeeded reports whether a first registration from `from` must carry
// the setup code. A configured setup token always replaces the code. With the
// code on, every registration but a local one needs it; with the host check
// on, one addressed to an unverified host needs it too, even from this
// machine, since a browser here may be showing another site's page.
func (s *Service) SetupCodeNeeded(from SetupFrom) bool {
	if s.setupToken != "" {
		return false
	}
	return (s.setupCodeOn && !from.Local) || (s.setupHostCheck && from.UnverifiedHost)
}

// SetupCodeOnlyForHosts reports whether the setup code exists only for the
// host check: the code itself is off and no token is configured.
func (s *Service) SetupCodeOnlyForHosts() bool {
	return s.setupToken == "" && !s.setupCodeOn && s.setupHostCheck
}
