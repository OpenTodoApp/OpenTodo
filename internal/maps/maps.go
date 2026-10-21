// Package maps is the server's map proxy (OpenSpec change task-locations,
// design D3, D4, D6): it serves a map style, vector tiles, fonts and sprites
// from the configured tile provider and address search from a Photon-compatible
// geocoder, so a browser only ever talks to the OpenTodo server. Requests go
// out with an identifying User-Agent and nothing of the viewer's: no cookie, no
// token, no client address. Tiles, fonts and sprites are cached on disk.
package maps

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/settings"
)

// Defaults (design D3): OpenStreetMap data, OpenFreeMap vector tiles, Photon search.
const (
	DefaultTilesURL    = "https://tiles.openfreemap.org/styles/liberty"
	DefaultGeocoderURL = "https://photon.komoot.io"
	// SettingKey holds the owner's Settings in the settings table.
	SettingKey = "maps"
	// MaxBody bounds any upstream response the proxy reads.
	MaxBody = 8 << 20
)

// Errors the HTTP layer maps to responses.
var (
	ErrDisabled    = errors.New("maps_disabled")
	ErrUnavailable = errors.New("maps_unavailable")
	ErrNotFound    = errors.New("not_found")
)

// Settings is the owner's stored choice. Empty URLs mean the defaults.
type Settings struct {
	Enabled     bool   `json:"enabled"`
	TilesURL    string `json:"tiles_url"`
	GeocoderURL string `json:"geocoder_url"`
}

// Effective is what applies right now, with the fields an OPENTODO_MAPS*
// variable locks.
type Effective struct {
	Enabled     bool   `json:"enabled"`
	TilesURL    string `json:"tiles_url"`
	GeocoderURL string `json:"geocoder_url"`
	// Locked names the fields set by a variable: enabled, tiles_url, geocoder_url.
	Locked []string `json:"locked"`
	// Demo is true on a demo instance, where maps default to off.
	Demo bool `json:"demo"`
}

// Service is the proxy.
type Service struct {
	store  *settings.Store
	env    config.MapsConfig
	demo   bool
	client *http.Client
	ua     string
	cache  *Cache
	now    func() time.Time

	mu       sync.Mutex
	upstream upstream
	styleAt  time.Time
	style    []byte
	styleFor string
}

// upstream is what the provider's style points to, learnt when the style is fetched.
type upstream struct {
	tiles  string // tile URL template with {z}/{x}/{y}
	glyphs string // glyph URL template with {fontstack}/{range}
	sprite string // sprite base URL; the suffix (@2x).json|.png is appended
}

// New wires the proxy. client must time out and not follow redirects blindly.
func New(store *settings.Store, env config.MapsConfig, demo bool, client *http.Client, cache *Cache, version string) *Service {
	return &Service{store: store, env: env, demo: demo, client: client, cache: cache, now: time.Now,
		ua: "OpenTodo/" + version + " (+https://open-todo.app)"}
}

// Effective reads the owner's settings with the variable overrides applied.
func (s *Service) Effective(ctx context.Context) (Effective, error) {
	st := Settings{Enabled: !s.demo}
	if _, err := s.store.Get(ctx, SettingKey, &st); err != nil {
		return Effective{}, err
	}
	e := Effective{Enabled: st.Enabled, TilesURL: st.TilesURL, GeocoderURL: st.GeocoderURL, Locked: []string{}, Demo: s.demo}
	if s.env.Enabled != nil {
		e.Enabled = *s.env.Enabled
		e.Locked = append(e.Locked, "enabled")
	}
	if s.env.TilesURL != "" {
		e.TilesURL = s.env.TilesURL
		e.Locked = append(e.Locked, "tiles_url")
	}
	if s.env.GeocoderURL != "" {
		e.GeocoderURL = s.env.GeocoderURL
		e.Locked = append(e.Locked, "geocoder_url")
	}
	if e.TilesURL == "" {
		e.TilesURL = DefaultTilesURL
	}
	if e.GeocoderURL == "" {
		e.GeocoderURL = DefaultGeocoderURL
	}
	return e, nil
}

// Save stores the owner's settings. Empty URLs restore the defaults.
func (s *Service) Save(ctx context.Context, st Settings) error {
	for _, u := range []string{st.TilesURL, st.GeocoderURL} {
		if u != "" && !config.ValidProviderURL(u) {
			return fmt.Errorf("%w: provider addresses must be http or https URLs", ErrInvalid)
		}
	}
	if err := s.store.Set(ctx, SettingKey, st); err != nil {
		return err
	}
	s.mu.Lock()
	s.style, s.styleFor = nil, ""
	s.mu.Unlock()
	return nil
}

// ErrInvalid is a refused setting.
var ErrInvalid = errors.New("invalid_input")

func (s *Service) enabled(ctx context.Context) (Effective, error) {
	e, err := s.Effective(ctx)
	if err != nil {
		return e, err
	}
	if !e.Enabled {
		return e, ErrDisabled
	}
	return e, nil
}

