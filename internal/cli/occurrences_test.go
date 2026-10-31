package cli

import (
	"encoding/json"
	"strings"
	"testing"
)

// `ot task occurrences` (OpenSpec change series-occurrences, task 4.2) against the
// in-process server. The series is dated in the future, so the walk does not
// depend on the day the test runs.
func TestTaskOccurrencesCommand(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.put("task", "study001", map[string]any{"title": "Study", "recurrence": "every weekday", "due": map[string]any{"date": "2030-01-07", "time": "18:00"}})
	schemas := loadSchemas(t)

	out := h.mustRun("task", "occurrences", "study001", "--from", "2030-01-07", "--to", "2030-01-13", "--json")
	mustMatch(t, schemas, "task occurrences", out, ref("occurrences"))
	var list occurrenceList
	if err := json.Unmarshal([]byte(out), &list); err != nil {
		t.Fatal(err)
	}
	got := []string{}
	for _, o := range list.Occurrences {
		got = append(got, o.Date+" "+o.Time+" "+o.State)
	}
	want := "2030-01-07 18:00 current,2030-01-08 18:00 projected,2030-01-09 18:00 projected,2030-01-10 18:00 projected,2030-01-11 18:00 projected"
	if strings.Join(got, ",") != want {
		t.Fatalf("occurrences = %v", got)
	}

	// The table: date, time, state.
	out = h.mustRun("task", "occurrences", "study001", "--from", "2030-01-07", "--to", "2030-01-08")
	lines := strings.Split(strings.TrimSpace(out), "\n")
	if len(lines) != 3 || !strings.HasPrefix(lines[0], "DATE") || !strings.Contains(lines[1], "current") || !strings.Contains(lines[2], "2030-01-08") {
		t.Fatalf("table = %q", out)
	}

	// A task without a rule: the server's not_recurring error, exit 1.
	h.put("task", "once0001", map[string]any{"title": "Once", "due": map[string]any{"date": "2030-01-07"}})
	if code, _, errb := h.run("task", "occurrences", "once0001"); code != ExitServer || !strings.Contains(errb, "not an open recurring task") {
		t.Fatalf("plain task: %d %q", code, errb)
	}
	// A bad day is refused before any request.
	if code, _, _ := h.run("task", "occurrences", "study001", "--from", "soon"); code != ExitUsage {
		t.Fatalf("bad --from: %d", code)
	}
}
