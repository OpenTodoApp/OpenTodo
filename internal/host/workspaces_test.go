package host

import (
	"net/http"
	"sync"
	"testing"

	"github.com/pixari/opentodo/internal/config"
	opsync "github.com/pixari/opentodo/internal/sync"
	"github.com/pixari/opentodo/internal/tenant"
)

// TestTenantWorkspaceLimits: the operator's host-wide workspace limits apply
// to every tenant and a tenant's own limits override them (OpenSpec change
// workspaces, "Tenant limit").
func TestTenantWorkspaceLimits(t *testing.T) {
	var mu sync.Mutex
	got := map[string]opsync.WorkspaceLimits{}
	f := newFixture(t, func(c *config.Config, o *Options) {
		c.Host.Limits = config.Limits{Workspaces: 5, GroupMembers: 30}
		next := o.Tenant
		o.Tenant = func(name string, to *tenant.Options) {
			next(name, to)
			mu.Lock()
			got[name] = to.Hosted.Workspaces
			mu.Unlock()
		}
	})
	f.create("smith", config.Limits{WorkspaceMembers: 10})
	c := f.client("smith")
	resp, err := c.send(c.request("GET", "/api/v1/auth/status", nil))
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", resp.StatusCode)
	}
	mu.Lock()
	defer mu.Unlock()
	want := opsync.WorkspaceLimits{Workspaces: 5, Members: 10, GroupMembers: 30}
	if got["smith"] != want {
		t.Fatalf("tenant limits = %+v, want %+v", got["smith"], want)
	}
}

func TestParseWorkspaceLimitKeys(t *testing.T) {
	l, err := config.ParseLimits("workspaces=3,workspace_members=12,workspace_groups=4,group_members=9")
	if err != nil {
		t.Fatal(err)
	}
	if l.Workspaces != 3 || l.WorkspaceMembers != 12 || l.WorkspaceGroups != 4 || l.GroupMembers != 9 {
		t.Fatalf("limits = %+v", l)
	}
}
