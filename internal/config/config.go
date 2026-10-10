// Package config loads runtime configuration from environment variables.
// Every setting has a default so the binary runs with no configuration at all.
package config

import (
	"fmt"
	"log/slog"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config is the fully resolved runtime configuration.
type Config struct {
	Addr        string
	DataDir     string
	BaseURL     *url.URL // nil when not configured
	AllowSignup bool
	SessionTTL  time.Duration
	LogLevel    slog.Level
	// WebhooksAllowPrivate presets the owner's "allow private network targets"
	// webhook policy on first start only (nil when OPENTODO_WEBHOOKS_ALLOW_PRIVATE
	// is unset). Afterwards the value set in Settings is authoritative.
	WebhooksAllowPrivate *bool
}

// Load reads OPENTODO_* variables from the environment.
func Load() (Config, error) {
	c := Config{
		Addr:       getenv("OPENTODO_ADDR", ":8080"),
		DataDir:    getenv("OPENTODO_DATA_DIR", "./data"),
		SessionTTL: 90 * 24 * time.Hour,
		LogLevel:   slog.LevelInfo,
	}
	if v := strings.TrimSpace(os.Getenv("OPENTODO_BASE_URL")); v != "" {
		u, err := url.Parse(v)
		if err != nil || u.Scheme == "" || u.Host == "" {
			return c, fmt.Errorf("OPENTODO_BASE_URL must be an absolute URL, got %q", v)
		}
		c.BaseURL = u
	}
	if v := os.Getenv("OPENTODO_ALLOW_SIGNUP"); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			return c, fmt.Errorf("OPENTODO_ALLOW_SIGNUP must be true or false, got %q", v)
		}
		c.AllowSignup = b
	}
	if v := os.Getenv("OPENTODO_SESSION_DAYS"); v != "" {
		d, err := strconv.Atoi(v)
		if err != nil || d < 1 {
			return c, fmt.Errorf("OPENTODO_SESSION_DAYS must be a positive integer, got %q", v)
		}
		c.SessionTTL = time.Duration(d) * 24 * time.Hour
	}
	if v := strings.TrimSpace(os.Getenv("OPENTODO_WEBHOOKS_ALLOW_PRIVATE")); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			return c, fmt.Errorf("OPENTODO_WEBHOOKS_ALLOW_PRIVATE must be true or false, got %q", v)
		}
		c.WebhooksAllowPrivate = &b
	}
	switch strings.ToLower(getenv("OPENTODO_LOG_LEVEL", "info")) {
	case "debug":
		c.LogLevel = slog.LevelDebug
	case "info":
		c.LogLevel = slog.LevelInfo
	case "warn", "warning":
		c.LogLevel = slog.LevelWarn
	case "error":
		c.LogLevel = slog.LevelError
	default:
		return c, fmt.Errorf("OPENTODO_LOG_LEVEL must be debug, info, warn or error")
	}
	return c, nil
}

// SecureCookies reports whether session cookies must carry the Secure flag.
func (c Config) SecureCookies() bool {
	return c.BaseURL != nil && c.BaseURL.Scheme == "https"
}

// Origin returns the configured public origin (scheme://host) or "".
func (c Config) Origin() string {
	if c.BaseURL == nil {
		return ""
	}
	return c.BaseURL.Scheme + "://" + c.BaseURL.Host
}

// RPID returns the WebAuthn relying-party identifier: the host of the public
// base URL without port, or "" when no base URL is configured.
func (c Config) RPID() string {
	if c.BaseURL == nil {
		return ""
	}
	return strings.ToLower(c.BaseURL.Hostname())
}

// PasskeysAvailable reports whether passkey ceremonies can be offered. Browsers
// only allow them on secure origins, so this needs an https base URL, or a
// localhost development origin which browsers treat as secure.
func (c Config) PasskeysAvailable() bool {
	if c.BaseURL == nil {
		return false
	}
	if c.BaseURL.Scheme == "https" {
		return c.BaseURL.Hostname() != ""
	}
	if c.BaseURL.Scheme != "http" {
		return false
	}
	switch strings.ToLower(c.BaseURL.Hostname()) {
	case "localhost", "127.0.0.1", "::1":
		return true
	}
	return false
}

func getenv(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}
