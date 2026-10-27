package httpapi

import (
	"strings"
	"testing"
)

// TestWrongMethodIs405 (api-method-not-allowed): a registered API path asked
// with another method answers 405 with an Allow header listing the methods the
// path serves, for core routes, the generic collections and route packages,
// signed in or not; the right method still goes through its policy.
func TestWrongMethodIs405(t *testing.T) {
	owner := ownerEnv(t)
	anon := newClientFor(owner)
	cases := []struct {
		method, path, allow string
	}{
		{"GET", "/api/v1/settings/assistant/test", "POST"},
		{"PUT", "/api/v1/import/jobs/j1/undo", "POST"},
		// The generic collection routes count only for a real collection.
		{"POST", "/api/v1/tasks/x1", "GET, HEAD, PATCH, DELETE"},
		{"POST", "/api/v1/import/jobs/j1", "GET, HEAD"},
		{"PUT", "/api/v1/tasks/x1", "GET, HEAD, PATCH, DELETE"},
		// Route packages (httpx.Router): speech and maps.
		{"GET", "/api/v1/settings/stt/test", "POST"},
		{"POST", "/api/v1/maps/tiles/1/2/3", "GET, HEAD"},
	}
	for _, c := range cases {
		for name, e := range map[string]*env{"owner": owner, "anonymous": anon} {
			resp, out := e.do(c.method, c.path, nil)
			if resp.StatusCode != 405 || resp.Header.Get("Allow") != c.allow {
				t.Fatalf("%s %s %s: %d allow=%q (%v)", name, c.method, c.path, resp.StatusCode, resp.Header.Get("Allow"), out)
			}
			e := out["error"].(map[string]any)
			want := c.method + " is not allowed on " + c.path + "; use " + c.allow
			if e["code"] != "method_not_allowed" || e["message"] != want {
				t.Fatalf("%s %s %s: %v", name, c.method, c.path, e)
			}
		}
	}

	// The right method is unaffected: the policy answers first.
	resp, out := anon.do("POST", "/api/v1/settings/assistant/test", map[string]any{"provider": "gemini"})
	anon.mustStatus(resp, 401, out)
	resp, out = owner.do("GET", "/api/v1/export", nil)
	owner.mustStatus(resp, 200, out)
}

// TestUnknownAPIRouteNamesTheRequest: a path no route serves is a 404 that
// names the method and path, never the query string, without control
// characters and cut when long.
func TestUnknownAPIRouteNamesTheRequest(t *testing.T) {
	e := ownerEnv(t)
	for _, c := range []struct{ method, path, want string }{
		{"POST", "/api/v1/settings/assistant/test/", "unknown API route: POST /api/v1/settings/assistant/test/"},
		{"GET", "/api/v2/tasks?token=ot_secret123", "unknown API route: GET /api/v2/tasks"},
		{"DELETE", "/api/nothing/here", "unknown API route: DELETE /api/nothing/here"},
		// Two segments match the generic collection patterns, but "nothing" is no collection.
		{"POST", "/api/v1/nothing/here", "unknown API route: POST /api/v1/nothing/here"},
		{"GET", "/api/x%0Ay", "unknown API route: GET /api/xy"},
	} {
		resp, out := e.do(c.method, c.path, nil)
		e.mustStatus(resp, 404, out)
		got := out["error"].(map[string]any)
		if got["code"] != "not_found" || got["message"] != c.want {
			t.Fatalf("%s %s: %v", c.method, c.path, got)
		}
		if resp.Header.Get("Allow") != "" {
			t.Fatalf("%s %s: a 404 has no Allow header", c.method, c.path)
		}
	}
	resp, out := e.do("GET", "/api/"+strings.Repeat("a", 500), nil)
	e.mustStatus(resp, 404, out)
	msg := out["error"].(map[string]any)["message"].(string)
	if len(msg) > 260 || !strings.HasSuffix(msg, "…") {
		t.Fatalf("long path not cut: %d bytes", len(msg))
	}
}
