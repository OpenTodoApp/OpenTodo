package host

import (
	"net/http"
	"sync"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/assistant"
	"github.com/OpenTodoApp/opentodo/internal/config"
	"github.com/OpenTodoApp/opentodo/internal/tenant"
)

// TestAssistantConcurrencyIsHostWide (host-assistant-concurrency): every
// tenant's assistant shares the host's one cap of 8 running turns, so the
// operator's provider keys never see 8 turns per open tenant.
func TestAssistantConcurrencyIsHostWide(t *testing.T) {
	var mu sync.Mutex
	got := map[string]*assistant.Slots{}
	f := newFixture(t, func(_ *config.Config, o *Options) {
		prev := o.Tenant
		o.Tenant = func(name string, to *tenant.Options) {
			prev(name, to)
			mu.Lock()
			got[name] = to.Hosted.AssistantSlots
			mu.Unlock()
		}
	})
	for _, name := range []string{"alice", "smith"} {
		f.create(name, config.Limits{})
		if code, _ := f.client(name).do("GET", "/api/v1/auth/status", nil); code != http.StatusOK {
			t.Fatalf("%s: %d", name, code)
		}
	}
	mu.Lock()
	defer mu.Unlock()
	a, s := got["alice"], got["smith"]
	if a == nil || a != s {
		t.Fatalf("tenants do not share one cap: %p %p", a, s)
	}
	if a.Max() != assistant.MaxConcurrentTurns {
		t.Fatalf("cap %d, want %d", a.Max(), assistant.MaxConcurrentTurns)
	}
}
