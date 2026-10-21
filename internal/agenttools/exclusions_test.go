package agenttools

import "testing"

// TestResolveInheritance: a sub-project inherits from the nearest ancestor that
// is kept away, through two levels, and a child's own switch survives the
// parent being switched off (agent-planning-fields D9).
func TestResolveInheritance(t *testing.T) {
	parents := map[string]string{"top": "", "mid": "top", "leaf": "mid", "other": "", "loop1": "loop2", "loop2": "loop1"}
	got := Resolve(map[string]bool{"top": true, "mid": true}, parents)
	if s := got["leaf"]; !s.KeptAway || s.InheritedFrom != "mid" {
		t.Fatalf("leaf = %+v", s)
	}
	if s := got["mid"]; !s.KeptAway || s.InheritedFrom != "" {
		t.Fatalf("mid = %+v", s)
	}
	if got["other"].KeptAway || got["loop1"].KeptAway {
		t.Fatalf("allowed projects kept away: %+v", got)
	}
	got = Resolve(map[string]bool{"top": true}, parents)
	if s := got["leaf"]; !s.KeptAway || s.InheritedFrom != "top" {
		t.Fatalf("two levels = %+v", s)
	}
	// The parent off: the child's own row decides again.
	got = Resolve(map[string]bool{"mid": true}, parents)
	if !got["mid"].KeptAway || got["top"].KeptAway || got["leaf"].InheritedFrom != "mid" {
		t.Fatalf("parent off = %+v", got)
	}
}
