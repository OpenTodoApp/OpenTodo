package httpapi

import (
	"context"
	"database/sql"
	"fmt"
	"io"
	"log/slog"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/store"
)

func bareServer(t *testing.T) (*Server, *sql.DB) {
	t.Helper()
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return &Server{auth: auth.NewService(db, time.Hour, false), log: slog.New(slog.NewTextHandler(io.Discard, nil))}, db
}

// TestBusyHashingAnswers503 (SEC-5): a request that found every
// password-hashing slot taken gets 503 busy with Retry-After, not 500.
func TestBusyHashingAnswers503(t *testing.T) {
	s, _ := bareServer(t)
	rec := httptest.NewRecorder()
	s.internal(rec, fmt.Errorf("register: %w", auth.ErrBusy))
	if rec.Code != 503 || rec.Header().Get("Retry-After") == "" {
		t.Fatalf("status %d, Retry-After %q", rec.Code, rec.Header().Get("Retry-After"))
	}
	if body := rec.Body.String(); !strings.Contains(body, `"code":"busy"`) {
		t.Fatalf("body = %s", body)
	}
}

// TestRequireSessionOrFullUsesResolvedToken (SEC-7): the route policy's
// full-token rule reads the scope requireAuth put in the context instead of
// resolving the token a second time (route-authorization-policy).
func TestRequireSessionOrFullUsesResolvedToken(t *testing.T) {
	s, _ := bareServer(t)
	for _, tc := range []struct {
		scope string
		want  bool
	}{{auth.ScopeFull, true}, {auth.ScopeAdmin, true}, {auth.ScopeRead, false}, {auth.ScopeAgent, false}} {
		req := httptest.NewRequest("GET", "/api/v1/me/agent-access", nil)
		// The header names no stored token: only the resolved scope can decide.
		req.Header.Set("Authorization", "Bearer ot_not_looked_up_again")
		req = req.WithContext(context.WithValue(req.Context(), tokenKey, auth.TokenInfo{Scope: tc.scope}))
		rec := httptest.NewRecorder()
		if got := s.admits(rec, req, signedIn.fullTokens()); got != tc.want {
			t.Fatalf("scope %s: allowed = %v, want %v (status %d)", tc.scope, got, tc.want, rec.Code)
		}
	}
}
