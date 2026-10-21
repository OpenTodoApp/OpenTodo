// Package location is a task's location and a place's position (OpenSpec
// change task-locations, design D1). A task's location is one value
// {name?, address?, lat?, lon?, place_id?}; a place's coordinates are one value
// {lat, lon}. Both are whole-value registers that converge like due, and both
// are content: an encrypted account stores them as one ciphertext string.
//
// It holds the one validation every write path uses (internal/sync's
// kLocation and kGeo checks, REST, the importers). Nothing here makes a
// request; geocoding lives in the map proxy (internal/maps).
package location

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"unicode/utf8"

	"github.com/pixari/opentodo/internal/e2ee"
)

// Limits on the members ("Location validation", "Places").
const (
	MaxName    = 200
	MaxAddress = 500
	MaxPlaceID = 64
)

// Location is the plaintext value of a task's location. Empty strings are
// absent; Lat and Lon are both set or both nil.
type Location struct {
	Name    string   `json:"name,omitempty"`
	Address string   `json:"address,omitempty"`
	Lat     *float64 `json:"lat,omitempty"`
	Lon     *float64 `json:"lon,omitempty"`
	PlaceID string   `json:"place_id,omitempty"`
}

// Geo is a place's coordinate pair.
type Geo struct {
	Lat float64 `json:"lat"`
	Lon float64 `json:"lon"`
}

// ValidLat reports whether v is a latitude: finite, from -90 to 90.
func ValidLat(v float64) bool { return !math.IsNaN(v) && v >= -90 && v <= 90 }

// ValidLon reports whether v is a longitude: finite, from -180 to 180.
func ValidLon(v float64) bool { return !math.IsNaN(v) && v >= -180 && v <= 180 }

// Round6 rounds a coordinate to 6 decimals (about 10 cm, design D8).
func Round6(v float64) float64 { return math.Round(v*1e6) / 1e6 }

// Validate checks a decoded location against "Location validation".
func (l Location) Validate() error {
	if (l.Lat == nil) != (l.Lon == nil) {
		return errors.New("location lat and lon must both be present or both absent")
	}
	if l.Lat != nil && !ValidLat(*l.Lat) {
		return errors.New("location lat must be a number from -90 to 90")
	}
	if l.Lon != nil && !ValidLon(*l.Lon) {
		return errors.New("location lon must be a number from -180 to 180")
	}
	if l.Name == "" && l.Address == "" && l.Lat == nil {
		return errors.New("location needs a name, an address or coordinates")
	}
	if utf8.RuneCountInString(l.Name) > MaxName {
		return fmt.Errorf("location name must be at most %d characters", MaxName)
	}
	if utf8.RuneCountInString(l.Address) > MaxAddress {
		return fmt.Errorf("location address must be at most %d characters", MaxAddress)
	}
	if len(l.PlaceID) > MaxPlaceID {
		return fmt.Errorf("location place_id must be an id of at most %d characters", MaxPlaceID)
	}
	return nil
}

// wire is the strict decoding shape: pointers tell an absent member from an
// empty one, and an empty string is refused.
type wire struct {
	Name    *string  `json:"name"`
	Address *string  `json:"address"`
	Lat     *float64 `json:"lat"`
	Lon     *float64 `json:"lon"`
	PlaceID *string  `json:"place_id"`
}

func strictObject(raw json.RawMessage, what string, dst any) error {
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 || raw[0] != '{' {
		return fmt.Errorf("%s must be an object", what)
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return fmt.Errorf("%s has an unknown member or a member of the wrong type", what)
	}
	if dec.More() {
		return fmt.Errorf("%s must be one object", what)
	}
	return nil
}

// Decode reads a plaintext location object strictly and validates it. It
// refuses null and ciphertext; CheckValue accepts those.
func Decode(raw json.RawMessage) (Location, error) {
	var w wire
	if err := strictObject(raw, "location", &w); err != nil {
		return Location{}, err
	}
	var l Location
	for _, m := range []struct {
		name string
		src  *string
		dst  *string
	}{{"name", w.Name, &l.Name}, {"address", w.Address, &l.Address}, {"place_id", w.PlaceID, &l.PlaceID}} {
		if m.src == nil {
			continue
		}
		if *m.src == "" {
			return Location{}, fmt.Errorf("location %s must not be empty", m.name)
		}
		*m.dst = *m.src
	}
	l.Lat, l.Lon = w.Lat, w.Lon
	return l, l.Validate()
}

// CheckValue validates a stored or submitted task location: JSON null (none),
// a ciphertext string of an encrypted account (opaque, bounded only by the op
// value limit), or a valid plaintext object.
func CheckValue(raw json.RawMessage) error {
	raw = bytes.TrimSpace(raw)
	if string(raw) == "null" {
		return nil
	}
	if len(raw) > 0 && raw[0] == '"' {
		if e2ee.IsCiphertextJSON(raw) {
			return nil
		}
		return errors.New("location must be null, an object or a ciphertext string")
	}
	_, err := Decode(raw)
	return err
}

// DecodeGeo reads a place's plaintext coordinate pair strictly.
func DecodeGeo(raw json.RawMessage) (Geo, error) {
	var w struct {
		Lat *float64 `json:"lat"`
		Lon *float64 `json:"lon"`
	}
	if err := strictObject(raw, "geo", &w); err != nil {
		return Geo{}, err
	}
	if w.Lat == nil || w.Lon == nil {
		return Geo{}, errors.New("geo needs lat and lon")
	}
	if !ValidLat(*w.Lat) || !ValidLon(*w.Lon) {
		return Geo{}, errors.New("geo lat must be from -90 to 90 and lon from -180 to 180")
	}
	return Geo{*w.Lat, *w.Lon}, nil
}

// CheckGeo validates a place's coordinates: null (none), a ciphertext string,
// or a valid {lat, lon} object.
func CheckGeo(raw json.RawMessage) error {
	raw = bytes.TrimSpace(raw)
	if string(raw) == "null" {
		return nil
	}
	if len(raw) > 0 && raw[0] == '"' {
		if e2ee.IsCiphertextJSON(raw) {
			return nil
		}
		return errors.New("geo must be null, an object or a ciphertext string")
	}
	_, err := DecodeGeo(raw)
	return err
}
