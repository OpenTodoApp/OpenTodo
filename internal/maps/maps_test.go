package maps

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/settings"
	"github.com/pixari/opentodo/internal/store"
)

// fakeProvider stands in for OpenFreeMap and Photon: a style pointing to a
// TileJSON, tiles, glyphs, a sprite, and Photon's search and reverse routes.
type fakeProvider struct {
	srv      *httptest.Server
	hits     atomic.Int64
	down     atomic.Bool
	lastUA   atomic.Value
	sawCreds atomic.Bool
}

func newFake(t *testing.T) *fakeProvider {
	f := &fakeProvider{}
	f.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.hits.Add(1)
		f.lastUA.Store(r.UserAgent())
		if r.Header.Get("Cookie") != "" || r.Header.Get("Authorization") != "" || r.Header.Get("X-Forwarded-For") != "" {
			f.sawCreds.Store(true)
		}
		if f.down.Load() {
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		base := "http://" + r.Host
		switch {
		case r.URL.Path == "/styles/liberty":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"version":8,"sources":{"openmaptiles":{"type":"vector","url":"` + base + `/planet"},"hillshade":{"type":"raster","url":"https://elsewhere.example/hs"}},
				"glyphs":"` + base + `/fonts/{fontstack}/{range}.pbf","sprite":"` + base + `/sprites/ofm",
				"layers":[{"id":"bg","type":"background"},{"id":"water","type":"fill","source":"openmaptiles"},{"id":"hs","type":"raster","source":"hillshade"}]}`))
		case r.URL.Path == "/planet":
			_, _ = w.Write([]byte(`{"tiles":["` + base + `/planet/v1/{z}/{x}/{y}.pbf"],"minzoom":0,"maxzoom":14,"attribution":"OpenStreetMap"}`))
		case strings.HasPrefix(r.URL.Path, "/planet/v1/"):
			w.Header().Set("Content-Type", "application/x-protobuf")
			w.Header().Set("Cache-Control", "max-age=60")
			_, _ = w.Write([]byte("tile:" + r.URL.Path))
		case strings.HasPrefix(r.URL.Path, "/fonts/"):
			_, _ = w.Write([]byte("glyphs:" + r.URL.EscapedPath()))
		case strings.HasPrefix(r.URL.Path, "/sprites/"):
			_, _ = w.Write([]byte("sprite:" + r.URL.Path))
		case (r.URL.Path == "/api" || r.URL.Path == "/reverse") && !map[string]bool{"": true, "default": true, "en": true, "de": true, "fr": true}[r.URL.Query().Get("lang")]:
			// Like the public Photon instance: any other language is refused.
			http.Error(w, "language not supported", http.StatusBadRequest)
		case r.URL.Path == "/api":
			_, _ = w.Write([]byte(`{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":[9.1916,45.4641]},
				"properties":{"name":"Piazza del Duomo","street":"Piazza del Duomo","postcode":"20122","city":"Milano","country":"Italia","q":"` + r.URL.Query().Get("q") + `","lang":"` + r.URL.Query().Get("lang") + `"}}]}`))
		case r.URL.Path == "/reverse":
			_, _ = w.Write([]byte(`{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":[7.68,45.07]},"properties":{"street":"Via Roma","housenumber":"1","city":"Torino","country":"Italia"}}]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(f.srv.Close)
	return f
}

func newService(t *testing.T, f *fakeProvider, env config.MapsConfig, demo bool, cacheMax int64) *Service {
	t.Helper()
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if env.TilesURL == "" {
		env.TilesURL = f.srv.URL + "/styles/liberty"
	}
	if env.GeocoderURL == "" {
		env.GeocoderURL = f.srv.URL
	}
	return New(settings.New(db), env, demo, &http.Client{Timeout: 2 * time.Second}, NewCache(filepath.Join(t.TempDir(), "cache", "maps"), cacheMax), "test")
}

