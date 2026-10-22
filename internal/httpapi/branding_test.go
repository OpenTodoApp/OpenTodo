package httpapi

import (
	"bytes"
	"image"
	"image/png"
	"io"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/auth"
	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/store"
	opsync "github.com/pixari/opentodo/internal/sync"
)

// fakeWeb stands in for the built web app: the page and the manifest as Vite writes them.
var fakeWeb = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
	switch r.URL.Path {
	case "/manifest.webmanifest":
		w.Header().Set("Content-Type", "application/manifest+json")
		w.Write([]byte(`{"name":"OpenTodo","short_name":"OpenTodo","start_url":"/","icons":[{"src":"/pwa-192.png","sizes":"192x192","type":"image/png"}]}`))
	case "/sw.js":
		w.Header().Set("Content-Type", "text/javascript")
		w.Write([]byte("// OpenTodo worker"))
	default:
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write([]byte(`<!doctype html><html><head><meta name="description" content="OpenTodo: your tasks, your server." /><link rel="icon" href="/favicon.svg" type="image/svg+xml" /><link rel="apple-touch-icon" href="/apple-touch-icon.png" /><title>OpenTodo</title></head><body></body></html>`))
	}
})

// brandingEnv is an env with a data directory and the fake web app mounted.
func brandingEnv(t *testing.T) *env {
	t.Helper()
	dir := t.TempDir()
	db, err := store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	cfg := config.Config{SessionTTL: time.Hour, DataDir: dir}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	syncSvc := opsync.NewService(db)
	h := New(cfg, auth.NewService(db, cfg.SessionTTL, false), syncSvc, fakeWeb, log, "test")
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	t.Cleanup(syncSvc.Notifier().CloseAll)
	jar, _ := cookiejar.New(nil)
	e := &env{t: t, srv: srv, client: &http.Client{Jar: jar}, db: db, handler: h, sync: syncSvc}
	resp, out := e.do("POST", "/api/v1/auth/register", map[string]string{"email": "owner@example.com", "name": "Owner", "password": "correct horse battery"})
	e.mustStatus(resp, 201, out)
	return e
}

func logoPNG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, image.White)
		}
	}
	var b bytes.Buffer
	if err := png.Encode(&b, img); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

