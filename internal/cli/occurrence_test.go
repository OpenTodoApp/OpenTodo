package cli

import (
	"encoding/json"
	"strings"
	"testing"
)

// `ot task occurrence` (OpenSpec change series-exceptions, task 6.5) against the
// in-process server. The series is dated in the future, so the walk does not
// depend on the day the test runs.
func TestTaskOccurrenceCommand(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.put("task", "study001", map[string]any{"title": "Study", "recurrence": "every weekday", "due": map[string]any{"date": "2030-01-07", "time": "18:00"}})
	schemas := loadSchemas(t)

	// Move Wednesday to 19:00, complete Thursday early, skip Friday.
	out := h.mustRun("task", "occurrence", "study001", "2030-01-09", "edit", "--time", "19:00", "--json")
	mustMatch(t, schemas, "task occurrence", out, ref("task"))
	var rec map[string]any
	if err := json.Unmarshal([]byte(out), &rec); err != nil {
		t.Fatal(err)
	}
	if rec["occurrence_date"] != "2030-01-09" || rec["due"].(map[string]any)["time"] != "19:00" || rec["completed_at"] != nil {
		t.Fatalf("moved = %v", rec)
	}
	out = h.mustRun("task", "occurrence", "study001", "2030-01-10", "complete")
	if !strings.HasPrefix(out, "completed") || !strings.Contains(out, "2030-01-10") {
		t.Fatalf("complete = %q", out)
	}
	h.mustRun("task", "occurrence", "study001", "2030-01-11", "skip")
	// A new day without --time keeps the series' time.
	out = h.mustRun("task", "occurrence", "study001", "2030-01-14", "edit", "--due", "2030-01-15", "--json")
	if err := json.Unmarshal([]byte(out), &rec); err != nil {
		t.Fatal(err)
	}
	if d := rec["due"].(map[string]any); d["date"] != "2030-01-15" || d["time"] != "18:00" {
		t.Fatalf("moved day = %v", d)
	}

	out = h.mustRun("task", "occurrences", "study001", "--from", "2030-01-07", "--to", "2030-01-11", "--json")
	var list occurrenceList
	if err := json.Unmarshal([]byte(out), &list); err != nil {
		t.Fatal(err)
	}
	got := []string{}
	for _, o := range list.Occurrences {
		got = append(got, o.Date+" "+o.State)
	}
	want := "2030-01-07 current,2030-01-08 projected,2030-01-09 open,2030-01-10 done,2030-01-11 skipped"
	if strings.Join(got, ",") != want {
		t.Fatalf("occurrences = %v", got)
	}

	// Not an occurrence: a Saturday; a bad action or date is refused before any request.
	if code, _, errb := h.run("task", "occurrence", "study001", "2030-01-12", "complete"); code != ExitServer || !strings.Contains(errb, "not an occurrence") {
		t.Fatalf("saturday: %d %q", code, errb)
	}
	if code, _, _ := h.run("task", "occurrence", "study001", "2030-01-08", "postpone"); code != ExitUsage {
		t.Fatalf("bad action: %d", code)
	}
	if code, _, _ := h.run("task", "occurrence", "study001", "soon", "skip"); code != ExitUsage {
		t.Fatalf("bad date: %d", code)
	}
}
