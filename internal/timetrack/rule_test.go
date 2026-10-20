package timetrack

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
	"time"
)

type ruleCase struct {
	Name       string            `json:"name"`
	User       string            `json:"user"`
	Now        int64             `json:"now"`
	Entries    []Entry           `json:"entries"`
	Running    *string           `json:"running"`
	Repairs    []Repair          `json:"repairs"`
	StartBatch []Repair          `json:"start_batch"`
	Minutes    map[string]int    `json:"minutes"`
	Zone       string            `json:"zone"`
	DayStart   int               `json:"day_start"`
	Days       map[string]string `json:"days"`
}

// TestRuleFixture runs the shared rule fixture (web/src/lib/time.test.ts runs it too).
func TestRuleFixture(t *testing.T) {
	raw, err := os.ReadFile("testdata/rule_fixture.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Cases []ruleCase `json:"cases"`
	}
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	if len(f.Cases) < 5 {
		t.Fatalf("only %d cases", len(f.Cases))
	}
	for _, c := range f.Cases {
		t.Run(c.Name, func(t *testing.T) {
			got := Running(c.Entries, c.User)
			switch {
			case c.Running == nil && got != nil:
				t.Errorf("running = %s, want none", got.ID)
			case c.Running != nil && (got == nil || got.ID != *c.Running):
				t.Errorf("running = %v, want %s", got, *c.Running)
			}
			if r := Repairs(c.Entries, c.User); !reflect.DeepEqual(nonNil(r), nonNil(c.Repairs)) {
				t.Errorf("repairs = %v, want %v", r, c.Repairs)
			}
			if r := StartBatch(c.Entries, c.User, c.Now); !reflect.DeepEqual(nonNil(r), nonNil(c.StartBatch)) {
				t.Errorf("start batch = %v, want %v", r, c.StartBatch)
			}
			loc, err := time.LoadLocation(c.Zone)
			if err != nil {
				t.Fatal(err)
			}
			for _, e := range c.Entries {
				if want, ok := c.Minutes[e.ID]; ok && MinutesOf(e, c.Now) != want {
					t.Errorf("minutes of %s = %d, want %d", e.ID, MinutesOf(e, c.Now), want)
				}
				if want, ok := c.Days[e.ID]; ok && DayOf(e.StartedAt, loc, c.DayStart) != want {
					t.Errorf("day of %s = %s, want %s", e.ID, DayOf(e.StartedAt, loc, c.DayStart), want)
				}
			}
		})
	}
}

func nonNil(r []Repair) []Repair {
	if r == nil {
		return []Repair{}
	}
	return r
}

func TestTotalsByTask(t *testing.T) {
	end := func(ms int64) *int64 { return &ms }
	del := int64(1)
	got := TotalsByTask([]Entry{
		{ID: "a", TaskID: "t", StartedAt: 0, EndedAt: end(20 * 60000)},
		{ID: "b", TaskID: "t", StartedAt: 0, EndedAt: end(30 * 60000)},
		{ID: "c", TaskID: "t", StartedAt: 0, EndedAt: end(30 * 60000), DeletedAt: &del},
		{ID: "d", TaskID: "u", StartedAt: 0},
	}, 5*60000)
	if got["t"] != 50 || got["u"] != 5 {
		t.Fatalf("totals = %v", got)
	}
}

// TestParseDuration: the same cases as web/src/lib/time.test.ts.
func TestParseDuration(t *testing.T) {
	for s, want := range map[string]int{"30m": 30, "45min": 45, "1h": 60, "1h30": 90, "1h30m": 90, "1.5h": 90, "90": 90, "0": 0, "2H": 120} {
		if got, ok := ParseDuration(s); !ok || got != want {
			t.Errorf("ParseDuration(%q) = %d, %v; want %d", s, got, ok, want)
		}
	}
	for _, s := range []string{"soon", "+30m", "1h75", "1,5h", "", "30s"} {
		if _, ok := ParseDuration(s); ok {
			t.Errorf("ParseDuration(%q) accepted", s)
		}
	}
}
