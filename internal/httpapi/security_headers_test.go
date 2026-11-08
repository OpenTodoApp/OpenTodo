package httpapi

import (
	"net/http"
	"strings"
	"testing"
)

// TestSecurityHeaders pins the headers every response carries and the page
// policy of the app's own pages (external-security-review, threat model "Web
// client"): no framing, no MIME sniffing, scripts only from the server itself.
// Other tests check single parts (connect-src, attachments' sandbox); this one
// fails if a page loses its framing or script protection.
func TestSecurityHeaders(t *testing.T) {
	e := newEnv(t, false)
	get := func(path string) http.Header {
		t.Helper()
		resp, err := http.Get(e.srv.URL + path)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		return resp.Header
	}
	for _, path := range []string{"/", "/healthz", "/api/v1/auth/status"} {
		h := get(path)
		if got := h.Get("X-Content-Type-Options"); got != "nosniff" {
			t.Errorf("%s: X-Content-Type-Options = %q", path, got)
		}
		if got := h.Get("X-Frame-Options"); got != "DENY" {
			t.Errorf("%s: X-Frame-Options = %q", path, got)
		}
		if got := h.Get("Referrer-Policy"); got != "same-origin" {
			t.Errorf("%s: Referrer-Policy = %q", path, got)
		}
	}
	// The app's files reach the browser as built (signed-web-app D7): proxies
	// that honour no-transform leave them alone. Only when the web app is built.
	for _, path := range []string{"/", "/index.html", "/sw.js", "/app-manifest.json"} {
		resp, err := http.Get(e.srv.URL + path)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode == http.StatusOK && !strings.Contains(resp.Header.Get("Cache-Control"), "no-transform") {
			t.Errorf("%s: Cache-Control %q lacks no-transform", path, resp.Header.Get("Cache-Control"))
		}
	}
	for _, path := range []string{"/", "/healthz"} {
		csp := map[string]string{}
		for _, d := range strings.Split(get(path).Get("Content-Security-Policy"), ";") {
			if f := strings.Fields(d); len(f) > 0 {
				csp[f[0]] = strings.Join(f[1:], " ")
			}
		}
		for dir, want := range map[string]string{
			"default-src":     "'self'",
			"script-src":      "'self'",
			"frame-ancestors": "'none'",
			"base-uri":        "'self'",
			"form-action":     "'self'",
		} {
			if csp[dir] != want {
				t.Errorf("%s: CSP %s = %q, want %q (policy %v)", path, dir, csp[dir], want, csp)
			}
		}
	}
}
