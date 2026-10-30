package cli

import (
	"strings"
	"testing"
)

// TestEnergyFlag (OpenSpec change task-energy, task 4.2): --energy sets and
// clears the energy, an unknown level is a usage error that writes nothing,
// the list shows an ENERGY column and --json the field, and --natural reads
// `~low` only while the account has Energy levels on.
func TestEnergyFlag(t *testing.T) {
	h := newHarness(t)
	h.seedViews()
	h.login()
	id := strings.TrimSpace(h.mustRun("add", "Inbox zero", "--energy", "low"))
	if got := h.task(id); got["energy"] != "low" {
		t.Fatalf("add = %v", got)
	}
	if out := h.mustRun("list"); !strings.Contains(out, "ENERGY") || !strings.Contains(out, "low") {
		t.Fatalf("list lacks the energy column:\n%s", out)
	}
	if out := h.mustRun("list", "--json"); !strings.Contains(out, `"energy": "low"`) && !strings.Contains(out, `"energy":"low"`) {
		t.Fatalf("list --json lacks energy:\n%s", out)
	}
	h.mustRun("edit", id, "--energy", "Deep")
	if got := h.task(id); got["energy"] != "deep" {
		t.Fatalf("edit deep = %v", got)
	}
	h.mustRun("edit", id, "--energy", "none")
	if got := h.task(id); got["energy"] != nil {
		t.Fatalf("edit none = %v", got)
	}
	h.requestLog()
	if code, _, _ := h.run("add", "Climb", "--energy", "high"); code != ExitUsage {
		t.Fatalf("--energy high = %d", code)
	}
	if w := writesIn(h.requestLog()); len(w) != 0 {
		t.Fatalf("--energy high wrote %v", w)
	}

	// Off: the token stays in the title. On: it sets the energy.
	off := strings.TrimSpace(h.mustRun("add", "Sort receipts ~low", "--natural"))
	if got := h.task(off); got["title"] != "Sort receipts ~low" || got["energy"] != nil {
		t.Fatalf("off = %v", got)
	}
	h.apiJSON("POST", "/api/v1/sync", map[string]any{"device": "seed", "cursor": 0, "ops": []map[string]any{
		{"id": "prefs/energy", "entity": "user_prefs", "entityId": "me", "field": "energy", "value": "on", "ts": 1, "device": "seed"},
	}})
	on := strings.TrimSpace(h.mustRun("add", "Sort receipts ~low", "--natural"))
	if got := h.task(on); got["title"] != "Sort receipts" || got["energy"] != "low" {
		t.Fatalf("on = %v", got)
	}
}
