package cli

import (
	"encoding/json"
	"strings"
	"testing"
)

// `ot list --sort urgency` (OpenSpec change urgency-sort, urgency-score "Urgency
// order in the CLI").
func TestListSortUrgency(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.seedViews()
	// Call the plumber: p1 due today 14.80; Pay rent: p2 two days late 13.61; Water plants: due today 8.80.
	want := []string{"plum0001", "rent0001", "plant001"}
	for _, args := range [][]string{{"today", "--sort", "urgency", "--json"}, {"list", "--today", "--sort", "urgency", "--json"}} {
		if got := idsOf(t, h.mustRun(args...)); !equalStrings(got, want) {
			t.Fatalf("ot %s = %v, want %v", strings.Join(args, " "), got, want)
		}
	}
	var list []map[string]any
	if err := json.Unmarshal([]byte(h.mustRun("today", "--sort", "urgency", "--json")), &list); err != nil {
		t.Fatal(err)
	}
	if list[0]["urgency"] != 14.8 || list[1]["urgency"] != 13.61 {
		t.Fatalf("scores = %v, %v", list[0]["urgency"], list[1]["urgency"])
	}
	// The default order is unchanged and carries no score.
	if got := idsOf(t, h.mustRun("today", "--sort", "default", "--json")); !equalStrings(got, []string{"rent0001", "plum0001", "plant001"}) {
		t.Fatalf("default order = %v", got)
	}
	if strings.Contains(h.mustRun("today", "--json"), `"urgency"`) {
		t.Fatal("a score without --sort urgency")
	}
	// Human output: a URG column with one decimal.
	out := h.mustRun("today", "--sort", "urgency")
	lines := strings.Split(strings.TrimSpace(out), "\n")
	if !strings.Contains(lines[0], "URG") || !strings.Contains(lines[1], "14.8") || !strings.Contains(lines[1], "Call the plumber") {
		t.Fatalf("table:\n%s", out)
	}
	code, _, errb := h.run("list", "--sort", "colour")
	if code != ExitUsage || !strings.Contains(errb, "default") || !strings.Contains(errb, "urgency") {
		t.Fatalf("unknown sort: exit %d %q", code, errb)
	}
}
