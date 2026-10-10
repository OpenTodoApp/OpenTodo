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
	// Backup holds the optional OPENTODO_BACKUP_* presets (see backup.go).
	Backup BackupPreset
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

func getenv(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}
