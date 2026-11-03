//go:build perf

package perf

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"testing"
)

// Budgets is scripts/perf/budgets.json.
type Budgets struct {
	Gated   []string `json:"gated"`
	Metrics []struct {
		ID     string             `json:"id"`
		Name   string             `json:"name"`
		Unit   string             `json:"unit"`
		Limits map[string]float64 `json:"limits"`
	} `json:"metrics"`
}

// Report is the JSON report of one setting, the same shape scripts/perf/run.mjs writes.
type Report struct {
	Setting string   `json:"setting"`
	Metrics []Metric `json:"metrics"`
	// Reported are figures measured and shown, never held to a budget.
	Reported map[string]float64 `json:"reported,omitempty"`
}

// Metric is one measured metric: every run, the median and the verdict.
type Metric struct {
	ID      string    `json:"id"`
	Name    string    `json:"name"`
	Unit    string    `json:"unit"`
	Runs    []float64 `json:"runs"`
	Median  float64   `json:"median"`
	Limit   float64   `json:"limit"`
	OK      bool      `json:"ok"`
	Failure string    `json:"failure,omitempty"`
}

func loadBudgets(t *testing.T, path string) Budgets {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var out Budgets
	if err := json.Unmarshal(b, &out); err != nil {
		t.Fatal(err)
	}
	return out
}

// report compares the median of each metric's samples with its budget in
// setting. A metric with a budget but no sample fails: the benchmark lost it.
func report(b Budgets, setting string, samples map[string][]float64) Report {
	r := Report{Setting: setting}
	for _, m := range b.Metrics {
		limit, ok := m.Limits[setting]
		if !ok {
			continue
		}
		runs := samples[m.ID]
		x := Metric{ID: m.ID, Name: m.Name, Unit: m.Unit, Runs: runs, Limit: limit}
		if len(runs) == 0 {
			x.Failure = fmt.Sprintf("%s, %s: not measured", m.Name, setting)
		} else {
			x.Median = median(runs)
			x.OK = x.Median <= limit
			if !x.OK {
				// The alert's wording: "first sync, desktop, 41 s, budget 30 s".
				x.Failure = fmt.Sprintf("%s, %s, %s %s, budget %s %s", m.Name, setting, num(x.Median), m.Unit, num(limit), m.Unit)
			}
		}
		r.Metrics = append(r.Metrics, x)
	}
	return r
}

func median(xs []float64) float64 {
	s := append([]float64(nil), xs...)
	sort.Float64s(s)
	n := len(s)
	if n%2 == 1 {
		return s[n/2]
	}
	return (s[n/2-1] + s[n/2]) / 2
}

func num(f float64) string {
	if f >= 100 {
		return fmt.Sprintf("%.0f", f)
	}
	return fmt.Sprintf("%.1f", f)
}
