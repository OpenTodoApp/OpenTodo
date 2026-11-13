package agenttools

import (
	"context"
	"testing"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Every name in reachTools is a registered tool, and an account-wide tool is
// refused to a workspace-limited request (token-workspaces D4).
func TestReachToolsAreKnown(t *testing.T) {
	known := map[string]bool{}
	for _, tl := range registry {
		known[tl.def(Caller{Scope: ScopeAgent}).Name] = true
	}
	for name := range reachTools {
		if !known[name] {
			t.Errorf("reachTools names %q, which is not a tool", name)
		}
	}
	ctx := opsync.WithReach(context.Background(), []string{"ws"})
	for _, name := range []string{"list_frames", "list_slots", "list_objectives", "find_free_time", "list_routines", "create_routine", "run_routine"} {
		if err := reachRefused(ctx, name); err == nil || err.Code != "token_restricted" {
			t.Errorf("%s under a reach = %v", name, err)
		}
	}
	if err := reachRefused(ctx, "list_tasks"); err != nil {
		t.Errorf("list_tasks under a reach = %v", err)
	}
	if err := reachRefused(context.Background(), "list_frames"); err != nil {
		t.Errorf("without a reach = %v", err)
	}
}
