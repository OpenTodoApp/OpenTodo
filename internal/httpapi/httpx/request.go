package httpx

import (
	"context"
	"errors"
	"log/slog"
	"net/http"

	"github.com/pixari/opentodo/internal/auth"
)

type ctxKey int

const (
	userKey ctxKey = 1
	// sessionKey holds the *auth.Session of cookie-authenticated requests; it is
	// absent for bearer tokens, which step-up and policy never touch.
	sessionKey ctxKey = 2
	// tokenKey holds the auth.TokenInfo of the request: the API token's id,
	// name and scope, or only scope full for a session (agent-ready-cli D7).
	tokenKey ctxKey = 3
)

// WithUser records the authenticated account and its credential on ctx
// (httpapi's authentication middleware).
func WithUser(ctx context.Context, u *auth.User, tok auth.TokenInfo) context.Context {
	return context.WithValue(context.WithValue(ctx, userKey, u), tokenKey, tok)
}

// WithSession records the session of a cookie-authenticated request.
func WithSession(ctx context.Context, sess *auth.Session) context.Context {
	return context.WithValue(ctx, sessionKey, sess)
}

// WithToken records only the credential (tests of token scopes).
func WithToken(ctx context.Context, tok auth.TokenInfo) context.Context {
	return context.WithValue(ctx, tokenKey, tok)
}

// UserFrom is the authenticated account of a request behind a signed-in policy.
func UserFrom(ctx context.Context) *auth.User {
	u, _ := ctx.Value(userKey).(*auth.User)
	return u
}

// SessionFrom is the session of a cookie-authenticated request, nil for a token.
func SessionFrom(ctx context.Context) *auth.Session {
	sess, _ := ctx.Value(sessionKey).(*auth.Session)
	return sess
}

// TokenFrom is the request's credential: an API token's id, name and scope,
// or scope full for a session.
func TokenFrom(ctx context.Context) auth.TokenInfo {
	t, _ := ctx.Value(tokenKey).(auth.TokenInfo)
	return t
}

// Internal answers 500 (or 503 while every password-hashing slot is busy) and
// logs the cause.
func Internal(w http.ResponseWriter, log *slog.Logger, err error) {
	if errors.Is(err, auth.ErrBusy) {
		// Every password-hashing slot is taken (SEC-5): a retry soon succeeds.
		w.Header().Set("Retry-After", "1")
		WriteError(w, http.StatusServiceUnavailable, "busy", "the server is busy, try again in a moment")
		return
	}
	log.Error("request failed", "err", err)
	WriteError(w, http.StatusInternalServerError, "internal", "internal error")
}
