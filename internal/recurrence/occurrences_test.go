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
			dates, capped, err := rule.Occurrences(c.Due, c.Today, c.Done, c.From, c.To)
			if err != nil {
				t.Fatal(err)
			}
			if !slices.Equal(dates, c.Dates) || capped != c.Capped {
				t.Errorf("Occurrences = %v capped=%v, want %v capped=%v", dates, capped, c.Dates, c.Capped)
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
