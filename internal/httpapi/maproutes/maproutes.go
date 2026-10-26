// Package maproutes serves the map proxy (OpenSpec change task-locations,
// design D4, D6): the server proxies the map provider's style, tiles, fonts
// and sprites and the geocoder's searches, so a browser never contacts a third
// party. Every route needs a session or a full token; with maps off for the
// server they answer 404 maps_disabled. On a demo instance maps are off unless
// OPENTODO_MAPS=on.
package maproutes

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/httpapi/httpx"
	"github.com/pixari/opentodo/internal/maps"
	"github.com/pixari/opentodo/internal/settings"
)

// SearchesPerMinute is the per-user search limit (design D4).
const SearchesPerMinute = 30

// Routes are the map proxy's routes and the owner's maps setting.
type Routes struct {
	Maps     *maps.Service
	Settings *settings.Store
	Audit    *audit.Recorder
	Log      *slog.Logger
	// Demo: maps default to off on a demo instance.
	Demo bool
	// Allow counts one search of an account against its limit (mapSearchesPerMinute).
	Allow func(userID string) bool
}

// Register adds the routes behind their policies.
func (s *Routes) Register(mux httpx.Router) {
	read := httpx.SignedIn.FullTokens()
	mux.Handle("GET /api/v1/maps/style", read, s.handleMapStyle)
	mux.Handle("GET /api/v1/maps/tiles/{z}/{x}/{y}", read, s.handleMapTile)
	mux.Handle("GET /api/v1/maps/fonts/{fontstack}/{range}", read, s.handleMapGlyphs)
	mux.Handle("GET /api/v1/maps/sprites/{file}", read, s.handleMapSprite)
	mux.Handle("GET /api/v1/maps/search", read, s.handleMapSearch)
	mux.Handle("GET /api/v1/maps/reverse", read, s.handleMapReverse)
	mux.Handle("GET /api/v1/settings/maps", httpx.OwnerOnly("see the maps setting"), s.handleGetMapsSetting)
	mux.Handle("PUT /api/v1/settings/maps", httpx.OwnerOnly("manage the maps setting").Credential().DemoDenied(), s.handlePutMapsSetting)
}

// Available is what /api/v1/me tells clients: whether maps are on for the server.
func (s *Routes) Available(ctx context.Context) bool {
	e, err := s.Maps.Effective(ctx)
	if err != nil {
		s.Log.Error("read maps setting", "err", err)
		return false
	}
	return e.Enabled
}

// Error answers a proxy error (task pages' map routes answer the same way).
func (s *Routes) Error(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, maps.ErrDisabled):
		httpx.WriteError(w, http.StatusNotFound, "maps_disabled", "maps are turned off on this server")
	case errors.Is(err, maps.ErrNotFound):
		httpx.WriteError(w, http.StatusNotFound, "not_found", "not found")
	case errors.Is(err, maps.ErrInvalid):
		httpx.WriteError(w, http.StatusBadRequest, "invalid_input", strings.TrimPrefix(err.Error(), "invalid_input: "))
	case errors.Is(err, maps.ErrUnavailable):
		s.Log.Warn("map provider unavailable", "err", err)
		httpx.WriteError(w, http.StatusBadGateway, "maps_unavailable", "the map provider did not answer")
	default:
		httpx.Internal(w, s.Log, err)
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

func (s *Routes) handleMapStyle(w http.ResponseWriter, r *http.Request) {
	body, err := s.Maps.Style(r.Context())
	if err != nil {
		s.Error(w, err)
		return
	}
	mapBody(w, body, "application/json", time.Hour)
}

func (s *Routes) handleMapTile(w http.ResponseWriter, r *http.Request) {
	z, errZ := strconv.Atoi(r.PathValue("z"))
	x, errX := strconv.Atoi(r.PathValue("x"))
	y, errY := strconv.Atoi(strings.TrimSuffix(r.PathValue("y"), ".pbf"))
	if errZ != nil || errX != nil || errY != nil {
		httpx.WriteError(w, http.StatusNotFound, "not_found", "not found")
		return
	}
	body, _, err := s.Maps.Tile(r.Context(), z, x, y)
	if err != nil {
		s.Error(w, err)
		return
	}
	mapBody(w, body, "application/x-protobuf", 24*time.Hour)
}

func (s *Routes) handleMapGlyphs(w http.ResponseWriter, r *http.Request) {
	body, _, err := s.Maps.Glyphs(r.Context(), r.PathValue("fontstack"), strings.TrimSuffix(r.PathValue("range"), ".pbf"))
	if err != nil {
		s.Error(w, err)
		return
	}
	mapBody(w, body, "application/x-protobuf", 7*24*time.Hour)
}

