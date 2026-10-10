package cli

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Profile is one named server connection.
type Profile struct {
	URL    string `json:"url"`
	Token  string `json:"token,omitempty"`
	Output string `json:"output,omitempty"`
}

// Config is the on-disk configuration file: a default profile name and the profiles.
type Config struct {
	Default  string             `json:"default,omitempty"`
	Profiles map[string]Profile `json:"profiles"`
}

// defaultProfile is the profile name used when neither --profile nor the file names one.
const defaultProfile = "default"

// DefaultConfigPath returns <user config dir>/opentodo/config.json, honouring the
// optional OPENTODO_CONFIG override. The error is deferred to the first use so that
// commands which do not need a config file (help, version) still work.
func DefaultConfigPath(getenv func(string) string) (string, error) {
	if p := getenv("OPENTODO_CONFIG"); p != "" {
		return p, nil
	}
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("cannot determine the user config directory: %w", err)
	}
	return filepath.Join(dir, "opentodo", "config.json"), nil
}

// loadConfig reads the file; a missing file yields an empty config, not an error.
func loadConfig(path string) (*Config, error) {
	cfg := &Config{Profiles: map[string]Profile{}}
	if path == "" {
		return cfg, nil
	}
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return cfg, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", path, err)
	}
	if err := json.Unmarshal(raw, cfg); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	if cfg.Profiles == nil {
		cfg.Profiles = map[string]Profile{}
	}
	return cfg, nil
}

// saveConfig writes the file with owner-only permissions (0700 directory, 0600 file),
// replacing it atomically so a crash never leaves a half-written token behind.
func saveConfig(path string, cfg *Config) error {
	if path == "" {
		return errors.New("no config path")
	}
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return fmt.Errorf("create %s: %w", dir, err)
	}
	// MkdirAll leaves pre-existing directories alone; tighten them anyway.
	_ = os.Chmod(dir, 0o700)
	raw, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, append(raw, '\n'), 0o600); err != nil {
		return fmt.Errorf("write %s: %w", tmp, err)
	}
	_ = os.Chmod(tmp, 0o600)
	if err := os.Rename(tmp, path); err != nil {
		os.Remove(tmp)
		return fmt.Errorf("write %s: %w", path, err)
	}
	return nil
}

// target is the resolved connection a command runs against.
type target struct {
	Profile string
	URL     string
	Token   string
	Output  string
}

// profileName picks the profile: --profile, then OPENTODO_PROFILE, then the file's
// default, then "default".
func profileName(flagValue string, getenv func(string) string, cfg *Config) string {
	switch {
	case flagValue != "":
		return flagValue
	case getenv("OPENTODO_PROFILE") != "":
		return getenv("OPENTODO_PROFILE")
	case cfg != nil && cfg.Default != "":
		return cfg.Default
	}
	return defaultProfile
}

// resolveTarget applies the precedence flags > environment > profile.
func resolveTarget(g *globalFlags, getenv func(string) string, cfg *Config) target {
	name := profileName(g.profile, getenv, cfg)
	t := target{Profile: name}
	if cfg != nil {
		if p, ok := cfg.Profiles[name]; ok {
			t.URL, t.Token, t.Output = p.URL, p.Token, p.Output
		}
	}
	if v := getenv("OPENTODO_URL"); v != "" {
		t.URL = v
	}
	if v := getenv("OPENTODO_TOKEN"); v != "" {
		t.Token = v
	}
	if g.server != "" {
		t.URL = g.server
	}
	t.URL = strings.TrimRight(t.URL, "/")
	return t
}
