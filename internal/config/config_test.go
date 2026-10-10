package config

import (
	"net/url"
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
