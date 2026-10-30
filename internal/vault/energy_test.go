package vault

import (
	"strings"
	"testing"
)

// TestEnergyInline (OpenSpec change task-energy, task 4.6): a task's energy is
// written as [energy:: …] after the evening's place, a level typed in any case
// reaches the app and is written back in lower case, an unknown value changes
// nothing, and removing the field clears the energy.
func TestEnergyInline(t *testing.T) {
	s := newServer(t)
	home := s.create("projects", map[string]any{"name": "Home"})
	id := s.create("tasks", map[string]any{"title": "Clean the windows", "project_id": home, "evening": true, "energy": "low"})
	v := s.vault(t)
	if !strings.Contains(v.read(t, "Home.md"), "- [ ] Clean the windows [evening:: true] [energy:: low] 🆔 "+id) {
		t.Fatalf("line:\n%s", v.read(t, "Home.md"))
	}
	v.edit(t, "Home.md", "[energy:: low]", "[energy:: Deep]")
	v.sync(t)
	if got := s.get("tasks", id); got["energy"] != "deep" {
		t.Fatalf("deep in the app = %v", got)
	}
	v.sync(t)
	if l := v.read(t, "Home.md"); !strings.Contains(l, "[energy:: deep]") {
		t.Fatalf("not rewritten in lower case:\n%s", l)
	}
	v.edit(t, "Home.md", "[energy:: deep]", "[energy:: high]")
	v.sync(t)
	if got := s.get("tasks", id); got["energy"] != "deep" {
		t.Fatalf("an unknown value was written: %v", got)
	}
	// The refused line is written back from the app.
	v.edit(t, "Home.md", " [energy:: deep]", "")
	v.sync(t)
	if got := s.get("tasks", id); got["energy"] != nil {
		t.Fatalf("removing the field kept %v", got["energy"])
	}
}
