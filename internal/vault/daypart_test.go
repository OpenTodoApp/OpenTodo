package vault

import (
	"strings"
	"testing"
)

// TestDayPartInline (OpenSpec change day-parts, task 4.3): a task's part is
// written as [daypart:: …] after the evening's place, an edit reaches the app
// with the evening flag cleared, removing the field clears the part, and an
// unknown value changes nothing.
func TestDayPartInline(t *testing.T) {
	s := newServer(t)
	garden := s.create("projects", map[string]any{"name": "Garden"})
	id := s.create("tasks", map[string]any{"title": "Stretch", "project_id": garden, "due": map[string]any{"date": "2026-10-25"}, "day_part": "morning"})
	v := s.vault(t)
	if !strings.Contains(v.read(t, "Garden.md"), "- [ ] Stretch 📅 2026-10-25 [daypart:: morning] 🆔 "+id) {
		t.Fatalf("line:\n%s", v.read(t, "Garden.md"))
	}
	v.edit(t, "Garden.md", "[daypart:: morning]", "[daypart:: afternoon]")
	v.sync(t)
	if got := s.get("tasks", id); got["day_part"] != "afternoon" || got["evening"] != false {
		t.Fatalf("afternoon in the app = %v", got)
	}
	v.edit(t, "Garden.md", "[daypart:: afternoon]", "[daypart:: night]")
	v.sync(t)
	if got := s.get("tasks", id); got["day_part"] != "afternoon" {
		t.Fatalf("an unknown value was written: %v", got)
	}
	v.edit(t, "Garden.md", " [daypart:: afternoon]", "")
	v.sync(t)
	if got := s.get("tasks", id); got["day_part"] != nil {
		t.Fatalf("removing the field kept %v", got["day_part"])
	}
	// Evening: the flag alone, never the field.
	s.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"day_part": nil, "evening": true})
	v.sync(t)
	if l := v.read(t, "Garden.md"); !strings.Contains(l, "[evening:: true]") || strings.Contains(l, "daypart") {
		t.Fatalf("evening line:\n%s", l)
	}
}
