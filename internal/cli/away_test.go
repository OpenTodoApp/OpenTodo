package cli

import (
	"encoding/json"
	"strings"
	"testing"
)

// `ot away` (OpenSpec change away-periods, "From a script") against the
// in-process server. The series is dated in the future, so the walk does not
// depend on the day the test runs.
func TestAwayCommand(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.put("project", "work0001", map[string]any{"name": "Work"})
	h.put("task", "study001", map[string]any{"title": "Study", "project_id": "work0001", "recurrence": "every day", "due": map[string]any{"date": "2030-01-07"}})
	h.put("task", "water001", map[string]any{"title": "Water", "recurrence": "every day", "due": map[string]any{"date": "2030-01-07"}})
	schemas := loadSchemas(t)

	out := h.mustRun("away", "2030-01-08", "2030-01-10", "--project", "Work", "--json")
	mustMatch(t, schemas, "away", out, ref("away"))
	var got struct {
		Away    string
		Skipped int
	}
	if err := json.Unmarshal([]byte(out), &got); err != nil {
		t.Fatal(err)
	}
	if got.Away != "2030-01-08..2030-01-10 quiet" || got.Skipped != 3 {
		t.Fatalf("away = %+v", got)
	}
	out = h.mustRun("away", "2030-01-12", "2030-01-12", "--keep-reminders")
	if !strings.Contains(out, "2 occurrences skipped") {
		t.Fatalf("plain output = %q", out)
	}
	out = h.mustRun("away", "--end", "--json")
	mustMatch(t, schemas, "away --end", out, ref("away"))
	if code, _, errb := h.run("away", "2030-01-10", "2030-01-08"); code == 0 || !strings.Contains(errb, "from") {
		t.Fatalf("from after to: exit %d %q", code, errb)
	}
	if code, _, _ := h.run("away", "2030-01-10"); code == 0 {
		t.Fatal("one day accepted")
	}
}
