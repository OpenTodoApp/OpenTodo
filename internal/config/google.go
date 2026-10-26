package config

import (
	"fmt"
	"os"
	"strings"
)

// GoogleConfig holds the optional Google OAuth client of calendar sync
// (OpenSpec change calendar-two-way, design D13): OPENTODO_GOOGLE_CLIENT_ID and
// OPENTODO_GOOGLE_CLIENT_SECRET or OPENTODO_GOOGLE_CLIENT_SECRET_FILE. None is
// required; when the id and a secret are set they replace the client stored in
// Settings and make it read-only there.
type GoogleConfig struct {
	ClientID     string
	ClientSecret string
}

// Set reports whether the environment configures the client.
func (g GoogleConfig) Set() bool { return g.ClientID != "" && g.ClientSecret != "" }

// loadGoogle reads the Google client variables. Only one of the two secret
// variables may be set, and an id needs a secret (and the reverse).
func (c *Config) loadGoogle() error {
	g := GoogleConfig{ClientID: strings.TrimSpace(os.Getenv("OPENTODO_GOOGLE_CLIENT_ID")), ClientSecret: strings.TrimSpace(os.Getenv("OPENTODO_GOOGLE_CLIENT_SECRET"))}
	if f := strings.TrimSpace(os.Getenv("OPENTODO_GOOGLE_CLIENT_SECRET_FILE")); f != "" {
		if g.ClientSecret != "" {
			return fmt.Errorf("set only one of OPENTODO_GOOGLE_CLIENT_SECRET and OPENTODO_GOOGLE_CLIENT_SECRET_FILE")
		}
		raw, err := os.ReadFile(f)
		if err != nil {
			return fmt.Errorf("OPENTODO_GOOGLE_CLIENT_SECRET_FILE: %w", err)
		}
		if g.ClientSecret = strings.TrimSpace(string(raw)); g.ClientSecret == "" {
			return fmt.Errorf("OPENTODO_GOOGLE_CLIENT_SECRET_FILE: file %s is empty", f)
		}
	}
	if (g.ClientID == "") != (g.ClientSecret == "") {
		return fmt.Errorf("OPENTODO_GOOGLE_CLIENT_ID and a client secret (OPENTODO_GOOGLE_CLIENT_SECRET or OPENTODO_GOOGLE_CLIENT_SECRET_FILE) go together")
	}
	c.Google = g
	return nil
}
