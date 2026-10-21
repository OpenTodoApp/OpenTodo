package config

import (
	"fmt"
	"net/url"
	"os"
	"strings"
)

// MapsConfig holds the optional OPENTODO_MAPS* variables (OpenSpec change
// task-locations, design D6). Each set value overrides the owner's setting and
// locks that field in Settings; nothing is required. Maps are on by default,
// except on a demo instance.
type MapsConfig struct {
	// Enabled is nil when OPENTODO_MAPS is unset.
	Enabled *bool
	// TilesURL is the provider's map style URL (OPENTODO_MAPS_TILES_URL).
	TilesURL string
	// GeocoderURL is the Photon-compatible search endpoint's base URL
	// (OPENTODO_MAPS_GEOCODER_URL).
	GeocoderURL string
}

// loadMaps reads OPENTODO_MAPS, OPENTODO_MAPS_TILES_URL and
// OPENTODO_MAPS_GEOCODER_URL; an invalid value stops startup naming the variable.
func (c *Config) loadMaps() error {
	switch v := strings.ToLower(strings.TrimSpace(os.Getenv("OPENTODO_MAPS"))); v {
	case "":
	case "on", "true", "1", "yes":
		on := true
		c.Maps.Enabled = &on
	case "off", "false", "0", "no":
		off := false
		c.Maps.Enabled = &off
	default:
		return fmt.Errorf("OPENTODO_MAPS must be on or off, got %q", os.Getenv("OPENTODO_MAPS"))
	}
	for _, v := range []struct {
		name string
		dst  *string
	}{{"OPENTODO_MAPS_TILES_URL", &c.Maps.TilesURL}, {"OPENTODO_MAPS_GEOCODER_URL", &c.Maps.GeocoderURL}} {
		raw := strings.TrimSpace(os.Getenv(v.name))
		if raw == "" {
			continue
		}
		if !ValidProviderURL(raw) {
			return fmt.Errorf("%s must be an http or https URL, got %q", v.name, raw)
		}
		*v.dst = raw
	}
	return nil
}

// ValidProviderURL reports whether s is an absolute http or https URL with a
// host and no credentials, as a map provider address must be.
func ValidProviderURL(s string) bool {
	u, err := url.Parse(s)
	return err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Host != "" && u.User == nil
}
