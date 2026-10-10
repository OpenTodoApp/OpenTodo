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
	// ImportMaxMB caps the size of an uploaded import file (OPENTODO_IMPORT_MAX_MB).
	ImportMaxMB int
	// WebhooksAllowPrivate presets the owner's "allow private network targets"
	// webhook policy on first start only (nil when OPENTODO_WEBHOOKS_ALLOW_PRIVATE
	// is unset). Afterwards the value set in Settings is authoritative.
	WebhooksAllowPrivate *bool
	// Backup holds the optional OPENTODO_BACKUP_* presets (see backup.go).
	Backup BackupPreset
	// PushDisabled turns web push off (OPENTODO_PUSH=off): the /api/v1/push routes
	// answer 404 and the reminder scheduler does not run. Push is on by default.
	PushDisabled bool
	// OIDC holds the optional OPENTODO_OIDC_* overrides of the single sign-on
	// settings (OpenSpec `oidc-login`). Each set variable overrides the value from
	// Settings and locks that field; nothing is required.
	OIDC OIDCEnv
}

// OIDCEnv mirrors oidc.Env (converted by the HTTP layer) so this package stays
// free of feature imports.
type OIDCEnv struct {
	Issuer       string
	ClientID     string
	ClientSecret string
	DisplayName  string
	SSOOnly      *bool
}

// Import file size bounds for OPENTODO_IMPORT_MAX_MB.
const (
	DefaultImportMaxMB = 20
	MaxImportMaxMB     = 200
)

// Load reads OPENTODO_* variables from the environment.
func Load() (Config, error) {
	c := Config{
		Addr:        getenv("OPENTODO_ADDR", ":8080"),
		DataDir:     getenv("OPENTODO_DATA_DIR", "./data"),
		SessionTTL:  90 * 24 * time.Hour,
		LogLevel:    slog.LevelInfo,
		ImportMaxMB: DefaultImportMaxMB,
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
	if v := strings.TrimSpace(os.Getenv("OPENTODO_IMPORT_MAX_MB")); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > MaxImportMaxMB {
			return c, fmt.Errorf("OPENTODO_IMPORT_MAX_MB must be an integer from 1 to %d, got %q", MaxImportMaxMB, v)
		}
		c.ImportMaxMB = n
	}
	if v := strings.TrimSpace(os.Getenv("OPENTODO_WEBHOOKS_ALLOW_PRIVATE")); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			return c, fmt.Errorf("OPENTODO_WEBHOOKS_ALLOW_PRIVATE must be true or false, got %q", v)
		}
		c.WebhooksAllowPrivate = &b
	}
	switch strings.ToLower(strings.TrimSpace(os.Getenv("OPENTODO_PUSH"))) {
	case "", "on", "true", "1", "yes":
	case "off", "false", "0", "no":
		c.PushDisabled = true
	default:
		return c, fmt.Errorf("OPENTODO_PUSH must be on or off, got %q", os.Getenv("OPENTODO_PUSH"))
	}
	c.OIDC = OIDCEnv{
		Issuer:       strings.TrimRight(strings.TrimSpace(os.Getenv("OPENTODO_OIDC_ISSUER")), "/"),
		ClientID:     strings.TrimSpace(os.Getenv("OPENTODO_OIDC_CLIENT_ID")),
		ClientSecret: strings.TrimSpace(os.Getenv("OPENTODO_OIDC_CLIENT_SECRET")),
		DisplayName:  strings.TrimSpace(os.Getenv("OPENTODO_OIDC_DISPLAY_NAME")),
	}
	if c.OIDC.Issuer != "" {
		if u, err := url.Parse(c.OIDC.Issuer); err != nil || u.Scheme != "https" || u.Host == "" {
			return c, fmt.Errorf("OPENTODO_OIDC_ISSUER must be an https URL, got %q", c.OIDC.Issuer)
		}
	}
	if v := strings.TrimSpace(os.Getenv("OPENTODO_OIDC_SSO_ONLY")); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			return c, fmt.Errorf("OPENTODO_OIDC_SSO_ONLY must be true or false, got %q", v)
		}
		c.OIDC.SSOOnly = &b
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
	b, err := loadBackupPreset()
	if err != nil {
		return c, err
	}
	c.Backup = b
	return c, nil
}

// ImportMaxBytes is the import file size limit in bytes; a zero value (a Config
// built by hand, as in tests) means the default.
func (c Config) ImportMaxBytes() int64 {
	mb := c.ImportMaxMB
	if mb <= 0 {
		mb = DefaultImportMaxMB
	}
	return int64(mb) << 20
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
