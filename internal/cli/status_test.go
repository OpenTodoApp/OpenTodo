package cli

import (
	"strings"
	"testing"
)

// TestProjectListStatus (OpenSpec change project-review-cadence, task 4.3):
// `ot project list` shows a project in maintenance in its STATUS column.
func TestProjectListStatus(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.put("project", "gard0001", map[string]any{"name": "Garden", "color": "#10b981", "archived": false, "status": "maintenance"})
	h.put("project", "home0001", map[string]any{"name": "Home", "color": "#64748b", "archived": false})
	out := h.mustRun("project", "list")
	var garden, home string
	for _, line := range strings.Split(out, "\n") {
		if strings.Contains(line, "Garden") {
			garden = line
		}
		if strings.Contains(line, "Home") {
			home = line
		}
	}
	if !strings.Contains(garden, "maintenance") || strings.Contains(home, "maintenance") {
		t.Fatalf("ot project list:\n%s", out)
	}
}
