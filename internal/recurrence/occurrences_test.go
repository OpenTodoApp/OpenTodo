package recurrence

import (
	"encoding/json"
	"os"
	"slices"
	"testing"
)

// The occurrence vectors are shared with web/src/lib/occurrences.test.ts
// (OpenSpec change series-occurrences, design D2).
const occurrenceVectorsPath = "../../web/src/lib/occurrences.vectors.json"

func TestOccurrencesSharedVectors(t *testing.T) {
	raw, err := os.ReadFile(occurrenceVectorsPath)
	if err != nil {
		t.Fatalf("read vectors: %v", err)
	}
	var v struct {
		Cases []struct {
			Name   string   `json:"name"`
			Rule   string   `json:"rule"`
			Due    string   `json:"due"`
			Today  string   `json:"today"`
			Done   int      `json:"done"`
			Except []string `json:"exceptions"`
			From   string   `json:"from"`
			To     string   `json:"to"`
			Dates  []string `json:"dates"`
			Capped bool     `json:"capped"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatalf("parse vectors: %v", err)
	}
	if len(v.Cases) < 10 {
		t.Fatalf("vector file looks truncated: %d cases", len(v.Cases))
	}
	for _, c := range v.Cases {
		t.Run(c.Name, func(t *testing.T) {
			rule, err := Parse(c.Rule)
			if err != nil {
				t.Fatalf("parse %q: %v", c.Rule, err)
			}
			dates, capped, err := rule.OccurrencesExcept(c.Due, c.Today, c.Done, c.From, c.To, setOf(c.Except))
			if err != nil {
				t.Fatal(err)
			}
			if !slices.Equal(dates, c.Dates) || capped != c.Capped {
				t.Errorf("Occurrences = %v capped=%v, want %v capped=%v", dates, capped, c.Dates, c.Capped)
			}
		})
	}
}

func setOf(dates []string) map[string]bool {
	out := map[string]bool{}
	for _, d := range dates {
		out[d] = true
	}
	return out
}

func TestNextFreeSharedVectors(t *testing.T) {
	raw, err := os.ReadFile(occurrenceVectorsPath)
	if err != nil {
		t.Fatalf("read vectors: %v", err)
	}
	var v struct {
		Next []struct {
			Name   string   `json:"name"`
			Rule   string   `json:"rule"`
			Due    string   `json:"due"`
			Today  string   `json:"today"`
			Taken  int      `json:"taken"`
			Except []string `json:"exceptions"`
			Next   *string  `json:"next"`
		} `json:"next"`
	}
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatalf("parse vectors: %v", err)
	}
	if len(v.Next) < 5 {
		t.Fatalf("vector file looks truncated: %d next cases", len(v.Next))
	}
	for _, c := range v.Next {
		t.Run(c.Name, func(t *testing.T) {
			rule, err := Parse(c.Rule)
			if err != nil {
				t.Fatalf("parse %q: %v", c.Rule, err)
			}
			next, ok, err := rule.NextFree(c.Due, c.Today, c.Today, c.Taken, setOf(c.Except))
			if err != nil {
				t.Fatal(err)
			}
			want := ""
			if c.Next != nil {
				want = *c.Next
			}
			if next != want || ok != (c.Next != nil) {
				t.Errorf("NextFree = %q ok=%v, want %q", next, ok, want)
			}
		})
	}
}

func TestOccurrencesRejectsBadDates(t *testing.T) {
	rule, _ := Parse("every day")
	if _, _, err := rule.Occurrences("2026-10-12", "2026-10-12", 0, "2026-13-01", "2026-10-20"); err == nil {
		t.Fatal("want an error for a bad from date")
	}
}
