package cli

import (
	"slices"
	"strings"
	"testing"
)

// TestListAvailableAndProjectFlow (OpenSpec change project-flow-modes, task 6.3):
// `ot list --available` lists only the current steps of sequential projects and
// sections, and `ot project list` shows each project's flow.
func TestListAvailableAndProjectFlow(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.put("project", "move0001", map[string]any{"name": "Move house", "color": "#10b981", "archived": false, "flow_mode": "sequential"})
	h.put("project", "home0001", map[string]any{"name": "Home", "color": "#64748b", "archived": false})
	h.put("section", "paint001", map[string]any{"name": "Paint", "project_id": "home0001", "position": 1, "flow_mode": "sequential"})
	h.put("task", "van00001", map[string]any{"title": "Book van", "project_id": "move0001", "position": 1})
	h.put("task", "pack0001", map[string]any{"title": "Pack kitchen", "project_id": "move0001", "position": 2})
	h.put("task", "buy00001", map[string]any{"title": "Buy paint", "project_id": "home0001", "section_id": "paint001", "position": 1})
	h.put("task", "roll0001", map[string]any{"title": "Roll walls", "project_id": "home0001", "section_id": "paint001", "position": 2})
	h.put("task", "some0001", map[string]any{"title": "Maybe", "start": "someday", "position": 3})

	got := idsOf(t, h.mustRun("list", "--available", "--json"))
	slices.Sort(got)
	if !equalStrings(got, []string{"buy00001", "van00001"}) {
		t.Fatalf("ot list --available = %v", got)
	}
	if got := idsOf(t, h.mustRun("list", "--available", "--project", "Move house", "--json")); !equalStrings(got, []string{"van00001"}) {
		t.Fatalf("with --project = %v", got)
	}
	if code, _, errb := h.run("list", "--available", "--blocked"); code != ExitUsage || !strings.Contains(errb, "--available") {
		t.Fatalf("two planning filters = %d %q", code, errb)
	}

	out := h.mustRun("project", "list")
	if !strings.Contains(out, "FLOW") || !strings.Contains(out, "sequential") || !strings.Contains(out, "parallel") {
		t.Fatalf("ot project list:\n%s", out)
	}
}
