package config

import (
	"strings"
	"testing"
	"time"
)

func TestHostConfig(t *testing.T) {
	token := strings.Repeat("t", MinHostTokenLen)
	t.Run("unset is a normal server", func(t *testing.T) {
		c, err := Load()
		if err != nil || c.Host != nil {
			t.Fatalf("Load() = %+v, %v", c.Host, err)
		}
	})
	t.Run("defaults", func(t *testing.T) {
		t.Setenv("OPENTODO_HOST_URL", "https://Example.Cloud/")
		t.Setenv("OPENTODO_HOST_TOKEN", token)
		c, err := Load()
		if err != nil {
			t.Fatal(err)
		}
		h := c.Host
		if h.URL.String() != "https://example.cloud" || h.OperatorAddr != DefaultOperatorAddr || h.MaxOpen != DefaultHostMaxOpen ||
			h.IdleTimeout != DefaultHostIdleMinutes*time.Minute || h.Limits != (Limits{}) {
			t.Fatalf("host = %+v", h)
		}
		if got := h.TenantURL("smith").String(); got != "https://smith.example.cloud" {
			t.Fatalf("tenant url = %s", got)
		}
	})
	t.Run("everything set", func(t *testing.T) {
		t.Setenv("OPENTODO_HOST_URL", "http://localtest.me:8080")
		t.Setenv("OPENTODO_HOST_TOKEN", token)
		t.Setenv("OPENTODO_HOST_OPERATOR_ADDR", "10.0.0.2:9000")
		t.Setenv("OPENTODO_HOST_IDLE_MINUTES", "30")
		t.Setenv("OPENTODO_HOST_MAX_OPEN", "20")
		t.Setenv("OPENTODO_HOST_LIMITS", "db_mb=500, ops_per_hour=5000,ops_total=1000000,requests_per_minute=600,import_mb=10,members=5")
		c, err := Load()
		if err != nil {
			t.Fatal(err)
		}
		want := Limits{DBMB: 500, OpsPerHour: 5000, OpsTotal: 1000000, RequestsPerMinute: 600, ImportMB: 10, Members: 5}
		if c.Host.Limits != want || c.Host.MaxOpen != 20 || c.Host.IdleTimeout != 30*time.Minute || c.Host.OperatorAddr != "10.0.0.2:9000" {
			t.Fatalf("host = %+v", c.Host)
		}
		if got := c.Host.TenantURL("a").String(); got != "http://a.localtest.me:8080" {
			t.Fatalf("tenant url = %s", got)
		}
		if m := want.Merge(Limits{Members: 50}); m.Members != 50 || m.DBMB != 500 {
			t.Fatalf("merge = %+v", m)
		}
	})
	for name, env := range map[string]map[string]string{
		"token missing":     {"OPENTODO_HOST_URL": "https://example.cloud"},
		"token short":       {"OPENTODO_HOST_URL": "https://example.cloud", "OPENTODO_HOST_TOKEN": "short"},
		"url with path":     {"OPENTODO_HOST_URL": "https://example.cloud/app", "OPENTODO_HOST_TOKEN": token},
		"url without host":  {"OPENTODO_HOST_URL": "example.cloud", "OPENTODO_HOST_TOKEN": token},
		"unknown limit":     {"OPENTODO_HOST_URL": "https://example.cloud", "OPENTODO_HOST_TOKEN": token, "OPENTODO_HOST_LIMITS": "disk=1"},
		"negative limit":    {"OPENTODO_HOST_URL": "https://example.cloud", "OPENTODO_HOST_TOKEN": token, "OPENTODO_HOST_LIMITS": "members=-1"},
		"bad idle":          {"OPENTODO_HOST_URL": "https://example.cloud", "OPENTODO_HOST_TOKEN": token, "OPENTODO_HOST_IDLE_MINUTES": "0"},
		"with demo":         {"OPENTODO_HOST_URL": "https://example.cloud", "OPENTODO_HOST_TOKEN": token, "OPENTODO_DEMO": "true"},
		"token without url": {"OPENTODO_HOST_TOKEN": token},
	} {
		t.Run(name, func(t *testing.T) {
			for k, v := range env {
				t.Setenv(k, v)
			}
			if _, err := Load(); err == nil {
				t.Fatal("accepted")
			}
		})
	}
}