// fetch GETs an upstream URL with the server's identity and nothing of the viewer's.
func (s *Service) fetch(ctx context.Context, u string) ([]byte, string, time.Duration, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, "", 0, err
	}
	req.Header.Set("User-Agent", s.ua)
	req.Header.Set("Accept", "*/*")
	res, err := s.client.Do(req)
	if err != nil {
		return nil, "", 0, fmt.Errorf("%w: %v", ErrUnavailable, err)
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusNotFound || res.StatusCode == http.StatusNoContent {
		return nil, "", 0, ErrNotFound
	}
	if res.StatusCode != http.StatusOK {
		return nil, "", 0, fmt.Errorf("%w: upstream status %d", ErrUnavailable, res.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(res.Body, MaxBody+1))
	if err != nil {
		return nil, "", 0, fmt.Errorf("%w: %v", ErrUnavailable, err)
	}
	if len(body) > MaxBody {
		return nil, "", 0, fmt.Errorf("%w: upstream response too large", ErrUnavailable)
	}
	return body, res.Header.Get("Content-Type"), maxAge(res.Header.Get("Cache-Control")), nil
}

var maxAgeRe = regexp.MustCompile(`max-age=(\d+)`)

// maxAge reads a Cache-Control lifetime; 0 when absent or no-store.
func maxAge(cc string) time.Duration {
	if strings.Contains(cc, "no-store") {
		return 0
	}
	if m := maxAgeRe.FindStringSubmatch(cc); m != nil {
		if n, err := strconv.Atoi(m[1]); err == nil {
			return time.Duration(n) * time.Second
		}
	}
	return 0
}

// cached serves u from the disk cache when fresh, otherwise fetches it; an
// unreachable provider still gets a stale cached copy served.
func (s *Service) cached(ctx context.Context, u string, def time.Duration) ([]byte, string, error) {
	if e, ok := s.cache.Get(u); ok && e.Fresh {
		return e.Body, e.ContentType, nil
	}
	body, ct, ttl, err := s.fetch(ctx, u)
	if err != nil {
		if e, ok := s.cache.Get(u); ok && !errors.Is(err, ErrNotFound) {
			return e.Body, e.ContentType, nil
		}
		return nil, "", err
	}
	if ttl <= 0 {
		ttl = def
	}
	_ = s.cache.Put(u, ct, body, ttl)
	return body, ct, nil
}

// Route paths the rewritten style points to (relative to the server's origin).
const (
	TilesPath   = "/api/v1/maps/tiles/{z}/{x}/{y}.pbf"
	GlyphsPath  = "/api/v1/maps/fonts/{fontstack}/{range}.pbf"
	SpritesPath = "/api/v1/maps/sprites/sprite"
)

// Style returns the provider's style with every URL in it pointing back to this
// server (design D4). The first vector source is served; other remote sources
// and their layers are left out.
func (s *Service) Style(ctx context.Context) ([]byte, error) {
	e, err := s.enabled(ctx)
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	if s.style != nil && s.styleFor == e.TilesURL && s.now().Sub(s.styleAt) < time.Hour {
		out := s.style
		s.mu.Unlock()
		return out, nil
	}
	s.mu.Unlock()
	raw, _, err := s.cached(ctx, e.TilesURL, time.Hour)
	if err != nil {
		return nil, err
	}
	out, up, err := s.rewrite(ctx, e.TilesURL, raw)
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	s.style, s.styleFor, s.styleAt, s.upstream = out, e.TilesURL, s.now(), up
	s.mu.Unlock()
	return out, nil
}

func (s *Service) rewrite(ctx context.Context, base string, raw []byte) ([]byte, upstream, error) {
	var style map[string]any
	if err := json.Unmarshal(raw, &style); err != nil {
		return nil, upstream{}, fmt.Errorf("%w: the style is not JSON", ErrUnavailable)
	}
	var up upstream
	sources, _ := style["sources"].(map[string]any)
	kept := map[string]bool{}
	for name, v := range sources {
		src, _ := v.(map[string]any)
		if src == nil {
			continue
		}
		typ, _ := src["type"].(string)
		_, hasURL := src["url"].(string)
		_, hasTiles := src["tiles"].([]any)
		if !hasURL && !hasTiles {
			kept[name] = true // inline data (geojson) needs nothing remote
			continue
		}
		if typ != "vector" || up.tiles != "" {
			delete(sources, name)
			continue
		}
		tmpl, extra, err := s.tileTemplate(ctx, base, src)
		if err != nil {
			return nil, upstream{}, err
		}
		up.tiles = tmpl
		out := map[string]any{"type": "vector", "tiles": []any{TilesPath}}
		for k, v := range extra {
			out[k] = v
		}
		sources[name] = out
		kept[name] = true
	}
	if layers, ok := style["layers"].([]any); ok {
		filtered := layers[:0]
		for _, l := range layers {
			lm, _ := l.(map[string]any)
			if src, ok := lm["source"].(string); ok && !kept[src] {
				continue
			}
			filtered = append(filtered, l)
		}
		style["layers"] = filtered
	}
	if g, ok := style["glyphs"].(string); ok {
		up.glyphs = resolve(base, g)
		style["glyphs"] = GlyphsPath
	}
	switch sp := style["sprite"].(type) {
	case string:
		up.sprite = resolve(base, sp)
		style["sprite"] = SpritesPath
	case []any:
		if len(sp) > 0 {
			if m, ok := sp[0].(map[string]any); ok {
				if u, ok := m["url"].(string); ok {
					up.sprite = resolve(base, u)
					style["sprite"] = SpritesPath
				}
			}
		}
	}
	out, err := json.Marshal(style)
	return out, up, err
}

// tileTemplate returns a vector source's tile URL template and its zoom range
// and attribution, reading its TileJSON when the source points to one.
func (s *Service) tileTemplate(ctx context.Context, base string, src map[string]any) (string, map[string]any, error) {
	extra := map[string]any{}
	for _, k := range []string{"minzoom", "maxzoom", "attribution", "bounds"} {
		if v, ok := src[k]; ok {
			extra[k] = v
		}
	}
	if tiles, ok := src["tiles"].([]any); ok && len(tiles) > 0 {
		t, _ := tiles[0].(string)
		return resolve(base, t), extra, nil
	}
	u := resolve(base, src["url"].(string))
	raw, _, err := s.cached(ctx, u, time.Hour)
	if err != nil {
		return "", nil, err
	}
	var tj map[string]any
	if err := json.Unmarshal(raw, &tj); err != nil {
		return "", nil, fmt.Errorf("%w: the tile source is not TileJSON", ErrUnavailable)
	}
	tiles, _ := tj["tiles"].([]any)
	if len(tiles) == 0 {
		return "", nil, fmt.Errorf("%w: the tile source lists no tiles", ErrUnavailable)
	}
	t, _ := tiles[0].(string)
	for _, k := range []string{"minzoom", "maxzoom", "attribution", "bounds"} {
		if v, ok := tj[k]; ok {
			if _, set := extra[k]; !set {
				extra[k] = v
			}
		}
	}
	return resolve(u, t), extra, nil
}

func resolve(base, ref string) string {
	b, err := url.Parse(base)
	if err != nil {
		return ref
	}
	r, err := url.Parse(ref)
	if err != nil {
		return ref
	}
	// Keep the template braces readable: url.String would escape them.
	return strings.NewReplacer("%7B", "{", "%7D", "}").Replace(b.ResolveReference(r).String())
}

func (s *Service) current(ctx context.Context) (upstream, error) {
	if _, err := s.Style(ctx); err != nil {
		return upstream{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.upstream, nil
}

// Tile returns one vector tile.
func (s *Service) Tile(ctx context.Context, z, x, y int) ([]byte, string, error) {
	if z < 0 || z > 22 || x < 0 || y < 0 || x >= 1<<z || y >= 1<<z {
		return nil, "", ErrNotFound
	}
	up, err := s.current(ctx)
	if err != nil {
		return nil, "", err
	}
	if up.tiles == "" {
		return nil, "", ErrNotFound
	}
	u := strings.NewReplacer("{z}", strconv.Itoa(z), "{x}", strconv.Itoa(x), "{y}", strconv.Itoa(y)).Replace(up.tiles)
	return s.cached(ctx, u, 7*24*time.Hour)
}

var (
	fontstackRe = regexp.MustCompile(`^[A-Za-z0-9 ,_-]{1,200}$`)
	rangeRe     = regexp.MustCompile(`^[0-9]{1,5}-[0-9]{1,5}$`)
)

// Glyphs returns one glyph range of a font stack.
func (s *Service) Glyphs(ctx context.Context, fontstack, rng string) ([]byte, string, error) {
	if !fontstackRe.MatchString(fontstack) || !rangeRe.MatchString(rng) {
		return nil, "", ErrNotFound
	}
	up, err := s.current(ctx)
	if err != nil {
		return nil, "", err
	}
	if up.glyphs == "" {
		return nil, "", ErrNotFound
	}
	u := strings.NewReplacer("{fontstack}", url.PathEscape(fontstack), "{range}", rng).Replace(up.glyphs)
	return s.cached(ctx, u, 30*24*time.Hour)
}

// Sprite returns the sprite sheet or its index: file is sprite.json,
// sprite.png, sprite@2x.json or sprite@2x.png.
func (s *Service) Sprite(ctx context.Context, file string) ([]byte, string, error) {
	suffix, ok := map[string]string{"sprite.json": ".json", "sprite.png": ".png", "sprite@2x.json": "@2x.json", "sprite@2x.png": "@2x.png"}[file]
	if !ok {
		return nil, "", ErrNotFound
	}
	up, err := s.current(ctx)
	if err != nil {
		return nil, "", err
	}
	if up.sprite == "" {
		return nil, "", ErrNotFound
	}
	return s.cached(ctx, up.sprite+suffix, 30*24*time.Hour)
}
