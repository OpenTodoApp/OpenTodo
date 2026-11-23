package cli

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

// fakeMFAServer answers like an account with two-factor authentication: the
// password step returns a challenge and no session; POST /auth/mfa with the
// right code (or recovery code) starts the session, and the token is minted
// with it.
type fakeMFAServer struct {
	mu        sync.Mutex
	mfaBody   map[string]any
	tokens    int
	loggedOut bool
}

func (f *fakeMFAServer) handler(t *testing.T) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/v1/auth/login", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"mfaRequired": true, "challenge": "ch-1", "expiresAt": 1})
	})
	mux.HandleFunc("POST /api/v1/auth/mfa", func(w http.ResponseWriter, r *http.Request) {
		var in map[string]any
		_ = json.NewDecoder(r.Body).Decode(&in)
		f.mu.Lock()
		f.mfaBody = in
		f.mu.Unlock()
		ok := in["challenge"] == "ch-1" && (in["code"] == "123456" || in["recoveryCode"] == "ABCDE-FGHJK")
		if !ok {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			_ = json.NewEncoder(w).Encode(map[string]any{"error": map[string]string{"code": "mfa_code_invalid", "message": "the code is not valid"}})
			return
		}
		http.SetCookie(w, &http.Cookie{Name: "opentodo_session", Value: "s-1", Path: "/"})
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"user": map[string]any{"id": "u1", "email": "ada@example.com", "name": "Ada"}})
	})
	mux.HandleFunc("POST /api/v1/tokens", func(w http.ResponseWriter, r *http.Request) {
		if c, err := r.Cookie("opentodo_session"); err != nil || c.Value != "s-1" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		f.mu.Lock()
		f.tokens++
		f.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"token": map[string]any{"id": "t1", "name": "cli@testbox"}, "secret": "ot_secret"})
	})
	mux.HandleFunc("POST /api/v1/auth/logout", func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		f.loggedOut = true
		f.mu.Unlock()
		w.WriteHeader(http.StatusNoContent)
	})
	return mux
}

func runLogin(t *testing.T, url, stdin string, args ...string) (int, string, string, string) {
	t.Helper()
	cfg := filepath.Join(t.TempDir(), "config.json")
	var out, errb bytes.Buffer
	a := &App{
		Stdin:      strings.NewReader(stdin),
		Stdout:     &out,
		Stderr:     &errb,
		ConfigPath: cfg,
		Getenv:     func(string) string { return "" },
		Now:        func() time.Time { return fixedNow },
		Hostname:   "testbox",
		IsTerminal: func() bool { return false },
	}
	code := a.Main(append([]string{"login", url, "--email", "ada@example.com"}, args...))
	return code, out.String(), errb.String(), cfg
}

func TestLoginAsksForTheTwoFactorCode(t *testing.T) {
	f := &fakeMFAServer{}
	srv := httptest.NewServer(f.handler(t))
	defer srv.Close()

	code, out, errb, cfgPath := runLogin(t, srv.URL, "secret-password\n123 456\n")
	if code != 0 {
		t.Fatalf("login exit %d: %s %s", code, out, errb)
	}
	if !strings.Contains(errb, "Two-factor code") {
		t.Fatalf("no two-factor prompt: %q", errb)
	}
	if f.mfaBody["challenge"] != "ch-1" || f.mfaBody["code"] != "123456" || f.mfaBody["recoveryCode"] != nil {
		t.Fatalf("POST /auth/mfa body = %v", f.mfaBody)
	}
	if f.tokens != 1 || !f.loggedOut {
		t.Fatalf("tokens minted %d, logged out %v", f.tokens, f.loggedOut)
	}
	if !strings.Contains(out, "as ada@example.com") {
		t.Fatalf("output = %q", out)
	}
	raw, err := os.ReadFile(cfgPath)
	if err != nil || !strings.Contains(string(raw), "ot_secret") {
		t.Fatalf("config = %s (%v)", raw, err)
	}
}

func TestLoginTakesARecoveryCodeInsteadOfTheTwoFactorCode(t *testing.T) {
	f := &fakeMFAServer{}
	srv := httptest.NewServer(f.handler(t))
	defer srv.Close()

	code, out, errb, _ := runLogin(t, srv.URL, "secret-password\nABCDE-FGHJK\n")
	if code != 0 {
		t.Fatalf("login exit %d: %s %s", code, out, errb)
	}
	if f.mfaBody["recoveryCode"] != "ABCDE-FGHJK" || f.mfaBody["code"] != nil {
		t.Fatalf("POST /auth/mfa body = %v", f.mfaBody)
	}
}

func TestLoginWithAWrongTwoFactorCodeStoresNothing(t *testing.T) {
	f := &fakeMFAServer{}
	srv := httptest.NewServer(f.handler(t))
	defer srv.Close()

	code, out, errb, cfgPath := runLogin(t, srv.URL, "secret-password\n000000\n")
	if code != ExitAuth {
		t.Fatalf("login with a wrong code: exit %d, want %d (%s)", code, ExitAuth, out)
	}
	if strings.Contains(errb, "did not start a session") || !strings.Contains(errb, "not valid") {
		t.Fatalf("stderr = %q", errb)
	}
	if f.tokens != 0 {
		t.Fatalf("a token was minted: %d", f.tokens)
	}
	if _, err := os.Stat(cfgPath); err == nil {
		raw, _ := os.ReadFile(cfgPath)
		if strings.Contains(string(raw), "ot_") {
			t.Fatalf("a token was stored: %s", raw)
		}
	}
}

func TestLoginWithoutATwoFactorCodeSendsNothing(t *testing.T) {
	f := &fakeMFAServer{}
	srv := httptest.NewServer(f.handler(t))
	defer srv.Close()

	// Stdin ends after the password: nothing to answer the challenge with.
	code, _, errb, _ := runLogin(t, srv.URL, "secret-password\n")
	if code != ExitUsage || !strings.Contains(errb, "two-factor code") {
		t.Fatalf("exit %d, stderr %q", code, errb)
	}
	if f.mfaBody != nil || f.tokens != 0 {
		t.Fatalf("sent %v, minted %d", f.mfaBody, f.tokens)
	}
}
