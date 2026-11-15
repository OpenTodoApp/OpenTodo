package config

import (
	"reflect"
	"strings"
	"testing"
)

// cors-for-tokens: OPENTODO_CORS_ORIGINS is optional; each entry must be an
// exact origin, or startup stops naming the variable.
func TestCORSOrigins(t *testing.T) {
	for _, c := range []struct {
		name, raw string
		want      []string
		err       bool
	}{
		{name: "unset"},
		{name: "one", raw: "https://dash.example.com", want: []string{"https://dash.example.com"}},
		{name: "list", raw: " https://dash.example.com, http://localhost:5173 ,", want: []string{"https://dash.example.com", "http://localhost:5173"}},
		{name: "normalised", raw: "HTTPS://Dash.Example.com:443/", want: []string{"https://dash.example.com"}},
		{name: "ipv6", raw: "http://[::1]:8000", want: []string{"http://[::1]:8000"}},
		{name: "wildcard", raw: "*", err: true},
		{name: "wildcard host", raw: "https://*.example.com", err: true},
		{name: "path", raw: "https://dash.example.com/app", err: true},
		{name: "query", raw: "https://dash.example.com?x=1", err: true},
		{name: "no scheme", raw: "dash.example.com", err: true},
		{name: "other scheme", raw: "ftp://dash.example.com", err: true},
		{name: "null", raw: "null", err: true},
		{name: "credentials", raw: "https://u:p@dash.example.com", err: true},
		{name: "one bad entry", raw: "https://dash.example.com,https://x.example/path", err: true},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Setenv("OPENTODO_CORS_ORIGINS", c.raw)
			cfg, err := Load()
			if c.err {
				if err == nil || !strings.Contains(err.Error(), "OPENTODO_CORS_ORIGINS") {
					t.Fatalf("err = %v, want one naming OPENTODO_CORS_ORIGINS", err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(cfg.CORSOrigins, c.want) {
				t.Fatalf("origins = %v, want %v", cfg.CORSOrigins, c.want)
			}
		})
	}
}

// A demo has no API tokens and host mode has many owners: CORS is refused there.
func TestCORSOriginsNotWithDemoOrHost(t *testing.T) {
	t.Setenv("OPENTODO_CORS_ORIGINS", "https://dash.example.com")
	t.Setenv("OPENTODO_DEMO", "true")
	if _, err := Load(); err == nil || !strings.Contains(err.Error(), "OPENTODO_CORS_ORIGINS") {
		t.Fatalf("demo: err = %v", err)
	}
	t.Setenv("OPENTODO_DEMO", "")
	t.Setenv("OPENTODO_HOST_URL", "https://example.cloud")
	t.Setenv("OPENTODO_HOST_TOKEN", strings.Repeat("h", MinHostTokenLen))
	if _, err := Load(); err == nil || !strings.Contains(err.Error(), "OPENTODO_CORS_ORIGINS") {
		t.Fatalf("host: err = %v", err)
	}
}
