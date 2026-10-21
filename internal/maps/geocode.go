package maps

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/pixari/opentodo/internal/location"
)

// Result is one address found by search or reverse search, the shape the
// location editor shows and stores (task-locations "Setting a location").
type Result struct {
	Name    string  `json:"name"`
	Address string  `json:"address"`
	Lat     float64 `json:"lat"`
	Lon     float64 `json:"lon"`
}

// MaxQuery bounds a search text.
const MaxQuery = 200

// photonLangs are the languages the public Photon instance answers in (it refuses
// any other `lang`, such as it or es, with 400 Bad Request); any
// other interface language gets Photon's default (local names).
var photonLangs = map[string]bool{"en": true, "de": true, "fr": true}

// Search sends the typed text to the geocoder and returns up to limit results.
// Searches are never cached: what one user typed is not kept on disk.
func (s *Service) Search(ctx context.Context, q, lang string, limit int) ([]Result, error) {
	e, err := s.enabled(ctx)
	if err != nil {
		return nil, err
	}
	q = strings.TrimSpace(q)
	if q == "" || utf8.RuneCountInString(q) > MaxQuery {
		return nil, fmt.Errorf("%w: q must be 1 to %d characters", ErrInvalid, MaxQuery)
	}
	if limit < 1 || limit > 10 {
		limit = 5
	}
	v := url.Values{"q": {q}, "limit": {strconv.Itoa(limit)}}
	if photonLangs[lang] {
		v.Set("lang", lang)
	}
	return s.photon(ctx, strings.TrimRight(e.GeocoderURL, "/")+"/api?"+v.Encode())
}

// Reverse returns the nearest address to a point, or nil when there is none.
func (s *Service) Reverse(ctx context.Context, lat, lon float64, lang string) (*Result, error) {
	e, err := s.enabled(ctx)
	if err != nil {
		return nil, err
	}
	if !location.ValidLat(lat) || !location.ValidLon(lon) {
		return nil, fmt.Errorf("%w: lat must be from -90 to 90 and lon from -180 to 180", ErrInvalid)
	}
	v := url.Values{"lat": {strconv.FormatFloat(lat, 'f', 6, 64)}, "lon": {strconv.FormatFloat(lon, 'f', 6, 64)}}
	if photonLangs[lang] {
		v.Set("lang", lang)
	}
	out, err := s.photon(ctx, strings.TrimRight(e.GeocoderURL, "/")+"/reverse?"+v.Encode())
	if err != nil || len(out) == 0 {
		return nil, err
	}
	return &out[0], nil
}

// photon reads a Photon (GeoJSON) answer.
func (s *Service) photon(ctx context.Context, u string) ([]Result, error) {
	body, _, _, err := s.fetch(ctx, u)
	if err != nil {
		return nil, err
	}
	var fc struct {
		Features []struct {
			Geometry struct {
				Coordinates []float64 `json:"coordinates"`
			} `json:"geometry"`
			Properties map[string]any `json:"properties"`
		} `json:"features"`
	}
	if err := json.Unmarshal(body, &fc); err != nil {
		return nil, fmt.Errorf("%w: the geocoder's answer is not GeoJSON", ErrUnavailable)
	}
	out := []Result{}
	for _, f := range fc.Features {
		if len(f.Geometry.Coordinates) < 2 {
			continue
		}
		lon, lat := f.Geometry.Coordinates[0], f.Geometry.Coordinates[1]
		if !location.ValidLat(lat) || !location.ValidLon(lon) {
			continue
		}
		r := Result{Lat: location.Round6(lat), Lon: location.Round6(lon), Address: address(f.Properties)}
		r.Name = truncate(prop(f.Properties, "name"), location.MaxName)
		if r.Name == "" {
			r.Name = truncate(firstLine(r.Address), location.MaxName)
		}
		if r.Name == "" && r.Address == "" {
			continue
		}
		out = append(out, r)
	}
	return out, nil
}

func prop(p map[string]any, k string) string {
	s, _ := p[k].(string)
	return strings.TrimSpace(s)
}

// address joins Photon's parts as "Street 1, 10121 City, Country".
func address(p map[string]any) string {
	var parts []string
	street := prop(p, "street")
	if n := prop(p, "housenumber"); street != "" && n != "" {
		street += " " + n
	}
	if street != "" {
		parts = append(parts, street)
	}
	city := strings.TrimSpace(prop(p, "postcode") + " " + firstNonEmpty(prop(p, "city"), prop(p, "town"), prop(p, "village"), prop(p, "district")))
	if city != "" {
		parts = append(parts, city)
	}
	if c := prop(p, "country"); c != "" {
		parts = append(parts, c)
	}
	return truncate(strings.Join(parts, ", "), location.MaxAddress)
}

func firstNonEmpty(vs ...string) string {
	for _, v := range vs {
		if v != "" {
			return v
		}
	}
	return ""
}

func firstLine(s string) string {
	first, _, _ := strings.Cut(s, ",")
	return strings.TrimSpace(first)
}

func truncate(s string, n int) string {
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	r := []rune(s)
	return string(r[:n])
}
