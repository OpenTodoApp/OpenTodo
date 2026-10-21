package rules

import (
	"encoding/json"
	"os"
	"slices"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/ruleval"
)

type planCase struct {
	Name       string                     `json:"name"`
	Today      string                     `json:"today"`
	Now        int64                      `json:"now"`
	Me         string                     `json:"me"`
	WeekStart  string                     `json:"week_start"`
	Actions    json.RawMessage            `json:"actions"`
	Task       map[string]json.RawMessage `json:"task"`
	LiveLabels []string                   `json:"live_labels"`
	Projects   map[string]bool            `json:"projects"`
	Sections   map[string]string          `json:"sections"`
	Expect     map[string]json.RawMessage `json:"expect"`
	Skipped    []string                   `json:"skipped"`
}

// TestPlanFixture: the server planner writes what web/src/lib/rules/plan.ts
// writes for the same task and actions (web/src/lib/rules/plan.fixture.json).
func TestPlanFixture(t *testing.T) {
	raw, err := os.ReadFile("../../web/src/lib/rules/plan.fixture.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []planCase
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatal(err)
	}
	for _, c := range cases {
		a, err := ruleval.ParseActions(c.Actions)
		if err != nil {
			t.Fatalf("%s: %v", c.Name, err)
		}
		ws := time.Monday
		if c.WeekStart == "sun" {
			ws = time.Sunday
		}
		ctx := PlanContext{Today: c.Today, NowMs: c.Now, UserID: c.Me, WeekStart: ws,
			LabelLive:      func(id string) bool { return slices.Contains(c.LiveLabels, id) },
			SectionProject: func(id string) string { return c.Sections[id] },
			ProjectShared:  func(id string) bool { return c.Projects[id] },
			ProjectLive:    func(id string) bool { _, ok := c.Projects[id]; return ok },
		}
		got := Plan(a, c.Task, ctx)
		if len(got.Patch) != len(c.Expect) {
			t.Errorf("%s: patch %s, want %s", c.Name, mustJSON(got.Patch), mustJSON(c.Expect))
			continue
		}
		for f, v := range c.Expect {
			if !sameJSON(got.Patch[f], v) {
				t.Errorf("%s: %s = %s, want %s", c.Name, f, got.Patch[f], v)
			}
		}
		if !slices.Equal(got.Skipped, c.Skipped) {
			t.Errorf("%s: skipped %v, want %v", c.Name, got.Skipped, c.Skipped)
		}
	}
}

func mustJSON(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func TestWeekStartOf(t *testing.T) {
	if d := weekStartOf("2026-10-28", time.Monday); d != "2026-10-26" {
		t.Fatal(d)
	}
	if d := weekStartOf("2026-10-28", time.Saturday); d != "2026-10-24" {
		t.Fatal(d)
	}
}
