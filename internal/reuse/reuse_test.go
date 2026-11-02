package reuse

import (
	"encoding/json"
	"os"
	"slices"
	"testing"
)

// vectors is web/src/lib/reusable.vectors.json, shared with reusable.test.ts.
type vectors struct {
	Normalize []struct {
		In  string `json:"in"`
		Out string `json:"out"`
	} `json:"normalize"`
	Match []struct {
		Name    string                       `json:"name"`
		Project string                       `json:"project"`
		Title   string                       `json:"title"`
		Tasks   []map[string]json.RawMessage `json:"tasks"`
		Want    *struct {
			ID    string `json:"id"`
			State State  `json:"state"`
		} `json:"want"`
	} `json:"match"`
	Duplicates []struct {
		Name     string                       `json:"name"`
		Project  string                       `json:"project"`
		Tasks    []map[string]json.RawMessage `json:"tasks"`
		Attached []string                     `json:"attached"`
		Losers   []string                     `json:"losers"`
	} `json:"duplicates"`
}

func load(t *testing.T) vectors {
	t.Helper()
	b, err := os.ReadFile("../../web/src/lib/reusable.vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var v vectors
	if err := json.Unmarshal(b, &v); err != nil {
		t.Fatal(err)
	}
	return v
}

// TestVectorCounts pins the same counts as reusable.test.ts, so a case added on
// one side only fails.
func TestVectorCounts(t *testing.T) {
	v := load(t)
	got := []int{len(v.Normalize), len(v.Match), len(v.Duplicates)}
	if want := []int{28, 15, 10}; !slices.Equal(got, want) {
		t.Fatalf("vector counts %v, want %v", got, want)
	}
}

func TestNormalizeVectors(t *testing.T) {
	for _, c := range load(t).Normalize {
		if got := NormalizeTitle(c.In); got != c.Out {
			t.Errorf("NormalizeTitle(%q) = %q, want %q", c.In, got, c.Out)
		}
	}
}

func TestMatchVectors(t *testing.T) {
	for _, c := range load(t).Match {
		m, ok := FindMatch(c.Project, c.Title, FromRows(c.Tasks))
		switch {
		case c.Want == nil && ok:
			t.Errorf("%s: matched %s, want none", c.Name, m.Task.ID)
		case c.Want != nil && (!ok || m.Task.ID != c.Want.ID || m.State != c.Want.State):
			t.Errorf("%s: got %v %s %s, want %s %s", c.Name, ok, m.Task.ID, m.State, c.Want.ID, c.Want.State)
		}
	}
}

func TestDuplicateVectors(t *testing.T) {
	for _, c := range load(t).Duplicates {
		attached := map[string]bool{}
		for _, id := range c.Attached {
			attached[id] = true
		}
		if got := DuplicateLosers(c.Project, FromRows(c.Tasks), attached); !slices.Equal(got, c.Losers) {
			t.Errorf("%s: losers %v, want %v", c.Name, got, c.Losers)
		}
	}
}

func TestValidAisle(t *testing.T) {
	for _, k := range Aisles {
		if !ValidAisle(k) {
			t.Errorf("%s should be valid", k)
		}
	}
	for _, k := range []string{"", "Dairy", "deli", "dairy "} {
		if ValidAisle(k) {
			t.Errorf("%q should be refused", k)
		}
	}
}