func (s *Routes) handleMapSprite(w http.ResponseWriter, r *http.Request) {
	file := r.PathValue("file")
	body, _, err := s.Maps.Sprite(r.Context(), file)
	if err != nil {
		s.Error(w, err)
		return
	}
	ct := "application/json"
	if strings.HasSuffix(file, ".png") {
		ct = "image/png"
	}
	mapBody(w, body, ct, 7*24*time.Hour)
}

func (s *Routes) handleMapSearch(w http.ResponseWriter, r *http.Request) {
	if !s.Available(r.Context()) {
		s.Error(w, maps.ErrDisabled)
		return
	}
	if !s.Allow(httpx.UserFrom(r.Context()).ID) {
		httpx.WriteError(w, http.StatusTooManyRequests, "rate_limited", "too many searches, try again in a minute")
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	res, err := s.Maps.Search(r.Context(), r.URL.Query().Get("q"), r.URL.Query().Get("lang"), limit)
	if err != nil {
		s.Error(w, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"results": res})
}

func (s *Routes) handleMapReverse(w http.ResponseWriter, r *http.Request) {
	if !s.Available(r.Context()) {
		s.Error(w, maps.ErrDisabled)
		return
	}
	if !s.Allow(httpx.UserFrom(r.Context()).ID) {
		httpx.WriteError(w, http.StatusTooManyRequests, "rate_limited", "too many searches, try again in a minute")
		return
	}
	lat, errLat := strconv.ParseFloat(r.URL.Query().Get("lat"), 64)
	lon, errLon := strconv.ParseFloat(r.URL.Query().Get("lon"), 64)
	if errLat != nil || errLon != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid_input", "lat and lon must be numbers")
		return
	}
	res, err := s.Maps.Reverse(r.Context(), lat, lon, r.URL.Query().Get("lang"))
	if err != nil {
		s.Error(w, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"result": res})
}

func (s *Routes) handleGetMapsSetting(w http.ResponseWriter, r *http.Request) {
	e, err := s.Maps.Effective(r.Context())
	if err != nil {
		httpx.Internal(w, s.Log, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"enabled": e.Enabled, "tiles_url": e.TilesURL, "geocoder_url": e.GeocoderURL,
		"locked": e.Locked, "defaults": map[string]string{"tiles_url": maps.DefaultTilesURL, "geocoder_url": maps.DefaultGeocoderURL}})
}

func (s *Routes) handlePutMapsSetting(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Enabled     *bool   `json:"enabled"`
		TilesURL    *string `json:"tiles_url"`
		GeocoderURL *string `json:"geocoder_url"`
	}
	if err := httpx.ReadJSON(r, &in); err != nil || in.Enabled == nil {
		httpx.BadBodyWith(w, err, "invalid_input", `body must be {"enabled": true|false, "tiles_url"?: string, "geocoder_url"?: string}`)
		return
	}
	var cur maps.Settings
	cur.Enabled = !s.Demo
	if _, err := s.Settings.Get(r.Context(), maps.SettingKey, &cur); err != nil {
		httpx.Internal(w, s.Log, err)
		return
	}
	next := maps.Settings{Enabled: *in.Enabled, TilesURL: cur.TilesURL, GeocoderURL: cur.GeocoderURL}
	if in.TilesURL != nil {
		next.TilesURL = strings.TrimSpace(*in.TilesURL)
	}
	if in.GeocoderURL != nil {
		next.GeocoderURL = strings.TrimSpace(*in.GeocoderURL)
	}
	if err := s.Maps.Save(r.Context(), next); err != nil {
		s.Error(w, err)
		return
	}
	uid := httpx.UserFrom(r.Context()).ID
	if cur.Enabled != next.Enabled {
		s.Audit.Record(r.Context(), audit.SettingsChanged(uid, "maps.enabled", strconv.FormatBool(cur.Enabled), strconv.FormatBool(next.Enabled)))
	}
	if cur.TilesURL != next.TilesURL {
		s.Audit.Record(r.Context(), audit.SettingsChanged(uid, "maps.tiles_url", cur.TilesURL, next.TilesURL))
	}
	if cur.GeocoderURL != next.GeocoderURL {
		s.Audit.Record(r.Context(), audit.SettingsChanged(uid, "maps.geocoder_url", cur.GeocoderURL, next.GeocoderURL))
	}
	s.handleGetMapsSetting(w, r)
}
