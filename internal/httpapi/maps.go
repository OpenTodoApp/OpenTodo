package httpapi

import (
	"context"
	"errors"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/maps"
	ob "github.com/pixari/opentodo/internal/outbound"
	"github.com/pixari/opentodo/internal/settings"
)

// Maps (OpenSpec change task-locations, design D4, D6): the server proxies the
// map provider's style, tiles, fonts and sprites and the geocoder's searches,
// so a browser never contacts a third party. Every route needs a session or a
// full token; with maps off for the server they answer 404 maps_disabled. On a
// demo instance maps are off unless OPENTODO_MAPS=on.

// mapSearchesPerMinute is the per-user search limit (design D4).
const mapSearchesPerMinute = 30

// WithMaps hands the server a map proxy (tests use a fake provider).
func WithMaps(m *maps.Service) Option { return func(s *Server) { s.maps = m } }

func (s *Server) registerMapRoutes(mux *routes) {
	if s.maps == nil {
		// Providers are chosen by the owner, never typed by a user, so a self-hosted
		// Photon or tile server on the local network is allowed. The outbound client
		// still gives timeouts and checks every redirect hop.
		client := ob.NewClient(&ob.Dialer{AllowPrivate: func(context.Context) bool { return true }}, 10*time.Second, ob.FollowRedirects(3))
		s.maps = maps.New(settings.New(s.sync.DB()), s.cfg.Maps, s.cfg.Demo, client,
			maps.NewCache(filepath.Join(s.cfg.DataDir, "cache", "maps"), maps.DefaultCacheBytes), s.version)
	}
	s.mapsLimiter = newRateLimiter(mapSearchesPerMinute, time.Minute)
	read := signedIn.fullTokens()
	mux.handle("GET /api/v1/maps/style", read, s.handleMapStyle)
	mux.handle("GET /api/v1/maps/tiles/{z}/{x}/{y}", read, s.handleMapTile)
	mux.handle("GET /api/v1/maps/fonts/{fontstack}/{range}", read, s.handleMapGlyphs)
	mux.handle("GET /api/v1/maps/sprites/{file}", read, s.handleMapSprite)
	mux.handle("GET /api/v1/maps/search", read, s.handleMapSearch)
	mux.handle("GET /api/v1/maps/reverse", read, s.handleMapReverse)
	mux.handle("GET /api/v1/settings/maps", ownerOnly("see the maps setting"), s.handleGetMapsSetting)
	mux.handle("PUT /api/v1/settings/maps", ownerOnly("manage the maps setting").demoDenied(), s.handlePutMapsSetting)
}

// mapsAvailable is what /api/v1/me tells clients: whether maps are on for the server.
func (s *Server) mapsAvailable(ctx context.Context) bool {
	if s.maps == nil {
		return false
	}
	e, err := s.maps.Effective(ctx)
	if err != nil {
		s.log.Error("read maps setting", "err", err)
		return false
	}
	return e.Enabled
}

// mapError answers a proxy error.
func (s *Server) mapError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, maps.ErrDisabled):
		writeError(w, http.StatusNotFound, "maps_disabled", "maps are turned off on this server")
	case errors.Is(err, maps.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", "not found")
	case errors.Is(err, maps.ErrInvalid):
		writeError(w, http.StatusBadRequest, "invalid_input", strings.TrimPrefix(err.Error(), "invalid_input: "))
	case errors.Is(err, maps.ErrUnavailable):
		s.log.Warn("map provider unavailable", "err", err)
		writeError(w, http.StatusBadGateway, "maps_unavailable", "the map provider did not answer")
	default:
		s.internal(w, err)
	}
}