func TestBranding(t *testing.T) {
	e := brandingEnv(t)
	// Unbranded: the page and the manifest pass through unchanged, status says so.
	resp, body := e.raw("GET", "/", nil)
	if resp.StatusCode != 200 || !strings.Contains(string(body), "<title>OpenTodo</title>") || !strings.Contains(string(body), "favicon.svg") {
		t.Fatalf("plain page: %d %s", resp.StatusCode, body)
	}
	resp, out := e.do("GET", "/api/v1/auth/status", nil)
	e.mustStatus(resp, 200, out)
	if b := out["branding"].(map[string]any); b["name"] != "" || b["logoVersion"] != float64(0) {
		t.Fatalf("status branding %v", b)
	}
	if resp, _ = e.raw("GET", "/branding/logo-32.png", nil); resp.StatusCode != 404 {
		t.Fatalf("no logo: %d", resp.StatusCode)
	}

	// The name: validated, audited, in the page, the manifest and the status.
	resp, out = e.do("PUT", "/api/v1/settings/branding", map[string]any{"name": strings.Repeat("x", 41)})
	e.mustStatus(resp, 400, out)
	resp, out = e.do("PUT", "/api/v1/settings/branding", map[string]any{"name": "  Acme <Tasks>  "})
	e.mustStatus(resp, 200, out)
	if out["name"] != "Acme <Tasks>" {
		t.Fatalf("name %v", out)
	}
	resp, body = e.raw("GET", "/inbox", nil)
	if resp.StatusCode != 200 || !strings.Contains(string(body), "<title>Acme &lt;Tasks&gt;</title>") || !strings.Contains(string(body), "favicon.svg") {
		t.Fatalf("named page: %d %s", resp.StatusCode, body)
	}
	resp, body = e.raw("GET", "/manifest.webmanifest", nil)
	if resp.StatusCode != 200 || !strings.Contains(string(body), `"short_name":"Acme <Tasks>"`) || !strings.Contains(string(body), "pwa-192") || resp.Header.Get("Content-Type") != "application/manifest+json" {
		t.Fatalf("named manifest: %d %s %v", resp.StatusCode, body, resp.Header)
	}
	// Assets are never touched.
	if _, body = e.raw("GET", "/sw.js", nil); !strings.Contains(string(body), "OpenTodo worker") {
		t.Fatalf("asset rewritten: %s", body)
	}

	// The logo: refused when small or not an image; rendered into every size.
	if resp, raw := e.putBytes("PUT", "/api/v1/settings/branding/logo", logoPNG(t, 100, 100)); resp.StatusCode != 400 || !strings.Contains(string(raw), "192") {
		t.Fatalf("small logo: %d %s", resp.StatusCode, raw)
	}
	if resp, raw := e.putBytes("PUT", "/api/v1/settings/branding/logo", []byte("not an image")); resp.StatusCode != 400 {
		t.Fatalf("not an image: %d %s", resp.StatusCode, raw)
	}
	resp, raw := e.putBytes("PUT", "/api/v1/settings/branding/logo", logoPNG(t, 600, 400))
	if resp.StatusCode != 200 || !strings.Contains(string(raw), `"logoVersion":1`) {
		t.Fatalf("logo: %d %s", resp.StatusCode, raw)
	}
	for name, side := range map[string]int{"logo-32.png": 32, "logo-180.png": 180, "logo-192.png": 192, "logo-512.png": 512, "logo-maskable-512.png": 512} {
		resp, body = e.raw("GET", "/branding/"+name+"?v=1", nil)
		if resp.StatusCode != 200 || resp.Header.Get("Content-Type") != "image/png" || !strings.Contains(resp.Header.Get("Cache-Control"), "immutable") {
			t.Fatalf("%s: %d %v", name, resp.StatusCode, resp.Header)
		}
		cfg, err := png.DecodeConfig(bytes.NewReader(body))
		if err != nil || cfg.Width != side || cfg.Height != side {
			t.Fatalf("%s: %dx%d %v", name, cfg.Width, cfg.Height, err)
		}
	}
	if resp, _ = e.raw("GET", "/branding/logo-32.png?v=9", nil); resp.Header.Get("Cache-Control") != "no-cache" {
		t.Fatalf("stale version cached: %v", resp.Header)
	}
	if resp, _ = e.raw("GET", "/branding/other.png", nil); resp.StatusCode != 404 {
		t.Fatalf("unknown file: %d", resp.StatusCode)
	}
	_, body = e.raw("GET", "/", nil)
	if !strings.Contains(string(body), `<link rel="icon" href="/branding/logo-32.png?v=1" type="image/png">`) || !strings.Contains(string(body), `/branding/logo-180.png?v=1`) || strings.Contains(string(body), "favicon.svg") {
		t.Fatalf("branded page: %s", body)
	}
	_, body = e.raw("GET", "/manifest.webmanifest", nil)
	if !strings.Contains(string(body), `/branding/logo-512.png?v=1`) || strings.Contains(string(body), "pwa-192") {
		t.Fatalf("branded manifest: %s", body)
	}
	resp, out = e.do("GET", "/api/v1/auth/status", nil)
	e.mustStatus(resp, 200, out)
	if b := out["branding"].(map[string]any); b["name"] != "Acme <Tasks>" || b["logoVersion"] != float64(1) {
		t.Fatalf("status branding %v", b)
	}
	// Removing the logo brings the app's icons back; the name stays.
	resp, out = e.do("DELETE", "/api/v1/settings/branding/logo", nil)
	e.mustStatus(resp, 200, out)
	if out["logoVersion"] != float64(0) || out["name"] != "Acme <Tasks>" {
		t.Fatalf("after remove %v", out)
	}
	if resp, _ = e.raw("GET", "/branding/logo-32.png?v=1", nil); resp.StatusCode != 404 {
		t.Fatalf("removed logo served: %d", resp.StatusCode)
	}
	if _, body = e.raw("GET", "/", nil); !strings.Contains(string(body), "favicon.svg") {
		t.Fatalf("icons not restored: %s", body)
	}
	// A new logo gets a new version, so cached addresses never go stale.
	if resp, raw := e.putBytes("PUT", "/api/v1/settings/branding/logo", logoPNG(t, 256, 256)); resp.StatusCode != 200 || !strings.Contains(string(raw), `"logoVersion":2`) {
		t.Fatalf("second logo: %d %s", resp.StatusCode, raw)
	}
	// Audited without the name's content beyond the setting itself.
	var n int
	if err := e.db.QueryRow(`SELECT COUNT(*) FROM audit_events WHERE name = 'settings.changed'`).Scan(&n); err != nil || n < 3 {
		t.Fatalf("audit %d %v", n, err)
	}

	// Members and anonymous callers cannot change it; everyone sees the logo.
	member := newClientFor(e)
	if resp, _ := member.do("PUT", "/api/v1/settings/branding", map[string]any{"name": "x"}); resp.StatusCode != 401 {
		t.Fatalf("anonymous put: %d", resp.StatusCode)
	}
	if resp, _ := member.raw("GET", "/branding/logo-192.png?v=2", nil); resp.StatusCode != 200 {
		t.Fatalf("anonymous logo: %d", resp.StatusCode)
	}
	if resp, _ := member.do("GET", "/api/v1/settings/branding", nil); resp.StatusCode != 401 {
		t.Fatalf("anonymous settings: %d", resp.StatusCode)
	}
}
