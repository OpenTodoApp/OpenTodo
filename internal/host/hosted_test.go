package host

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/backup"
	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/tenant"
)

// TestOperatorSettingsStayWithTheHost (3.3): a tenant owner cannot reach the
// operator's settings, the app is told it is hosted, and the operator's
// values (here MCP on) apply to every tenant.
func TestOperatorSettingsStayWithTheHost(t *testing.T) {
	on := true
	f := newFixture(t, func(c *config.Config, _ *Options) { c.MCP = &on })
	c := f.client("alice")
	c.register("alice@example.com", f.create("alice", config.Limits{}))
	for _, rt := range []struct{ method, path string }{
		{"GET", "/api/v1/settings/smtp"}, {"PUT", "/api/v1/settings/smtp"}, {"POST", "/api/v1/settings/smtp/test"},
		{"GET", "/api/v1/settings/oidc"}, {"PUT", "/api/v1/settings/oidc"},
		{"GET", "/api/v1/backups"}, {"PUT", "/api/v1/backups/settings"}, {"POST", "/api/v1/backups/run"}, {"POST", "/api/v1/backups/restore/uploads"},
		{"PUT", "/api/v1/settings/mcp"}, {"PUT", "/api/v1/settings/assistant"},
		{"PUT", "/api/v1/settings/webhooks"}, {"PUT", "/api/v1/settings/attachments"},
	} {
		code, out := c.do(rt.method, rt.path, map[string]any{})
		if code != http.StatusForbidden || errCode(out) != "host_managed" {
			t.Fatalf("%s %s: %d %v", rt.method, rt.path, code, out)
		}
	}
	// Reading whether MCP is on stays possible, and shows the operator's value.
	code, out := c.do("GET", "/api/v1/settings/mcp", nil)
	if code != http.StatusOK || out["enabled"] != true {
		t.Fatalf("mcp: %d %v", code, out)
	}
	if _, st := c.do("GET", "/api/v1/auth/status", nil); st["hosted"] != true {
		t.Fatalf("auth/status: %v", st)
	}
}

// TestSingleTenantSettingsUnchanged (3.3): without a host the same routes are
// the owner's as before, and nothing hosted appears.
func TestSingleTenantSettingsUnchanged(t *testing.T) {
	tn, err := tenant.Open(context.Background(), config.Config{DataDir: t.TempDir(), SessionTTL: time.Hour, TrashRetentionDays: 30},
		tenant.Options{Web: http.NotFoundHandler()})
	if err != nil {
		t.Fatal(err)
	}
	defer tn.Close()
	srv := httptest.NewServer(tn.Handler)
	defer srv.Close()
	f := &fixture{t: t, srv: srv}
	c := f.client("x")
	c.host = strings.TrimPrefix(srv.URL, "http://")
	c.register("owner@example.com", "")
	for _, path := range []string{"/api/v1/settings/smtp", "/api/v1/settings/oidc", "/api/v1/backups", "/api/v1/settings/mcp"} {
		if code, out := c.do("GET", path, nil); code != http.StatusOK {
			t.Fatalf("GET %s: %d %v", path, code, out)
		}
	}
	if code, out := c.do("PUT", "/api/v1/settings/mcp", map[string]any{"enabled": true}); code != http.StatusOK {
		t.Fatalf("PUT mcp: %d %v", code, out)
	}
	if _, st := c.do("GET", "/api/v1/auth/status", nil); st["hosted"] != nil {
		t.Fatalf("auth/status: %v", st)
	}
	if code, _ := c.do("GET", "/api/v1/export/archive", nil); code != http.StatusNotFound {
		t.Fatalf("archive download on a self-hosted server: %d", code)
	}
}

// TestOwnerTakesDataAway (6.2): the owner downloads the tenant from the
// hosted service, restores it into a fresh self-hosted server, signs in and
// finds the data.
func TestOwnerTakesDataAway(t *testing.T) {
	f := newFixture(t, nil)
	c := f.client("leaver")
	c.register("leaver@example.com", f.create("leaver", config.Limits{}))
	c.sync("dev", taskOps("t1", "Moving out"))
	// Read and full tokens cannot download (the archive holds credentials);
	// an admin token and the owner's session can (route-authorization-policy).
	anon := f.client("leaver")
	for _, scope := range []string{"read", "full", "admin"} {
		code, tok := c.do("POST", "/api/v1/tokens", map[string]any{"name": scope, "scope": scope})
		if code != http.StatusCreated && code != http.StatusOK {
			t.Fatalf("%s token: %d %v", scope, code, tok)
		}
		req := anon.request("GET", "/api/v1/export/archive", nil)
		req.Header.Set("Authorization", "Bearer "+tok["secret"].(string))
		resp, err := anon.send(req)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if want := map[string]int{"read": 403, "full": 403, "admin": 200}[scope]; resp.StatusCode != want {
			t.Fatalf("%s token download: %d, want %d", scope, resp.StatusCode, want)
		}
	}
	resp, err := c.send(c.request("GET", "/api/v1/export/archive", nil))
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK || resp.Header.Get("Content-Type") != "application/gzip" ||
		!strings.Contains(resp.Header.Get("Content-Disposition"), "opentodo-") {
		t.Fatalf("download: %d %v", resp.StatusCode, resp.Header)
	}
	archivePath := filepath.Join(t.TempDir(), "leaver.tar.gz")
	out, _ := os.Create(archivePath)
	io.Copy(out, resp.Body)
	resp.Body.Close()
	out.Close()

	selfDir := t.TempDir()
	if _, err := backup.Restore(backup.RestoreOptions{DataDir: selfDir, Archive: archivePath}); err != nil {
		t.Fatal("restore:", err)
	}
	tn, err := tenant.Open(context.Background(), config.Config{DataDir: selfDir, SessionTTL: time.Hour, TrashRetentionDays: 30},
		tenant.Options{Web: http.NotFoundHandler()})
	if err != nil {
		t.Fatal(err)
	}
	defer tn.Close()
	srv := httptest.NewServer(tn.Handler)
	defer srv.Close()
	sf := &fixture{t: t, srv: srv}
	sc := sf.client("x")
	sc.host = strings.TrimPrefix(srv.URL, "http://")
	if code := sc.login("leaver@example.com"); code != http.StatusOK {
		t.Fatalf("sign-in on the self-hosted server: %d", code)
	}
	code, list := sc.do("GET", "/api/v1/tasks", nil)
	if code != http.StatusOK || !strings.Contains(toJSON(list), "Moving out") {
		t.Fatalf("tasks after the move: %d %v", code, list)
	}
}