// mapBody writes a proxied body; it may be cached by the browser for a day, and
// only for this user (the routes need a sign-in).
func mapBody(w http.ResponseWriter, body []byte, contentType string, maxAge time.Duration) {
	if contentType != "" {
		w.Header().Set("Content-Type", contentType)
	}
	w.Header().Set("Cache-Control", "private, max-age="+strconv.Itoa(int(maxAge.Seconds())))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

func (s *Server) handleMapStyle(w http.ResponseWriter, r *http.Request) {
	body, err := s.maps.Style(r.Context())
	if err != nil {
		s.mapError(w, err)
		return
	}
	mapBody(w, body, "application/json", time.Hour)
}

func (s *Server) handleMapTile(w http.ResponseWriter, r *http.Request) {
	z, errZ := strconv.Atoi(r.PathValue("z"))
	x, errX := strconv.Atoi(r.PathValue("x"))
	y, errY := strconv.Atoi(strings.TrimSuffix(r.PathValue("y"), ".pbf"))
	if errZ != nil || errX != nil || errY != nil {
		writeError(w, http.StatusNotFound, "not_found", "not found")
		return
	}
	body, _, err := s.maps.Tile(r.Context(), z, x, y)
	if err != nil {
		s.mapError(w, err)
		return
	}
	mapBody(w, body, "application/x-protobuf", 24*time.Hour)
}

func (s *Server) handleMapGlyphs(w http.ResponseWriter, r *http.Request) {
	body, _, err := s.maps.Glyphs(r.Context(), r.PathValue("fontstack"), strings.TrimSuffix(r.PathValue("range"), ".pbf"))
	if err != nil {
		s.mapError(w, err)
		return
	}
	mapBody(w, body, "application/x-protobuf", 7*24*time.Hour)
}

func (s *Server) handleMapSprite(w http.ResponseWriter, r *http.Request) {
	file := r.PathValue("file")
	body, _, err := s.maps.Sprite(r.Context(), file)
	if err != nil {
		s.mapError(w, err)
		return
	}
	ct := "application/json"
	if strings.HasSuffix(file, ".png") {
		ct = "image/png"
	}
	mapBody(w, body, ct, 7*24*time.Hour)
}

func (s *Server) handleMapSearch(w http.ResponseWriter, r *http.Request) {
	if !s.mapsAvailable(r.Context()) {
		s.mapError(w, maps.ErrDisabled)
		return
	}
	if !s.mapsLimiter.allow(userFrom(r.Context()).ID) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many searches, try again in a minute")
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	res, err := s.maps.Search(r.Context(), r.URL.Query().Get("q"), r.URL.Query().Get("lang"), limit)
	if err != nil {
		s.mapError(w, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, map[string]any{"results": res})
}

func (s *Server) handleMapReverse(w http.ResponseWriter, r *http.Request) {
	if !s.mapsAvailable(r.Context()) {
		s.mapError(w, maps.ErrDisabled)
		return
	}
	if !s.mapsLimiter.allow(userFrom(r.Context()).ID) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many searches, try again in a minute")
		return
	}
	lat, errLat := strconv.ParseFloat(r.URL.Query().Get("lat"), 64)
	lon, errLon := strconv.ParseFloat(r.URL.Query().Get("lon"), 64)
	if errLat != nil || errLon != nil {
		writeError(w, http.StatusBadRequest, "invalid_input", "lat and lon must be numbers")
		return
	}
	res, err := s.maps.Reverse(r.Context(), lat, lon, r.URL.Query().Get("lang"))
	if err != nil {
		s.mapError(w, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, map[string]any{"result": res})
}

func (s *Server) handleGetMapsSetting(w http.ResponseWriter, r *http.Request) {
	e, err := s.maps.Effective(r.Context())
	if err != nil {
		s.internal(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"enabled": e.Enabled, "tiles_url": e.TilesURL, "geocoder_url": e.GeocoderURL,
		"locked": e.Locked, "defaults": map[string]string{"tiles_url": maps.DefaultTilesURL, "geocoder_url": maps.DefaultGeocoderURL}})
}

func (s *Server) handlePutMapsSetting(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Enabled     *bool   `json:"enabled"`
		TilesURL    *string `json:"tiles_url"`
		GeocoderURL *string `json:"geocoder_url"`
	}
	if err := readJSON(r, &in); err != nil || in.Enabled == nil {
		badBodyWith(w, err, "invalid_input", `body must be {"enabled": true|false, "tiles_url"?: string, "geocoder_url"?: string}`)
		return
	}
	var cur maps.Settings
	cur.Enabled = !s.cfg.Demo
	if _, err := settings.New(s.sync.DB()).Get(r.Context(), maps.SettingKey, &cur); err != nil {
		s.internal(w, err)
		return
	}
	next := maps.Settings{Enabled: *in.Enabled, TilesURL: cur.TilesURL, GeocoderURL: cur.GeocoderURL}
	if in.TilesURL != nil {
		next.TilesURL = strings.TrimSpace(*in.TilesURL)
	}
	if in.GeocoderURL != nil {
		next.GeocoderURL = strings.TrimSpace(*in.GeocoderURL)
	}
	if err := s.maps.Save(r.Context(), next); err != nil {
		s.mapError(w, err)
		return
	}
	uid := userFrom(r.Context()).ID
	if cur.Enabled != next.Enabled {
		s.audit.Record(r.Context(), audit.SettingsChanged(uid, "maps.enabled", boolText(cur.Enabled), boolText(next.Enabled)))
	}
	if cur.TilesURL != next.TilesURL {
		s.audit.Record(r.Context(), audit.SettingsChanged(uid, "maps.tiles_url", cur.TilesURL, next.TilesURL))
	}
	if cur.GeocoderURL != next.GeocoderURL {
		s.audit.Record(r.Context(), audit.SettingsChanged(uid, "maps.geocoder_url", cur.GeocoderURL, next.GeocoderURL))
	}
	s.handleGetMapsSetting(w, r)
}