func TestStyleIsRewrittenToTheServer(t *testing.T) {
	f := newFake(t)
	s := newService(t, f, config.MapsConfig{}, false, 0)
	raw, err := s.Style(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), f.srv.URL) || strings.Contains(string(raw), "elsewhere.example") {
		t.Fatalf("style still names a provider address: %s", raw)
	}
	var style struct {
		Sources map[string]map[string]any `json:"sources"`
		Glyphs  string                    `json:"glyphs"`
		Sprite  string                    `json:"sprite"`
		Layers  []map[string]any          `json:"layers"`
	}
	if err := json.Unmarshal(raw, &style); err != nil {
		t.Fatal(err)
	}
	src := style.Sources["openmaptiles"]
	if src["tiles"].([]any)[0] != TilesPath || src["attribution"] != "OpenStreetMap" || style.Glyphs != GlyphsPath || style.Sprite != SpritesPath {
		t.Fatalf("style = %s", raw)
	}
	if _, ok := style.Sources["hillshade"]; ok || len(style.Layers) != 2 {
		t.Fatalf("the remote raster source and its layer must be left out: %s", raw)
	}
	tile, ct, err := s.Tile(context.Background(), 3, 4, 2)
	if err != nil || string(tile) != "tile:/planet/v1/3/4/2.pbf" || ct != "application/x-protobuf" {
		t.Fatalf("tile = %q %q %v", tile, ct, err)
	}
	g, _, err := s.Glyphs(context.Background(), "Noto Sans Regular", "0-255")
	if err != nil || string(g) != "glyphs:/fonts/Noto%20Sans%20Regular/0-255.pbf" {
		t.Fatalf("glyphs = %q %v", g, err)
	}
	sp, _, err := s.Sprite(context.Background(), "sprite@2x.png")
	if err != nil || string(sp) != "sprite:/sprites/ofm@2x.png" {
		t.Fatalf("sprite = %q %v", sp, err)
	}
	if ua, _ := f.lastUA.Load().(string); !strings.HasPrefix(ua, "OpenTodo/test (+https://open-todo.app)") {
		t.Fatalf("user agent = %q", ua)
	}
	if f.sawCreds.Load() {
		t.Fatal("a cookie, token or forwarded address reached the provider")
	}
}

func TestBadTileCoordinatesAndFiles(t *testing.T) {
	f := newFake(t)
	s := newService(t, f, config.MapsConfig{}, false, 0)
	for _, c := range [][3]int{{-1, 0, 0}, {23, 0, 0}, {2, 4, 0}, {2, 0, 4}} {
		if _, _, err := s.Tile(context.Background(), c[0], c[1], c[2]); !errors.Is(err, ErrNotFound) {
			t.Fatalf("tile %v: %v", c, err)
		}
	}
	if _, _, err := s.Sprite(context.Background(), "../etc/passwd"); !errors.Is(err, ErrNotFound) {
		t.Fatal(err)
	}
	if _, _, err := s.Glyphs(context.Background(), "../x", "0-255"); !errors.Is(err, ErrNotFound) {
		t.Fatal(err)
	}
}

// "Map proxy", scenario "Provider unreachable": a cached tile is still served,
// an uncached one answers maps_unavailable.
func TestCacheServesWhileProviderIsDown(t *testing.T) {
	f := newFake(t)
	s := newService(t, f, config.MapsConfig{}, false, 0)
	ctx := context.Background()
	if _, _, err := s.Tile(ctx, 1, 0, 0); err != nil {
		t.Fatal(err)
	}
	before := f.hits.Load()
	if _, _, err := s.Tile(ctx, 1, 0, 0); err != nil || f.hits.Load() != before {
		t.Fatalf("a fresh cached tile went upstream (%v)", err)
	}
	f.down.Store(true)
	s.cache.now = func() time.Time { return time.Now().Add(time.Hour) } // now stale
	if tile, _, err := s.Tile(ctx, 1, 0, 0); err != nil || string(tile) != "tile:/planet/v1/1/0/0.pbf" {
		t.Fatalf("stale tile = %q %v", tile, err)
	}
	if _, _, err := s.Tile(ctx, 1, 1, 1); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("uncached tile while down: %v", err)
	}
}

