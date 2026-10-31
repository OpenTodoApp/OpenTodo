package config

import (
	"fmt"
	"os"
	"strings"
)

// MicrosoftConfig holds the optional Microsoft app registration of calendar
// sync (OpenSpec change outlook-calendar-sync, design D2):
// OPENTODO_MICROSOFT_CLIENT_ID and OPENTODO_MICROSOFT_CLIENT_SECRET or
// OPENTODO_MICROSOFT_CLIENT_SECRET_FILE, and OPENTODO_MICROSOFT_TENANT. None is
// required; when the id and a secret are set they replace the client stored in
// Settings and make it read-only there. The tenant is checked by calendar sync
// ("common" when empty).
type MicrosoftConfig struct {
	ClientID     string
	ClientSecret string
	Tenant       string
}

// Set reports whether the environment configures the client.
func (m MicrosoftConfig) Set() bool { return m.ClientID != "" && m.ClientSecret != "" }

// loadMicrosoft reads the Microsoft client variables. Only one of the two
// secret variables may be set, and an id needs a secret (and the reverse).
func (c *Config) loadMicrosoft() error {
	m := MicrosoftConfig{ClientID: strings.TrimSpace(os.Getenv("OPENTODO_MICROSOFT_CLIENT_ID")),
		ClientSecret: strings.TrimSpace(os.Getenv("OPENTODO_MICROSOFT_CLIENT_SECRET")),
		Tenant:       strings.TrimSpace(os.Getenv("OPENTODO_MICROSOFT_TENANT"))}
	if f := strings.TrimSpace(os.Getenv("OPENTODO_MICROSOFT_CLIENT_SECRET_FILE")); f != "" {
		if m.ClientSecret != "" {
			return fmt.Errorf("set only one of OPENTODO_MICROSOFT_CLIENT_SECRET and OPENTODO_MICROSOFT_CLIENT_SECRET_FILE")
		}
		raw, err := os.ReadFile(f)
		if err != nil {
			return fmt.Errorf("OPENTODO_MICROSOFT_CLIENT_SECRET_FILE: %w", err)
		}
		if m.ClientSecret = strings.TrimSpace(string(raw)); m.ClientSecret == "" {
			return fmt.Errorf("OPENTODO_MICROSOFT_CLIENT_SECRET_FILE: file %s is empty", f)
		}
	}
	if (m.ClientID == "") != (m.ClientSecret == "") {
		return fmt.Errorf("OPENTODO_MICROSOFT_CLIENT_ID and a client secret (OPENTODO_MICROSOFT_CLIENT_SECRET or OPENTODO_MICROSOFT_CLIENT_SECRET_FILE) go together")
	}
	c.Microsoft = m
	return nil
}
