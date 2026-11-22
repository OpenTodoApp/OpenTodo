//go:build perf

package perf

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"testing"
)

// ReferenceID is the reference workload's sample and figure in a report
// (perf-relative-budgets D1; the workload is reference_test.go).
const ReferenceID = "server-reference"

// Budgets is scripts/perf/budgets.json.
type Budgets struct {
	Gated []string `json:"gated"`
	// Reference scales the time limits of one setting by the runner's speed
	// (perf-relative-budgets D2).
	Reference *struct {
		Setting  string   `json:"setting"`
		Baseline float64  `json:"baseline"`
		Backstop float64  `json:"backstop"`
		Units    []string `json:"units"`
	} `json:"reference"`
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
	// Scale is the reference workload's median on this runner over its baseline:
	// the factor the setting's time limits were multiplied by (0 when not scaled).
	Scale float64 `json:"scale,omitempty"`
}

// Metric is one measured metric: every run, the median and the verdict.
type Metric struct {
	ID     string    `json:"id"`
	Name   string    `json:"name"`
	Unit   string    `json:"unit"`
	Runs   []float64 `json:"runs"`
	Median float64   `json:"median"`
	Limit  float64   `json:"limit"`
	// Scaled is the limit for this runner, Limit times the report's Scale, capped
	// below by nothing and above by Limit times the backstop (0 when not scaled).
	Scaled  float64 `json:"scaled,omitempty"`
	OK      bool    `json:"ok"`
	Failure string  `json:"failure,omitempty"`
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
//
// In the reference's setting, a time limit is relative (perf-relative-budgets D2):
// it is multiplied by the reference workload's median over its baseline, so a
// slower runner gets a higher limit and a faster one a lower. The absolute limit
// times the backstop holds whatever the runner, so a regression cannot hide behind
// a slow one. Without a reference sample the limits stay absolute.
func report(b Budgets, setting string, samples map[string][]float64) Report {
	r := Report{Setting: setting}
	ref := b.Reference
	scaled := map[string]bool{}
	if ref != nil && ref.Setting == setting && ref.Baseline > 0 && len(samples[ReferenceID]) > 0 {
		r.Scale = median(samples[ReferenceID]) / ref.Baseline
		for _, u := range ref.Units {
			scaled[u] = true
		}
	}
	for _, m := range b.Metrics {
		limit, ok := m.Limits[setting]
		if !ok {
			continue
		}
		runs := samples[m.ID]
		x := Metric{ID: m.ID, Name: m.Name, Unit: m.Unit, Runs: runs, Limit: limit}
		if len(runs) == 0 {
			x.Failure = fmt.Sprintf("%s, %s: not measured", m.Name, setting)
			r.Metrics = append(r.Metrics, x)
			continue
		}
		x.Median = median(runs)
		bound := limit
		if r.Scale > 0 && scaled[m.Unit] {
			x.Scaled = min(limit*r.Scale, limit*ref.Backstop)
			bound = x.Scaled
		}
		x.OK = x.Median <= bound
		if !x.OK {
			// The alert's wording: "first sync, desktop, 41 s, budget 30 s", and for a
			// scaled limit "..., budget 170 ms (186 ms on this runner)".
			x.Failure = fmt.Sprintf("%s, %s, %s %s, budget %s %s", m.Name, setting, num(x.Median), m.Unit, num(limit), m.Unit)
			if x.Scaled > 0 {
				x.Failure += fmt.Sprintf(" (%s %s on this runner)", num(x.Scaled), m.Unit)
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