func TestCacheEvictsAtTheCap(t *testing.T) {
	c := NewCache(t.TempDir(), 1000)
	body := []byte(strings.Repeat("x", 300))
	start := time.Now()
	for i := 0; i < 6; i++ {
		c.now = func() time.Time { return start.Add(time.Duration(i) * time.Second) }
		if err := c.Put("u"+string(rune('a'+i)), "x", body, time.Hour); err != nil {
			t.Fatal(err)
		}
	}
	if size := c.Size(); size > 1000 {
		t.Fatalf("cache holds %d bytes over its 1000-byte cap", size)
	}
	if _, ok := c.Get("uf"); !ok {
		t.Fatal("the newest entry was evicted")
	}
	if _, ok := c.Get("ua"); ok {
		t.Fatal("the oldest entry survived")
	}
}

func TestSwitchesAndOverrides(t *testing.T) {
	f := newFake(t)
	ctx := context.Background()
	s := newService(t, f, config.MapsConfig{}, false, 0)
	e, err := s.Effective(ctx)
	if err != nil || !e.Enabled || len(e.Locked) != 2 {
		t.Fatalf("fresh server = %+v %v", e, err)
	}
	if err := s.Save(ctx, Settings{Enabled: false}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Style(ctx); !errors.Is(err, ErrDisabled) {
		t.Fatalf("style with maps off: %v", err)
	}
	hits := f.hits.Load()
	if _, err := s.Search(ctx, "Duomo", "it", 5); !errors.Is(err, ErrDisabled) || f.hits.Load() != hits {
		t.Fatalf("search with maps off: %v, upstream hits %d", err, f.hits.Load()-hits)
	}
	// A demo defaults to off; OPENTODO_MAPS=on turns it on and locks the switch.
	demo := newService(t, f, config.MapsConfig{}, true, 0)
	if e, _ := demo.Effective(ctx); e.Enabled {
		t.Fatal("demo maps on by default")
	}
	on := true
	forced := newService(t, f, config.MapsConfig{Enabled: &on}, true, 0)
	if e, _ := forced.Effective(ctx); !e.Enabled || e.Locked[0] != "enabled" {
		t.Fatalf("forced = %+v", e)
	}
	if err := s.Save(ctx, Settings{Enabled: true, TilesURL: "ftp://x"}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("bad provider saved: %v", err)
	}
}

func TestSearchAndReverse(t *testing.T) {
	f := newFake(t)
	s := newService(t, f, config.MapsConfig{}, false, 0)
	ctx := context.Background()
	res, err := s.Search(ctx, "Piazza del Duomo Milano", "it", 5)
	if err != nil || len(res) != 1 {
		t.Fatalf("search = %+v %v", res, err)
	}
	if r := res[0]; r.Name != "Piazza del Duomo" || r.Address != "Piazza del Duomo, 20122 Milano, Italia" || r.Lat != 45.4641 || r.Lon != 9.1916 {
		t.Fatalf("result = %+v", r)
	}
	if _, err := s.Search(ctx, "  ", "it", 5); !errors.Is(err, ErrInvalid) {
		t.Fatalf("empty search: %v", err)
	}
	r, err := s.Reverse(ctx, 45.07, 7.68, "pt")
	if err != nil || r == nil || r.Address != "Via Roma 1, Torino, Italia" || r.Name != "Via Roma 1" {
		t.Fatalf("reverse = %+v %v", r, err)
	}
	if _, err := s.Reverse(ctx, 91, 0, "en"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("reverse out of range: %v", err)
	}
	f.down.Store(true)
	if _, err := s.Search(ctx, "Torino", "en", 5); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("search while down: %v", err)
	}
}
