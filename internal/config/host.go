package config

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// HostConfig holds the optional OPENTODO_HOST_* variables of host mode
// (OpenSpec `multi-tenant-host`): one process serving many tenants, each an
// ordinary data directory under <OPENTODO_DATA_DIR>/tenants, chosen by the
// request's host name. Nil (OPENTODO_HOST_URL unset) is a normal single-tenant
// server.
type HostConfig struct {
	// URL is the public address tenants live under: tenant "smith" of
	// https://example.cloud is https://smith.example.cloud.
	URL *url.URL
	// Token authenticates the operator interface (OPENTODO_HOST_TOKEN).
	Token string
	// OperatorAddr is where the operator interface listens; tenant host names
	// never reach it (OPENTODO_HOST_OPERATOR_ADDR, default 127.0.0.1:8081).
	OperatorAddr string
	// IdleTimeout closes a tenant nobody used for this long (OPENTODO_HOST_IDLE_MINUTES).
	IdleTimeout time.Duration
	// MaxOpen bounds the open tenants (OPENTODO_HOST_MAX_OPEN).
	MaxOpen int
	// Limits are the default per-tenant limits (OPENTODO_HOST_LIMITS); the
	// operator interface can override them per tenant.
	Limits Limits
}

// Limits bound one hosted tenant (design D5). Zero means unlimited.
type Limits struct {
	DBMB              int `json:"dbMb"`
	OpsPerHour        int `json:"opsPerHour"`
	OpsTotal          int `json:"opsTotal"`
	RequestsPerMinute int `json:"requestsPerMinute"`
	ImportMB          int `json:"importMb"`
	Members           int `json:"members"`
	// Workspace limits (OpenSpec change workspaces, "Limits"): lower the
	// defaults of 20 workspaces per account, 200 members and 50 groups per
	// workspace and 100 members per group; 0 keeps the default.
	Workspaces       int `json:"workspaces"`
	WorkspaceMembers int `json:"workspaceMembers"`
	WorkspaceGroups  int `json:"workspaceGroups"`
	GroupMembers     int `json:"groupMembers"`
}

// Host-mode defaults (design D2, open question settled in notes.md).
const (
	DefaultHostIdleMinutes = 10
	DefaultHostMaxOpen     = 500
	DefaultOperatorAddr    = "127.0.0.1:8081"
	// MinHostTokenLen is the shortest accepted OPENTODO_HOST_TOKEN.
	MinHostTokenLen = 32
)

// limitKeys maps OPENTODO_HOST_LIMITS keys to fields.
func (l *Limits) field(key string) *int {
	switch key {
	case "db_mb":
		return &l.DBMB
	case "ops_per_hour":
		return &l.OpsPerHour
	case "ops_total":
		return &l.OpsTotal
	case "requests_per_minute":
		return &l.RequestsPerMinute
	case "import_mb":
		return &l.ImportMB
	case "members":
		return &l.Members
	case "workspaces":
		return &l.Workspaces
	case "workspace_members":
		return &l.WorkspaceMembers
	case "workspace_groups":
		return &l.WorkspaceGroups
	case "group_members":
		return &l.GroupMembers
	}
	return nil
}

// ParseLimits reads "db_mb=500,ops_per_hour=5000,…"; unknown keys and
// negative numbers are errors.
func ParseLimits(raw string) (Limits, error) {
	var l Limits
	for _, part := range strings.Split(raw, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		k, v, ok := strings.Cut(part, "=")
		dst := l.field(strings.TrimSpace(k))
		if !ok || dst == nil {
			return l, fmt.Errorf("unknown limit %q (use db_mb, ops_per_hour, ops_total, requests_per_minute, import_mb, members)", part)
		}
		n, err := strconv.Atoi(strings.TrimSpace(v))
		if err != nil || n < 0 {
			return l, fmt.Errorf("limit %q must be a whole number of at least 0", part)
		}
		*dst = n
	}
	return l, nil
}

// Merge returns l with every non-zero field of o applied (a tenant's
// overrides over the host defaults).
func (l Limits) Merge(o Limits) Limits {
	for _, k := range []string{"db_mb", "ops_per_hour", "ops_total", "requests_per_minute", "import_mb", "members", "workspaces", "workspace_members", "workspace_groups", "group_members"} {
		if v := *o.field(k); v != 0 {
			*l.field(k) = v
		}
	}
	return l
}

// TenantURL is the public address of a tenant.
func (h *HostConfig) TenantURL(name string) *url.URL {
	return &url.URL{Scheme: h.URL.Scheme, Host: name + "." + h.URL.Host}
}

// loadHost parses OPENTODO_HOST_*; nil when host mode is off.
func loadHost() (*HostConfig, error) {
	raw := strings.TrimSpace(os.Getenv("OPENTODO_HOST_URL"))
	if raw == "" {
		for _, v := range []string{"OPENTODO_HOST_TOKEN", "OPENTODO_HOST_OPERATOR_ADDR", "OPENTODO_HOST_IDLE_MINUTES", "OPENTODO_HOST_MAX_OPEN", "OPENTODO_HOST_LIMITS"} {
			if os.Getenv(v) != "" {
				return nil, fmt.Errorf("%s needs OPENTODO_HOST_URL (host mode)", v)
			}
		}
		return nil, nil
	}
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" || u.Hostname() == "" || (u.Path != "" && u.Path != "/") || u.RawQuery != "" || u.User != nil {
		return nil, fmt.Errorf("OPENTODO_HOST_URL must be an http(s) address without a path, like https://example.cloud, got %q", raw)
	}
	h := &HostConfig{URL: &url.URL{Scheme: u.Scheme, Host: strings.ToLower(u.Host)},
		OperatorAddr: DefaultOperatorAddr, IdleTimeout: DefaultHostIdleMinutes * time.Minute, MaxOpen: DefaultHostMaxOpen}
	h.Token = strings.TrimSpace(os.Getenv("OPENTODO_HOST_TOKEN"))
	if len(h.Token) < MinHostTokenLen {
		return nil, fmt.Errorf("host mode needs OPENTODO_HOST_TOKEN of at least %d characters for the operator interface", MinHostTokenLen)
	}
	if v := strings.TrimSpace(os.Getenv("OPENTODO_HOST_OPERATOR_ADDR")); v != "" {
		h.OperatorAddr = v
	}
	if v := strings.TrimSpace(os.Getenv("OPENTODO_HOST_IDLE_MINUTES")); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > 24*60 {
			return nil, fmt.Errorf("OPENTODO_HOST_IDLE_MINUTES must be from 1 to 1440, got %q", v)
		}
		h.IdleTimeout = time.Duration(n) * time.Minute
	}
	if v := strings.TrimSpace(os.Getenv("OPENTODO_HOST_MAX_OPEN")); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > 100000 {
			return nil, fmt.Errorf("OPENTODO_HOST_MAX_OPEN must be from 1 to 100000, got %q", v)
		}
		h.MaxOpen = n
	}
	if h.Limits, err = ParseLimits(os.Getenv("OPENTODO_HOST_LIMITS")); err != nil {
		return nil, fmt.Errorf("OPENTODO_HOST_LIMITS: %w", err)
	}
	return h, nil
}
