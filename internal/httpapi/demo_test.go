package httpapi

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/demo"
	"github.com/pixari/opentodo/internal/store"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// newDemoEnv is newEnv on a demo instance, signed in as the demo account.
func newDemoEnv(t *testing.T) *env {
	t.Helper()
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	cfg := config.Config{SessionTTL: time.Hour, Demo: true}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	syncSvc := opsync.NewService(db)
	authSvc := auth.NewService(db, cfg.SessionTTL, false)
	d := demo.New(authSvc, syncSvc, log)
	if err := d.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	h := New(cfg, authSvc, syncSvc, nil, log, "test", WithDemo(d))
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	t.Cleanup(syncSvc.Notifier().CloseAll)
	jar, _ := cookiejar.New(nil)
	e := &env{t: t, srv: srv, client: &http.Client{Jar: jar}, db: db, handler: h, sync: syncSvc}
	resp, out := e.do("POST", "/api/v1/auth/login", map[string]string{"email": demo.Email, "password": demo.Password})
	e.mustStatus(resp, http.StatusOK, out)
	return e
}

func TestDemoStatusShowsCredentials(t *testing.T) {
	e := newDemoEnv(t)
	resp, out := e.do("GET", "/api/v1/auth/status", nil)
	e.mustStatus(resp, http.StatusOK, out)
	d, _ := out["demo"].(map[string]any)
	if d["email"] != demo.Email || d["password"] != demo.Password || d["resetsAt"] == nil {
		t.Fatalf("demo = %v", out["demo"])
	}
	if out["signupAllowed"] != false {
		t.Fatalf("signupAllowed = %v", out["signupAllowed"])
	}
	if u, _ := out["user"].(map[string]any); u["role"] != "member" {
		t.Fatalf("demo user role = %v", u["role"])
	}
}

func TestDemoRestrictedRoutes(t *testing.T) {
	e := newDemoEnv(t)
	resp, out := e.do("GET", "/api/v1/projects", nil)
	e.mustStatus(resp, http.StatusOK, out)
	var shared string
	for _, p := range out["projects"].([]any) {
		if pm := p.(map[string]any); pm["name"] == "Home renovation" {
			shared, _ = pm["id"].(string)
		}
	}
	if shared == "" {
		t.Fatal("seeded shared project missing")
	}
	cases := []struct{ method, path string }{
		{"POST", "/api/v1/auth/register"},
		{"POST", "/api/v1/invitations"},
		{"POST", "/api/v1/users/x/transfer-ownership"},
		{"DELETE", "/api/v1/users/x"},
		{"POST", "/api/v1/me/password"},
		{"POST", "/api/v1/tokens"},
		{"POST", "/api/v1/app-passwords"},
		{"PUT", "/api/v1/settings/caldav"},
		{"PUT", "/api/v1/settings/oidc"},
		{"PUT", "/api/v1/settings/mcp"},
		{"GET", "/mcp"},
		{"POST", "/mcp"},
		{"PROPFIND", "/dav/"},
		{"GET", "/.well-known/caldav"},
		{"POST", "/api/v1/backups/run"},
		{"PUT", "/api/v1/backups/settings"},
		{"POST", "/api/v1/webhooks"},
		{"PATCH", "/api/v1/email-inbox"},
		{"POST", "/api/v1/import"},
		{"POST", "/api/v1/import/preview"},
		{"PUT", "/api/v1/encryption/keys"},
		{"POST", "/api/v1/mfa/totp/enroll"},
		{"POST", "/api/v1/passkeys/register/options"},
		{"POST", "/api/v1/push/subscriptions"},
		{"GET", "/api/v1/auth/oidc/start"},
		{"POST", "/api/v1/projects/" + shared + "/members"},
		{"DELETE", "/api/v1/projects/" + shared + "/members/someone"},
		{"POST", "/api/v1/projects/" + shared + "/transfer"},
	}
	for _, c := range cases {
		resp, out := e.do(c.method, c.path, map[string]any{})
		code := ""
		if er, ok := out["error"].(map[string]any); ok {
			code, _ = er["code"].(string)
		}
		if resp.StatusCode != http.StatusForbidden || code != "demo_restricted" {
			t.Errorf("%s %s: %d %v", c.method, c.path, resp.StatusCode, out)
		}
	}

	// Everyday use still works: create, edit and delete a task, list members, sync.
	resp, out = e.do("POST", "/api/v1/tasks", map[string]any{"title": "Try OpenTodo"})
	e.mustStatus(resp, http.StatusCreated, out)
	id, _ := out["id"].(string)
	resp, out = e.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"priority": 1})
	e.mustStatus(resp, http.StatusOK, out)
	resp, out = e.do("DELETE", "/api/v1/tasks/"+id, nil)
	e.mustStatus(resp, http.StatusNoContent, out)
	resp, out = e.do("GET", "/api/v1/projects/"+shared+"/members", nil)
	e.mustStatus(resp, http.StatusOK, out)
	resp, out = e.do("POST", "/api/v1/sync", map[string]any{"device": "d1", "cursor": 0, "ops": []any{}})
	e.mustStatus(resp, http.StatusOK, out)
	resp, out = e.do("GET", "/api/v1/export", nil)
	e.mustStatus(resp, http.StatusOK, out)
}

func TestDemoGuardOffByDefault(t *testing.T) {
	// Without demo mode the same routes reach their handlers (never demo_restricted).
	e := newEnv(t, false)
	resp, out := e.do("GET", "/api/v1/auth/status", nil)
	e.mustStatus(resp, http.StatusOK, out)
	if _, ok := out["demo"]; ok {
		t.Fatal("demo field present without demo mode")
	}
	resp, out = e.do("POST", "/api/v1/auth/register", map[string]string{"email": "o@example.com", "name": "O", "password": "correct horse battery"})
	e.mustStatus(resp, http.StatusCreated, out)
	resp, out = e.do("POST", "/api/v1/tokens", map[string]string{"name": "cli"})
	e.mustStatus(resp, http.StatusCreated, out)
	if demoRestricted("POST", "/api/v1/tasks") != "" || demoRestricted("GET", "/api/v1/settings/caldav") != "" ||
		demoRestricted("GET", "/api/v1/invitations/abc") != "" || demoRestricted("GET", "/api/v1/projects/p/members") != "" {
		t.Fatal("rule list refuses everyday routes")
	}
}
