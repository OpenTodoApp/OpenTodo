package config

import (
	"fmt"
	"net/url"
	"os"
	"strings"
)

// loadCORS reads OPENTODO_CORS_ORIGINS (OpenSpec change cors-for-tokens): a
// comma-separated list of exact origins whose pages may call /api/v1/ with an
// API token. Unset is off. An entry that is not an origin stops startup.
func (c *Config) loadCORS() error {
	raw := strings.TrimSpace(os.Getenv("OPENTODO_CORS_ORIGINS"))
	if raw == "" {
		return nil
	}
	for _, entry := range strings.Split(raw, ",") {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}
		o, ok := ParseOrigin(entry)
		if !ok {
			return fmt.Errorf("OPENTODO_CORS_ORIGINS must list exact origins such as https://dash.example.com, separated by commas (no path, no wildcard), got %q", entry)
		}
		c.CORSOrigins = append(c.CORSOrigins, o)
	}
	return nil
}

// ParseOrigin returns s as a browser writes it in the Origin header: http or
// https, a host, an optional port, lower case, without the scheme's default
// port. A path other than "/", a query, a fragment, credentials or a wildcard
// is not an origin.
func ParseOrigin(s string) (string, bool) {
	if strings.Contains(s, "*") {
		return "", false
	}
	u, err := url.Parse(s)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" || u.User != nil ||
		(u.Path != "" && u.Path != "/") || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" || u.Opaque != "" {
		return "", false
	}
	scheme, host, port := strings.ToLower(u.Scheme), strings.ToLower(u.Hostname()), u.Port()
	if strings.Contains(host, ":") {
		host = "[" + host + "]"
	}
	if port == "" || (scheme == "http" && port == "80") || (scheme == "https" && port == "443") {
		return scheme + "://" + host, true
	}
	return scheme + "://" + host + ":" + port, true
}
