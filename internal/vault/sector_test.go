package vault

import (
	"strings"
	"testing"
)

// TestSectorInline (OpenSpec change time-sectors, task 5.2): a task's sector is
// written as [sector:: …] after the evening's place, a period typed in the file
// reaches the app, an invalid period is reported and changes nothing, and
// removing the field clears the sector.
func TestSectorInline(t *testing.T) {
	s := newServer(t)
	work := s.create("projects", map[string]any{"name": "Work"})
	id := s.create("tasks", map[string]any{"title": "Plan the offsite", "project_id": work, "sector": "2026-11"})
	v := s.vault(t)
	if !strings.Contains(v.read(t, "Work.md"), "- [ ] Plan the offsite [sector:: 2026-11] 🆔 "+id) {
		t.Fatalf("line:\n%s", v.read(t, "Work.md"))
	}
	v.edit(t, "Work.md", "[sector:: 2026-11]", "[sector:: 2026-w46]")
	v.sync(t)
	if got := s.get("tasks", id); got["sector"] != "2026-W46" {
		t.Fatalf("week in the app = %v", got)
	}
	v.edit(t, "Work.md", "[sector:: 2026-W46]", "[sector:: 2026-Q7]")
	rep := v.sync(t)
	if got := s.get("tasks", id); got["sector"] != "2026-W46" {
		t.Fatalf("an invalid period was written: %v", got)
	}
	reported := false
	for _, w := range rep.Warnings {
		reported = reported || (strings.HasPrefix(w, "Work.md") && strings.Contains(w, "2026-Q7"))
	}
	if !reported {
		t.Fatalf("no problem reported: %+v", rep.Warnings)
	}
	v.edit(t, "Work.md", " [sector:: 2026-W46]", "")
	v.sync(t)
	if got := s.get("tasks", id); got["sector"] != nil {
		t.Fatalf("removing the field kept %v", got["sector"])
	}
}
