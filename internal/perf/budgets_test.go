//go:build perf

package perf

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func testBudgets(t *testing.T) Budgets {
	t.Helper()
	var b Budgets
	err := json.Unmarshal([]byte(`{
	  "reference": { "setting": "server", "baseline": 20, "backstop": 1.5, "units": ["ms", "s"] },
	  "metrics": [
	    { "id": "list", "name": "list", "unit": "ms", "limits": { "server": 100, "pi4": 400 } },
	    { "id": "rss", "name": "memory", "unit": "MB", "limits": { "server": 60 } }
	  ]
	}`), &b)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

// perf-relative-budgets D2: a slower runner gets a proportionally higher time limit.
func TestReportScalesTimeLimitsByTheReference(t *testing.T) {
	b := testBudgets(t)
	slow := report(b, "server", map[string][]float64{ReferenceID: {26, 24, 25}, "list": {120}, "rss": {50}})
	if slow.Scale != 1.25 {
		t.Fatalf("scale %v, want 1.25", slow.Scale)
	}
	list := slow.Metrics[0]
	if list.Scaled != 125 || !list.OK {
		t.Fatalf("list: %+v, want limit 125 here and a pass", list)
	}
	// Memory is not a time: its limit never moves.
	if rss := slow.Metrics[1]; rss.Scaled != 0 || !rss.OK {
		t.Fatalf("rss: %+v", rss)
	}
	// The same 120 ms on a runner as fast as the baseline is over budget.
	base := report(b, "server", map[string][]float64{ReferenceID: {20}, "list": {120}, "rss": {50}})
	if base.Metrics[0].OK || !strings.Contains(base.Metrics[0].Failure, "budget 100 ms (100 ms on this runner)") {
		t.Fatalf("at the baseline: %+v", base.Metrics[0])
	}
	// A faster runner gets a lower limit.
	fast := report(b, "server", map[string][]float64{ReferenceID: {10}, "list": {60}, "rss": {50}})
	if fast.Metrics[0].Scaled != 50 || fast.Metrics[0].OK {
		t.Fatalf("on a fast runner: %+v", fast.Metrics[0])
	}
}

// perf-relative-budgets D3: whatever the runner, a time over the absolute limit times the backstop fails.
func TestReportKeepsTheAbsoluteBackstop(t *testing.T) {
	b := testBudgets(t)
	r := report(b, "server", map[string][]float64{ReferenceID: {60}, "list": {160}, "rss": {50}})
	list := r.Metrics[0]
	if list.Scaled != 150 || list.OK {
		t.Fatalf("a runner three times slower: %+v, want the 150 ms backstop and a failure", list)
	}
	if !strings.Contains(list.Failure, "list, server, 160 ms, budget 100 ms (150 ms on this runner)") {
		t.Fatalf("failure %q", list.Failure)
	}
}

// Without a reference sample, or in another setting, the limits stay absolute.
func TestReportWithoutAReferenceIsAbsolute(t *testing.T) {
	b := testBudgets(t)
	for _, r := range []Report{
		report(b, "server", map[string][]float64{"list": {120}, "rss": {50}}),
		report(b, "pi4", map[string][]float64{ReferenceID: {40}, "list": {420}}),
	} {
		if r.Scale != 0 || r.Metrics[0].Scaled != 0 || r.Metrics[0].OK {
			t.Fatalf("%s: %+v scale %v", r.Setting, r.Metrics[0], r.Scale)
		}
	}
}

// The real budgets name a reference for the server's time limits.
func TestBudgetsFileHasTheReference(t *testing.T) {
	root, _ := filepath.Abs("../..")
	if _, err := os.Stat(filepath.Join(root, "scripts", "perf", "budgets.json")); err != nil {
		t.Skip(err)
	}
	b := loadBudgets(t, filepath.Join(root, "scripts", "perf", "budgets.json"))
	if b.Reference == nil || b.Reference.Setting != "server" || b.Reference.Baseline <= 0 || b.Reference.Backstop < 1 {
		t.Fatalf("reference %+v", b.Reference)
	}
}

// The reference workload runs here and answers a time.
func TestReferenceWorkloadMeasures(t *testing.T) {
	ref := newReference(t, t.TempDir())
	v := ref.measure(t)
	if v <= 0 {
		t.Fatalf("reference %v ms", v)
	}
	t.Logf("reference workload: %.1f ms", v)
}
