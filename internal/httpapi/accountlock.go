package httpapi

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/audit"
	"github.com/OpenTodoApp/opentodo/internal/auth"
)

// Per-account failure limit (OpenSpec change trusted-client-identity): failed
// passwords, second-factor codes and re-authentications of one account, from
// any address. Reaching it locks the account's password sign-in, second step
// and re-authentication until the window ends; a successful sign-in clears it.
const (
	accountFailures = 10
	accountWindow   = 15 * time.Minute
)

func accountKey(userID string) string { return "user:" + userID }

// loginAccountKey is the account key for a sign-in attempt. An address without
// an account gets its own key, so unknown and existing accounts lock alike.
func (s *Server) loginAccountKey(ctx context.Context, email string) (string, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	u, err := s.auth.UserByEmail(ctx, email)
	if errors.Is(err, auth.ErrNotFound) {
		return "email:" + email, nil
	}
	if err != nil {
		return "", fmt.Errorf("account lookup: %w", err)
	}
	return accountKey(u.ID), nil
}

// accountLocked answers 429 account_locked with Retry-After when key has used
// up its failures, and records one audit event per window.
func (s *Server) accountLocked(w http.ResponseWriter, r *http.Request, key string) bool {
	locked, first := s.accountLimiter.check(key)
	if !locked {
		return false
	}
	if first {
		uid, _ := strings.CutPrefix(key, "user:")
		if uid == key {
			uid = ""
		}
		s.audit.Record(r.Context(), audit.LoginFailed(uid, "", audit.ReasonRateLimited))
	}
	wait := max(s.accountLimiter.retryAfter(key), time.Second)
	secs := int((wait + time.Second - 1) / time.Second)
	w.Header().Set("Retry-After", strconv.Itoa(secs))
	writeError(w, http.StatusTooManyRequests, "account_locked",
		fmt.Sprintf("too many failed attempts for this account; try again in %d minutes", (secs+59)/60))
	return true
}

// secureCookie reports whether cookies set in answer to r carry the Secure
// flag: always with an https base URL, and for any request that reached us
// over https (TLS here, or a trusted proxy's X-Forwarded-Proto).
func (s *Server) secureCookie(r *http.Request) bool {
	return s.cfg.SecureCookies() || requestIsHTTPS(r)
}

// announceSetupCode generates the setup code while no account exists and no
// setup token is configured, and prints it once (trusted-client-identity).
func (s *Server) announceSetupCode() {
	code, err := s.auth.PrepareSetupCode(context.Background())
	if err != nil {
		s.log.Error("setup code unavailable", "err", err)
		return
	}
	if code == "" {
		// The code is off by default (auth-hardening D6): without a token, the
		// first visitor becomes the owner, so say so once while no owner exists.
		if s.auth.SetupTokenRequired() || s.auth.SetupCodeRequired() {
			return
		}
		if n, err := s.auth.UserCount(context.Background()); err == nil && n == 0 {
			s.log.Warn("No owner account exists yet: the first person to open this server becomes its owner. " +
				"Finish setup now, or set OPENTODO_SETUP_CODE=required to require the code printed in this log.")
		}
		return
	}
	s.log.Warn("No owner account exists yet. To create it from another machine, enter this setup code on the setup screen: "+code+
		" (only a browser on this machine itself, without a proxy, needs no code).", "setup_code", code)
}
