package vault

import (
	"strings"
	"testing"
)

// TestProjectStatusInFrontMatter (OpenSpec change project-review-cadence, task
// 4.4): maintenance is written as opentodo-status (left out while active), an
// edit in the file reaches the app, and an unknown value stays in the file
// unwritten.
func TestProjectStatusInFrontMatter(t *testing.T) {
	s := newServer(t)
	garden := s.create("projects", map[string]any{"name": "Garden"})
	s.create("tasks", map[string]any{"title": "Water roses", "project_id": garden})
	v := s.vault(t)
	if strings.Contains(v.read(t, "Garden.md"), "opentodo-status") {
		t.Fatalf("an active project has the key:\n%s", v.read(t, "Garden.md"))
	}
	before := v.read(t, "Garden.md")
	s.do("PATCH", "/api/v1/projects/"+garden, map[string]any{"status": "maintenance"})
	v.sync(t)
	after := v.read(t, "Garden.md")
	if !strings.Contains(after, "\nopentodo-status: maintenance\n") {
		t.Fatalf("status not written:\n%s", after)
	}
	if strings.Replace(after, "opentodo-status: maintenance\n", "", 1) != before {
		t.Fatalf("other lines changed:\n%s\n--- before ---\n%s", after, before)
	}
	// Removing the key ends maintenance.
	v.edit(t, "Garden.md", "opentodo-status: maintenance\n", "")
	v.sync(t)
	if got := s.get("projects", garden)["status"]; got != "active" {
		t.Fatalf("status in the app = %v", got)
	}
	v.edit(t, "Garden.md", "opentodo-id:", "opentodo-status: maintenance\nopentodo-id:")
	v.sync(t)
	if got := s.get("projects", garden)["status"]; got != "maintenance" {
		t.Fatalf("status in the app after adding the key = %v", got)
	}
	v.edit(t, "Garden.md", "opentodo-status: maintenance", "opentodo-status: paused")
	v.sync(t)
	if got := s.get("projects", garden)["status"]; got != "maintenance" {
		t.Fatalf("an unknown value was written: %v", got)
	}
	if !strings.Contains(v.read(t, "Garden.md"), "opentodo-status: paused") {
		t.Fatalf("the unknown value left the file:\n%s", v.read(t, "Garden.md"))
	}
}
