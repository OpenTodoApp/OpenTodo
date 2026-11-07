package timetrack

import (
	"encoding/json"
	"os"
	"testing"
)

type occurrenceCase struct {
	Name      string                       `json:"name"`
	Now       int64                        `json:"now"`
	Tasks     []map[string]json.RawMessage `json:"tasks"`
	Entries   []Entry                      `json:"entries"`
	Starts    map[string]int64             `json:"starts"`
	Totals    map[string]int               `json:"totals"`
	AllTotals map[string]int               `json:"all_totals"`
}

// TestOccurrenceFixture: the same cases as web/src/lib/time.test.ts, read from
// the task rows as the agent tools and the rules engine read them.
func TestOccurrenceFixture(t *testing.T) {
	raw, err := os.ReadFile("testdata/occurrence_fixture.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Cases []occurrenceCase `json:"cases"`
	}
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	if len(f.Cases) < 4 {
		t.Fatalf("%d cases", len(f.Cases))
	}
	for _, c := range f.Cases {
		t.Run(c.Name, func(t *testing.T) {
			tasks := make([]Occurrence, 0, len(c.Tasks))
			for _, row := range c.Tasks {
				tasks = append(tasks, OccurrenceFromRow(row))
			}
			starts := OccurrenceStarts(tasks)
			if !sameMap(starts, c.Starts) {
				t.Errorf("starts = %v, want %v", starts, c.Starts)
			}
			if got := CurrentTotals(c.Entries, tasks, c.Now); !sameMap(got, c.Totals) {
				t.Errorf("totals = %v, want %v", got, c.Totals)
			}
			if got := TotalsByTask(c.Entries, c.Now, nil); !sameMap(got, c.AllTotals) {
				t.Errorf("all totals = %v, want %v", got, c.AllTotals)
			}
		})
	}
}

func sameMap[V comparable](a, b map[string]V) bool {
	if len(a) != len(b) {
		return false
	}
	for k, v := range a {
		if w, ok := b[k]; !ok || w != v {
			return false
		}
	}
	return true
}
