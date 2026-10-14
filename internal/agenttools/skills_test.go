package agenttools

import (
	"context"
	"encoding/json"
	"slices"
	"strings"
	"testing"
)

// assistant-skills 1.1: the catalogue matches the spec and stays inside the registry.
func TestSkillCatalogue(t *testing.T) {
	want := []string{"idea-to-project", "plan-week", "weekly-review", "triage-inbox", "break-down"}
	var ids []string
	seen := map[string]bool{}
	c := Caller{Scope: ScopeAgent, OwnerAllowsWrites: true, UserAllowsWrites: true}
	for _, s := range Skills {
		if seen[s.ID] {
			t.Fatalf("duplicate skill id %q", s.ID)
		}
		seen[s.ID] = true
		ids = append(ids, s.ID)
		if s.Name == "" || s.Description == "" || s.Example == "" || strings.TrimSpace(s.Instructions) == "" || len(s.Tools) == 0 {
			t.Fatalf("%s: incomplete definition", s.ID)
		}
		if s.Result != ResultChanges && s.Result != ResultAnswer {
			t.Fatalf("%s: result %q", s.ID, s.Result)
		}
		for _, name := range s.Tools {
			_, d, ok := lookup(name, c)
			if !ok {
				t.Fatalf("%s: tool %q is not in the registry", s.ID, name)
			}
			if s.Result == ResultAnswer && d.Kind != KindRead {
				t.Fatalf("%s: answer skill lists write tool %q", s.ID, name)
			}
		}
		if got, ok := SkillByID(s.ID); !ok || got.Name != s.Name {
			t.Fatalf("SkillByID(%q)", s.ID)
		}
	}
	if !slices.Equal(ids, want) {
		t.Fatalf("skill ids = %v, want %v", ids, want)
	}
	if _, ok := SkillByID("export-everything"); ok {
		t.Fatal("unknown id found")
	}
	// The weekly review never gains a tool the design does not list.
	wr, _ := SkillByID("weekly-review")
	if wr.Allows("add_comment") || wr.Allows("create_project") || !wr.Allows("schedule_tasks") {
		t.Fatalf("weekly-review tools = %v", wr.Tools)
	}
	if n := WorkdayNote(9, 17, 420); !strings.Contains(n, "09:00") || !strings.Contains(n, "17:00") || !strings.Contains(n, "420 minutes") {
		t.Fatalf("workday note = %q", n)
	}
}

// A subtask named only by its parent goes in the parent's project (assistant-skills 5.2).
func TestCreateSubtaskInheritsParentProject(t *testing.T) {
	f := newFixture(t)
	f.put("u1", "project", "p1", map[string]any{"name": "Work"})
	f.put("u1", "task", "t1", map[string]any{"title": "Plan the offsite", "project_id": "p1"})
	plan, err := f.reg.Plan(context.Background(), agent("u1"), "create_tasks", json.RawMessage(`{"items":[{"title":"Book the venue","parent_id":"t1","estimate_minutes":30}]}`), nil)
	if err != nil {
		t.Fatal(err)
	}
	if got := string(plan.Changes[0].Patch["project_id"]); got != `"p1"` {
		t.Fatalf("project_id = %s, want the parent's", got)
	}
}
