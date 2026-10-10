package config

import (
	"net/url"
	"strconv"
	"strings"
	"testing"
)

func TestPasskeyAvailabilityByBaseURL(t *testing.T) {
	cases := []struct {
		base      string
		available bool
		rpID      string
	}{
		{"", false, ""},
		{"https://todo.example.com", true, "todo.example.com"},
		{"https://Todo.Example.com:8443/app", true, "todo.example.com"},
		{"http://192.168.1.10:8080", false, "192.168.1.10"},
		{"http://todo.example.com", false, "todo.example.com"},
		{"http://localhost:8080", true, "localhost"},
		{"http://127.0.0.1:5173", true, "127.0.0.1"},
		{"http://[::1]:8080", true, "::1"},
	}
	for _, tc := range cases {
		t.Run(tc.base, func(t *testing.T) {
			c := Config{}
			if tc.base != "" {
				u, err := url.Parse(tc.base)
				if err != nil {
					t.Fatal(err)
				}
				c.BaseURL = u
			}
			if got := c.PasskeysAvailable(); got != tc.available {
				t.Fatalf("PasskeysAvailable() = %v, want %v", got, tc.available)
			}
			if got := c.RPID(); got != tc.rpID {
				t.Fatalf("RPID() = %q, want %q", got, tc.rpID)
			}
		})
	}
}

func TestLoadBaseURL(t *testing.T) {
	t.Setenv("OPENTODO_BASE_URL", "https://todo.example.com")
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if !c.PasskeysAvailable() || !c.SecureCookies() || c.Origin() != "https://todo.example.com" {
		t.Fatalf("config = %+v", c)
	}
	t.Setenv("OPENTODO_BASE_URL", "todo.example.com")
	if _, err := Load(); err == nil {
		t.Fatal("relative base URL accepted")
	}
}

func TestWebhooksAllowPrivateIsOptional(t *testing.T) {
	t.Setenv("OPENTODO_WEBHOOKS_ALLOW_PRIVATE", "")
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if c.WebhooksAllowPrivate != nil {
		t.Fatal("unset variable must leave the policy to Settings")
	}

	t.Setenv("OPENTODO_WEBHOOKS_ALLOW_PRIVATE", "true")
	c, err = Load()
	if err != nil || c.WebhooksAllowPrivate == nil || !*c.WebhooksAllowPrivate {
		t.Fatalf("true: %v %v", c.WebhooksAllowPrivate, err)
	}

	t.Setenv("OPENTODO_WEBHOOKS_ALLOW_PRIVATE", "sometimes")
	if _, err = Load(); err == nil || !strings.Contains(err.Error(), "OPENTODO_WEBHOOKS_ALLOW_PRIVATE") {
		t.Fatalf("invalid value: %v", err)
	}
}

func TestConfigImportMaxMB(t *testing.T) {
	t.Setenv("OPENTODO_IMPORT_MAX_MB", "")
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if c.ImportMaxMB != 20 || c.ImportMaxBytes() != 20<<20 {
		t.Fatalf("default = %d MB", c.ImportMaxMB)
	}
	if (Config{}).ImportMaxBytes() != 20<<20 {
		t.Fatal("zero Config must use the default limit")
	}
	for _, ok := range []string{"1", "64", "200"} {
		t.Setenv("OPENTODO_IMPORT_MAX_MB", ok)
		c, err := Load()
		n, _ := strconv.Atoi(ok)
		if err != nil || c.ImportMaxBytes() != int64(n)<<20 {
			t.Fatalf("%s: %v %d", ok, err, c.ImportMaxMB)
		}
	}
	// An invalid value stops startup with an error naming the variable.
	for _, bad := range []string{"0", "201", "-3", "ten", "1.5"} {
		t.Setenv("OPENTODO_IMPORT_MAX_MB", bad)
		if _, err := Load(); err == nil || !strings.Contains(err.Error(), "OPENTODO_IMPORT_MAX_MB") {
			t.Fatalf("%q: err = %v", bad, err)
		}
	}
}
