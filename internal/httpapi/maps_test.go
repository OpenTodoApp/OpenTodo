package httpapi

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/maps"
	"github.com/pixari/opentodo/internal/settings"
)

// fakeMapProvider is a stand-in for OpenFreeMap and Photon (no real network).
type fakeMapProvider struct {
	srv     *httptest.Server
	hits    atomic.Int64
	leaked  atomic.Bool
	timeout atomic.Bool
}

func newFakeMapProvider(t *testing.T) *fakeMapProvider {
	f := &fakeMapProvider{}
	f.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.hits.Add(1)
		if r.Header.Get("Cookie") != "" || r.Header.Get("Authorization") != "" || r.Header.Get("X-Forwarded-For") != "" {
			f.leaked.Store(true)
		}
		if f.timeout.Load() {
			time.Sleep(300 * time.Millisecond)
		}
		base := "http://" + r.Host
		switch {
		case r.URL.Path == "/style":
			_, _ = w.Write([]byte(`{"version":8,"sources":{"omt":{"type":"vector","tiles":["` + base + `/t/{z}/{x}/{y}.pbf"],"attribution":"OpenStreetMap"}},"layers":[]}`))
		case strings.HasPrefix(r.URL.Path, "/t/"):
			_, _ = w.Write([]byte("tile"))
		case r.URL.Path == "/api":
			_, _ = w.Write([]byte(`{"features":[{"geometry":{"coordinates":[9.19,45.46]},"properties":{"name":"Duomo","city":"Milano"}}]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(f.srv.Close)
	return f
}

// mapsEnv is a server whose map proxy talks to the fake provider.
func mapsEnv(t *testing.T, f *fakeMapProvider, env config.MapsConfig, timeout time.Duration) *env {
	t.Helper()
	env.TilesURL, env.GeocoderURL = f.srv.URL+"/style", f.srv.URL
	var svc *maps.Service
	e := newEnvWith(t, true, func(s *Server) {
		svc = maps.New(settings.New(s.sync.DB()), env, false, &http.Client{Timeout: timeout},
			maps.NewCache(filepath.Join(t.TempDir(), "cache", "maps"), 0), "test")
		s.maps = svc
	})
	return e
}

// task-locations "Map proxy": every scenario.
func TestMapProxyRoutes(t *testing.T) {
	f := newFakeMapProvider(t)
	e := mapsEnv(t, f, config.MapsConfig{}, 2*time.Second)

	// Signed-out request: 401 and nothing fetched.
	resp, out := e.do("GET", "/api/v1/maps/tiles/1/0/0.pbf", nil)
	e.mustStatus(resp, 401, out)
	if f.hits.Load() != 0 {
		t.Fatal("a signed-out request reached the provider")
	}

	e.register("owner@example.com")
	resp, out = e.do("GET", "/api/v1/me", nil)
	e.mustStatus(resp, 200, out)
	if out["maps"] != true {
		t.Fatalf("me.maps = %v", out["maps"])
	}
	resp, out = e.do("GET", "/api/v1/maps/style", nil)
	e.mustStatus(resp, 200, out)
	if src := out["sources"].(map[string]any)["omt"].(map[string]any); src["tiles"].([]any)[0] != maps.TilesPath {
		t.Fatalf("style = %v", out)
	}
	resp, _ = e.do("GET", "/api/v1/maps/tiles/1/0/0.pbf", nil)
	if resp.StatusCode != 200 || resp.Header.Get("Content-Type") != "application/x-protobuf" {
		t.Fatalf("tile status %d, type %q", resp.StatusCode, resp.Header.Get("Content-Type"))
	}
	resp, out = e.do("GET", "/api/v1/maps/search?q=Duomo&lang=it", nil)
	e.mustStatus(resp, 200, out)
	if res := out["results"].([]any); len(res) != 1 || res[0].(map[string]any)["name"] != "Duomo" {
		t.Fatalf("search = %v", out)
	}
	resp, out = e.do("GET", "/api/v1/maps/search?q=", nil)
	e.mustStatus(resp, 400, out)
	resp, out = e.do("GET", "/api/v1/maps/reverse?lat=x&lon=1", nil)
	e.mustStatus(resp, 400, out)
	if f.leaked.Load() {
		t.Fatal("a cookie, token or forwarded address reached the provider")
	}

	// Search rate limit: per user, other users unaffected.
	// Three searches were sent above (one empty, one bad reverse): they count too.
	for i := 3; i < mapSearchesPerMinute; i++ {
		resp, out = e.do("GET", "/api/v1/maps/search?q=Duomo", nil)
		e.mustStatus(resp, 200, out)
	}
	resp, out = e.do("GET", "/api/v1/maps/search?q=Duomo", nil)
	e.mustStatus(resp, 429, out)
	if code(out) != "rate_limited" {
		t.Fatalf("code = %v", out)
	}
	other, _ := e.joinAs("other@example.com")
	resp, out = other.do("GET", "/api/v1/maps/search?q=Duomo", nil)
	other.mustStatus(resp, 200, out)
	// Members cannot change the switch.
	resp, out = other.do("PUT", "/api/v1/settings/maps", map[string]any{"enabled": false})
	other.mustStatus(resp, 403, out)

	// Maps turned off by the owner: 404 maps_disabled and nothing leaves the server.
	resp, out = e.do("PUT", "/api/v1/settings/maps", map[string]any{"enabled": false})
	e.mustStatus(resp, 200, out)
	hits := f.hits.Load()
	for _, p := range []string{"/api/v1/maps/style", "/api/v1/maps/search?q=x", "/api/v1/maps/tiles/2/1/1.pbf"} {
		resp, out = e.do("GET", p, nil)
		e.mustStatus(resp, 404, out)
		if code(out) != "maps_disabled" {
			t.Fatalf("%s: %v", p, out)
		}
	}
	if f.hits.Load() != hits {
		t.Fatal("a request left the server with maps off")
	}
	resp, out = e.do("GET", "/api/v1/me", nil)
	e.mustStatus(resp, 200, out)
	if out["maps"] != false {
		t.Fatalf("me.maps with maps off = %v", out["maps"])
	}
	resp, out = e.do("PUT", "/api/v1/settings/maps", map[string]any{"enabled": true, "tiles_url": "ftp://x"})
	e.mustStatus(resp, 400, out)
}

// "Provider unreachable": 502 maps_unavailable for anything not in the cache.
func TestMapProxyProviderUnreachable(t *testing.T) {
	f := newFakeMapProvider(t)
	e := mapsEnv(t, f, config.MapsConfig{}, 100*time.Millisecond)
	e.register("owner@example.com")
	f.timeout.Store(true)
	resp, out := e.do("GET", "/api/v1/maps/style", nil)
	e.mustStatus(resp, 502, out)
	if code(out) != "maps_unavailable" {
		t.Fatalf("code = %v", out)
	}
}

// "Map switches": a variable locks the switch, shown read-only in Settings.
func TestMapsSettingLockedByVariable(t *testing.T) {
	f := newFakeMapProvider(t)
	off := false
	e := mapsEnv(t, f, config.MapsConfig{Enabled: &off}, time.Second)
	e.register("owner@example.com")
	resp, out := e.do("GET", "/api/v1/settings/maps", nil)
	e.mustStatus(resp, 200, out)
	if out["enabled"] != false || !strings.Contains(strings.Join(toStrings(out["locked"]), ","), "enabled") {
		t.Fatalf("setting = %v", out)
	}
}

func TestPermissionsPolicyAllowsGeolocationForSelf(t *testing.T) {
	e := newEnv(t, true)
	resp, _ := e.do("GET", "/healthz", nil)
	if got := resp.Header.Get("Permissions-Policy"); got != "camera=(), geolocation=(self)" {
		t.Fatalf("Permissions-Policy = %q", got)
	}
}

// The export carries places (task-locations "Places", "Export round trip").
func TestExportIncludesPlaces(t *testing.T) {
	e := newEnv(t, true)
	e.register("owner@example.com")
	resp, out := e.do("POST", "/api/v1/sync", map[string]any{"device": "d1", "ops": []map[string]any{
		{"id": "o1", "entity": "place", "entityId": "pl1", "field": "name", "value": "Office", "ts": 100, "device": "d1"},
		{"id": "o2", "entity": "task", "entityId": "t1", "field": "location", "value": map[string]any{"name": "Office", "place_id": "pl1"}, "ts": 100, "device": "d1"},
	}})
	e.mustStatus(resp, 200, out)
	resp, out = e.do("GET", "/api/v1/export", nil)
	e.mustStatus(resp, 200, out)
	places, _ := out["places"].([]any)
	if len(places) != 1 {
		t.Fatalf("export places = %v", out["places"])
	}
}

func code(out map[string]any) string {
	errObj, _ := out["error"].(map[string]any)
	c, _ := errObj["code"].(string)
	return c
}

func toStrings(v any) []string {
	var out []string
	list, _ := v.([]any)
	for _, x := range list {
		s, _ := x.(string)
		out = append(out, s)
	}
	return out
}
