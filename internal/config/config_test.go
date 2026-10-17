package config

import (
	"bytes"
	"fmt"
	"log/slog"
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

func TestMCPPresetIsOptional(t *testing.T) {
	t.Setenv("OPENTODO_MCP", "")
	c, err := Load()
	if err != nil || c.MCP != nil {
		t.Fatalf("unset variable must leave MCP to Settings: %v %v", c.MCP, err)
	}
	t.Setenv("OPENTODO_MCP", "true")
	if c, err = Load(); err != nil || c.MCP == nil || !*c.MCP {
		t.Fatalf("true: %v %v", c.MCP, err)
	}
	t.Setenv("OPENTODO_MCP", "maybe")
	if _, err = Load(); err == nil || !strings.Contains(err.Error(), "OPENTODO_MCP") {
		t.Fatalf("invalid value: %v", err)
	}
}

func TestCaldavPresetIsOptional(t *testing.T) {
	t.Setenv("OPENTODO_CALDAV", "")
	c, err := Load()
	if err != nil || c.CalDAV != nil {
		t.Fatalf("unset: %v %v", c.CalDAV, err)
	}
	t.Setenv("OPENTODO_CALDAV", "true")
	c, err = Load()
	if err != nil || c.CalDAV == nil || !*c.CalDAV {
		t.Fatalf("true: %v %v", c.CalDAV, err)
	}
	t.Setenv("OPENTODO_CALDAV", "maybe")
	if _, err = Load(); err == nil || !strings.Contains(err.Error(), "OPENTODO_CALDAV") {
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

func TestPushSwitchIsOptional(t *testing.T) {
	t.Setenv("OPENTODO_PUSH", "")
	c, err := Load()
	if err != nil || c.PushDisabled {
		t.Fatalf("default: %v disabled=%v", err, c.PushDisabled)
	}
	t.Setenv("OPENTODO_PUSH", "off")
	if c, err = Load(); err != nil || !c.PushDisabled {
		t.Fatalf("off: %v disabled=%v", err, c.PushDisabled)
	}
	t.Setenv("OPENTODO_PUSH", "maybe")
	if _, err = Load(); err == nil {
		t.Fatal("invalid OPENTODO_PUSH accepted")
	}
}

func TestDemoSwitchIsOptional(t *testing.T) {
	t.Setenv("OPENTODO_DEMO", "")
	c, err := Load()
	if err != nil || c.Demo {
		t.Fatalf("default: %v demo=%v", err, c.Demo)
	}
	t.Setenv("OPENTODO_DEMO", "true")
	if c, err = Load(); err != nil || !c.Demo {
		t.Fatalf("true: %v demo=%v", err, c.Demo)
	}
	t.Setenv("OPENTODO_DEMO", "sometimes")
	if _, err = Load(); err == nil {
		t.Fatal("invalid OPENTODO_DEMO accepted")
	}
	// Optional sandbox tuning (demo-sandboxes D3).
	t.Setenv("OPENTODO_DEMO", "true")
	t.Setenv("OPENTODO_DEMO_MAX_SANDBOXES", "50")
	t.Setenv("OPENTODO_DEMO_MAX_DB_MB", "200")
	if c, err = Load(); err != nil || c.DemoMaxSandboxes != 50 || c.DemoMaxDBMB != 200 {
		t.Fatalf("tuning: %v %d %d", err, c.DemoMaxSandboxes, c.DemoMaxDBMB)
	}
	t.Setenv("OPENTODO_DEMO_MAX_SANDBOXES", "0")
	if _, err = Load(); err == nil {
		t.Fatal("OPENTODO_DEMO_MAX_SANDBOXES=0 accepted")
	}
}

func TestConfigRejectsInvalidRetention(t *testing.T) {
	t.Setenv("OPENTODO_TRASH_RETENTION_DAYS", "")
	c, err := Load()
	if err != nil || c.TrashRetentionDays != 30 {
		t.Fatalf("default = %d, %v", c.TrashRetentionDays, err)
	}
	for _, ok := range []string{"0", "7", "365"} {
		t.Setenv("OPENTODO_TRASH_RETENTION_DAYS", ok)
		c, err := Load()
		n, _ := strconv.Atoi(ok)
		if err != nil || c.TrashRetentionDays != n {
			t.Fatalf("%s: %v %d", ok, err, c.TrashRetentionDays)
		}
	}
	for _, bad := range []string{"soon", "-1", "1.5", "99999"} {
		t.Setenv("OPENTODO_TRASH_RETENTION_DAYS", bad)
		if _, err := Load(); err == nil || !strings.Contains(err.Error(), "OPENTODO_TRASH_RETENTION_DAYS") {
			t.Fatalf("%q: err = %v", bad, err)
		}
	}
}

// TestTrustedProxiesLenient (trusted-proxies-lenient): invalid entries never
// stop startup; they are left out, listed, and reported as one warning.
func TestTrustedProxiesLenient(t *testing.T) {
	cases := []struct {
		raw        string
		applied    []string
		invalid    []string
		cloudflare bool
		hint       bool
	}{
		{"cloudflare", []string{"cloudflare"}, nil, true, false},
		{"CloudFlare", []string{"cloudflare"}, nil, true, false},
		{"cloudflar", nil, []string{"cloudflar"}, false, true},
		{"cluodflare, 10.0.0.1", []string{"10.0.0.1"}, []string{"cluodflare"}, false, true},
		{"cloudflare, nope, 192.0.2.0/24", []string{"cloudflare", "192.0.2.0/24"}, []string{"nope"}, true, false},
		{" 192.0.2.1 \t2001:db8::/32,,\n203.0.113.0/24 ", []string{"192.0.2.1", "2001:db8::/32", "203.0.113.0/24"}, nil, false, false},
		{"10.0.0.0/99 1.2.3", nil, []string{"10.0.0.0/99", "1.2.3"}, false, false},
		{"cloudflareX", nil, []string{"cloudflareX"}, false, true},
		{"cdn", nil, []string{"cdn"}, false, false},
	}
	for _, c := range cases {
		tp := ParseTrustedProxies(c.raw)
		if fmt.Sprint(tp.Applied) != fmt.Sprint(c.applied) || fmt.Sprint(tp.Invalid) != fmt.Sprint(c.invalid) ||
			tp.Cloudflare != c.cloudflare || (tp.Hint != "") != c.hint {
			t.Errorf("%q: got %+v", c.raw, tp)
		}
		_, warn := tp.Warning()
		if warn != (len(c.invalid) > 0) {
			t.Errorf("%q: warning %v", c.raw, warn)
		}
	}
	if n := len(ParseTrustedProxies("cloudflare cloudflare private").Prefixes); n != len(CloudflareRanges)+len(PrivateRanges) {
		t.Errorf("keyword twice: %d prefixes", n)
	}

	// Load: the server starts, keeps the valid entries and records one warning.
	t.Setenv("OPENTODO_TRUSTED_PROXIES", "cloudflar, 10.2.0.0/16")
	c, err := Load()
	if err != nil {
		t.Fatalf("invalid entry stopped startup: %v", err)
	}
	if c.TrustCloudflare || len(c.TrustedProxies) != 1 || c.TrustedProxies[0].String() != "10.2.0.0/16" {
		t.Fatalf("applied: %v %v", c.TrustCloudflare, c.TrustedProxies)
	}
	if len(c.Warnings) != 1 || c.Warnings[0].Variable != "OPENTODO_TRUSTED_PROXIES" ||
		!strings.Contains(c.Warnings[0].Message, `"cloudflar"`) || !strings.Contains(c.Warnings[0].Message, `did you mean "cloudflare"?`) ||
		!strings.Contains(c.Warnings[0].Message, "Still applied: 10.2.0.0/16") {
		t.Fatalf("warnings: %+v", c.Warnings)
	}
	var buf bytes.Buffer
	c.LogWarnings(slog.New(slog.NewTextHandler(&buf, nil)))
	line := buf.String()
	if strings.Count(line, "\n") != 1 || !strings.Contains(line, "level=ERROR") || !strings.Contains(line, "invalid=cloudflar") ||
		!strings.Contains(line, "applied=10.2.0.0/16") || !strings.Contains(line, "cloudflare") {
		t.Fatalf("log: %s", line)
	}

	// All invalid equals unset.
	t.Setenv("OPENTODO_TRUSTED_PROXIES", "cloudflar")
	if c, err = Load(); err != nil || len(c.TrustedProxies) != 0 || c.TrustCloudflare || len(c.Warnings) != 1 ||
		!strings.Contains(c.Warnings[0].Message, "as when the variable is unset") {
		t.Fatalf("all invalid: %v %+v", err, c)
	}
	t.Setenv("OPENTODO_TRUSTED_PROXIES", "cloudflare")
	if c, err = Load(); err != nil || len(c.Warnings) != 0 || !c.TrustCloudflare {
		t.Fatalf("valid: %v %+v", err, c.Warnings)
	}
}

// TestTrustedProxiesPrivateKeyword (trusted-client-identity): "private" names
// the default set, and a list without any local proxy is warned about, since
// it replaces the default.
func TestTrustedProxiesPrivateKeyword(t *testing.T) {
	tp := ParseTrustedProxies("Private, 192.0.2.1")
	if !tp.Private || len(tp.Prefixes) != len(PrivateRanges)+1 || fmt.Sprint(tp.Applied) != "[private 192.0.2.1]" {
		t.Fatalf("private: %+v", tp)
	}
	if _, warn := tp.NoLocalProxyWarning(); warn {
		t.Fatal("warning with private listed")
	}
	if tp := ParseTrustedProxies("privat"); tp.Hint != `did you mean "private"?` {
		t.Fatalf("hint: %+v", tp)
	}
	for raw, want := range map[string]bool{"cloudflare": false, "192.0.2.0/24": true, "192.0.2.0/24, private": false, "172.18.0.0/16": false, "127.0.0.1": false, "nope": false} {
		if _, warn := ParseTrustedProxies(raw).NoLocalProxyWarning(); warn != want {
			t.Errorf("%q: no-local-proxy warning %v, want %v", raw, warn, want)
		}
	}
	// "cloudflare" keeps the default, so the documented setting needs nothing more.
	if tp := ParseTrustedProxies("cloudflare"); !tp.Private || len(tp.Prefixes) != len(CloudflareRanges)+len(PrivateRanges) {
		t.Fatalf("cloudflare: %+v", tp)
	}
	t.Setenv("OPENTODO_TRUSTED_PROXIES", "203.0.113.10")
	c, err := Load()
	if err != nil || len(c.Warnings) != 1 || !strings.Contains(c.Warnings[0].Message, `add "private"`) {
		t.Fatalf("public proxy only: %v %+v", err, c.Warnings)
	}
	var buf bytes.Buffer
	c.LogWarnings(slog.New(slog.NewTextHandler(&buf, nil)))
	if !strings.Contains(buf.String(), "no local proxy is trusted") {
		t.Fatalf("log: %s", buf.String())
	}
}

func TestSetupTokenValidation(t *testing.T) {
	t.Setenv("OPENTODO_SETUP_TOKEN", "")
	c, err := Load()
	if err != nil || c.SetupToken != "" {
		t.Fatalf("unset: token %q, err %v", c.SetupToken, err)
	}

	t.Setenv("OPENTODO_SETUP_TOKEN", "too-short")
	if _, err := Load(); err == nil || !strings.Contains(err.Error(), "OPENTODO_SETUP_TOKEN") {
		t.Fatalf("short token: want an error naming the variable, got %v", err)
	}

	t.Setenv("OPENTODO_SETUP_TOKEN", "  0123456789abcdef  ")
	c, err = Load()
	if err != nil || c.SetupToken != "0123456789abcdef" {
		t.Fatalf("valid token: got %q, err %v", c.SetupToken, err)
	}
}
