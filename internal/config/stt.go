package config

import (
	"fmt"
	"net/url"
	"os"
	"strings"
)

// STTConfig holds the optional speech-to-text overrides (OpenSpec change
// settings-refresh, design D7): OPENTODO_STT_URL, OPENTODO_STT_MODEL and
// OPENTODO_STT_KEY_FILE. None is required; a set one makes its field read-only
// in Settings → Server → Speech to text.
type STTConfig struct {
	URL   string
	Model string
	// Key is read from OPENTODO_STT_KEY_FILE; KeyFromEnv says it was.
	Key        string
	KeyFromEnv bool
}

// loadSTT reads the speech-to-text variables; a URL that is not http(s) or an
// unreadable key file stops startup naming the variable.
func (c *Config) loadSTT() error {
	if raw := strings.TrimSpace(os.Getenv("OPENTODO_STT_URL")); raw != "" {
		u, err := url.Parse(raw)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
			return fmt.Errorf("OPENTODO_STT_URL must be an http or https address, got %q", raw)
		}
		c.STT.URL = strings.TrimRight(raw, "/")
	}
	c.STT.Model = strings.TrimSpace(os.Getenv("OPENTODO_STT_MODEL"))
	if f := strings.TrimSpace(os.Getenv("OPENTODO_STT_KEY_FILE")); f != "" {
		b, err := os.ReadFile(f)
		if err != nil {
			return fmt.Errorf("OPENTODO_STT_KEY_FILE: %w", err)
		}
		c.STT.Key, c.STT.KeyFromEnv = strings.TrimSpace(string(b)), true
	}
	return nil
}
