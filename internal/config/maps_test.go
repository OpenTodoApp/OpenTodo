package config

import (
	"strings"
	"testing"
)

// task-locations "Map switches": every variable is optional; an invalid value
// stops startup naming the variable.
func TestMapsConfig(t *testing.T) {
	for _, c := range []struct {
		name string
		env  map[string]string
		on   *bool
		err  string
	}{
		{name: "unset"},
		{name: "on", env: map[string]string{"OPENTODO_MAPS": "on"}, on: ptr(true)},
		{name: "off", env: map[string]string{"OPENTODO_MAPS": "OFF"}, on: ptr(false)},
		{name: "invalid", env: map[string]string{"OPENTODO_MAPS": "sometimes"}, err: "OPENTODO_MAPS"},
		{name: "tiles url", env: map[string]string{"OPENTODO_MAPS_TILES_URL": "https://tiles.example.com/styles/liberty"}},
		{name: "bad tiles url", env: map[string]string{"OPENTODO_MAPS_TILES_URL": "ftp://x"}, err: "OPENTODO_MAPS_TILES_URL"},
		{name: "bad geocoder url", env: map[string]string{"OPENTODO_MAPS_GEOCODER_URL": "photon"}, err: "OPENTODO_MAPS_GEOCODER_URL"},
		{name: "credentials refused", env: map[string]string{"OPENTODO_MAPS_GEOCODER_URL": "https://u:p@photon.example.com"}, err: "OPENTODO_MAPS_GEOCODER_URL"},
	} {
		t.Run(c.name, func(t *testing.T) {
			for _, k := range []string{"OPENTODO_MAPS", "OPENTODO_MAPS_TILES_URL", "OPENTODO_MAPS_GEOCODER_URL"} {
				t.Setenv(k, c.env[k])
			}
			cfg, err := Load()
			if c.err != "" {
				if err == nil || !strings.Contains(err.Error(), c.err) {
					t.Fatalf("err = %v, want one naming %s", err, c.err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if (cfg.Maps.Enabled == nil) != (c.on == nil) || (c.on != nil && *cfg.Maps.Enabled != *c.on) {
				t.Fatalf("enabled = %v, want %v", cfg.Maps.Enabled, c.on)
			}
			if got := cfg.Maps.TilesURL; got != c.env["OPENTODO_MAPS_TILES_URL"] {
				t.Fatalf("tiles = %q", got)
			}
		})
	}
}
