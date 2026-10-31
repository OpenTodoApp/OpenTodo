package vault

import (
	"strings"
	"testing"
)

// TestSpanInline (OpenSpec change multi-day-tasks, task 6.4): a span is
// written as [span:: true] after the evening's place, the field is read in any
// order, removing it or writing false clears the flag, and a bad value is
// reported with the file and line and changes nothing.
func TestSpanInline(t *testing.T) {
	s := newServer(t)
	home := s.create("projects", map[string]any{"name": "Home"})
	id := s.create("tasks", map[string]any{"title": "Lisbon trip", "project_id": home, "start": "2026-11-03", "due": map[string]any{"date": "2026-11-05"}, "evening": true, "energy": "low", "span": true})
	plain := s.create("tasks", map[string]any{"title": "Deferred", "project_id": home, "start": "2026-11-03", "due": map[string]any{"date": "2026-11-05"}})
	v := s.vault(t)
	file := v.read(t, "Home.md")
	if !strings.Contains(file, "- [ ] Lisbon trip 📅 2026-11-05 🛫 2026-11-03 [evening:: true] [span:: true] [energy:: low] 🆔 "+id) {
		t.Fatalf("line:\n%s", file)
	}
	if !strings.Contains(file, "- [ ] Deferred 📅 2026-11-05 🛫 2026-11-03 🆔 "+plain) {
		t.Fatalf("plain line:\n%s", file)
	}
	v.edit(t, "Home.md", " [span:: true]", "")
	v.sync(t)
	if got := s.get("tasks", id); got["span"] != false {
		t.Fatalf("removing the field kept %v", got["span"])
	}
	// Made in the file, before the dates.
	v.edit(t, "Home.md", "- [ ] Deferred 📅", "- [ ] Deferred [span:: TRUE] 📅")
	v.sync(t)
	if got := s.get("tasks", plain); got["span"] != true {
		t.Fatalf("span from the file = %v", got)
	}
	v.sync(t)
	if l := v.read(t, "Home.md"); !strings.Contains(l, "- [ ] Deferred 📅 2026-11-05 🛫 2026-11-03 [span:: true] 🆔 "+plain) {
		t.Fatalf("not rewritten in the vault's order:\n%s", l)
	}
	v.edit(t, "Home.md", "[span:: true]", "[span:: soon]")
	rep := v.sync(t)
	if got := s.get("tasks", plain); got["span"] != true {
		t.Fatalf("a bad value was written: %v", got)
	}
	if w := strings.Join(rep.Warnings, "\n"); !strings.Contains(w, "Home.md") || !strings.Contains(w, "Deferred") || !strings.Contains(w, "span soon is not true or false") {
		t.Fatalf("warnings = %v", rep.Warnings)
	}
	v.edit(t, "Home.md", "[span:: true]", "[span:: false]")
	v.sync(t)
	if got := s.get("tasks", plain); got["span"] != false {
		t.Fatalf("false kept %v", got["span"])
	}
}
