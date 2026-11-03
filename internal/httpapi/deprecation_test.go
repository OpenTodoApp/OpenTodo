package httpapi

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"
)

// A deprecated route keeps its answer and carries the Deprecation (RFC 9745)
// and Sunset (RFC 8594) headers (OpenSpec change `stability-contract`, D3).
func TestDeprecatedRouteHeaders(t *testing.T) {
	since := time.Date(2027, 3, 1, 0, 0, 0, 0, time.UTC)
	sunset := since.AddDate(1, 0, 1)
	rt := &routes{mux: http.NewServeMux()}
	answer := func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	}
	rt.handle("GET /api/v1/test/old", public("test route").Deprecated(since, sunset, "/api/v1/test/new"), answer)
	rt.handle("GET /api/v1/test/new", public("test route"), answer)

	get := func(path string) (*http.Response, string) {
		rec := httptest.NewRecorder()
		rt.mux.ServeHTTP(rec, httptest.NewRequest("GET", path, nil))
		body, _ := io.ReadAll(rec.Result().Body)
		return rec.Result(), string(body)
	}
	oldResp, oldBody := get("/api/v1/test/old")
	newResp, newBody := get("/api/v1/test/new")
	if oldResp.StatusCode != 200 || oldBody != newBody {
		t.Fatalf("deprecated route answered %d %q, want the same as %q", oldResp.StatusCode, oldBody, newBody)
	}
	if got := oldResp.Header.Get("Deprecation"); got != "@"+strconv.FormatInt(since.Unix(), 10) {
		t.Errorf("Deprecation = %q", got)
	}
	if got := oldResp.Header.Get("Sunset"); got != sunset.Format(http.TimeFormat) {
		t.Errorf("Sunset = %q", got)
	}
	if got := oldResp.Header.Get("Link"); got != `</api/v1/test/new>; rel="successor-version"` {
		t.Errorf("Link = %q", got)
	}
	if newResp.Header.Get("Deprecation") != "" || newResp.Header.Get("Sunset") != "" {
		t.Error("a route that is not deprecated carries deprecation headers")
	}
	if policyName(rt.table[0].policy) != "public" || rt.table[0].policy.Deprecation == nil {
		t.Errorf("route table entry = %+v", rt.table[0])
	}
}

// A deprecation without a replacement or with a sunset sooner than 12 months
// is refused at registration.
func TestDeprecationWindowEnforced(t *testing.T) {
	since := time.Date(2027, 3, 1, 0, 0, 0, 0, time.UTC)
	for name, p := range map[string]routePolicy{
		"short window":   public("x").Deprecated(since, since.AddDate(0, 11, 0), "/api/v1/new"),
		"no replacement": public("x").Deprecated(since, since.AddDate(2, 0, 0), ""),
	} {
		t.Run(name, func(t *testing.T) {
			defer func() {
				if recover() == nil {
					t.Fatal("registration did not panic")
				}
			}()
			rt := &routes{mux: http.NewServeMux()}
			rt.handle("GET /api/v1/test/old", p, func(http.ResponseWriter, *http.Request) {})
		})
	}
}
