package cli

import (
	"encoding/json"
	"strings"
	"testing"
)

// `ot task split` (OpenSpec change series-split, task 5.4) against the
// in-process server, dated in the future so the walk does not depend on today.
func TestTaskSplitCommand(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.put("task", "study001", map[string]any{"title": "Study", "recurrence": "every weekday", "due": map[string]any{"date": "2030-01-07", "time": "18:00"}})
	schemas := loadSchemas(t)

	out := h.mustRun("task", "split", "study001", "--from", "2030-01-09", "--time", "19:00", "--json")
	mustMatch(t, schemas, "task split", out, ref("task"))
	var piece map[string]any
	if err := json.Unmarshal([]byte(out), &piece); err != nil {
		t.Fatal(err)
	}
	if sf, _ := piece["split_from"].(map[string]any); sf["series"] != "study001" || sf["date"] != "2030-01-09" || piece["due"].(map[string]any)["time"] != "19:00" {
		t.Fatalf("piece = %v", piece)
	}
	out = h.mustRun("task", "split", piece["id"].(string), "--from", "2030-01-14", "--rule", "every tue, thu", "--title", "Study hall")
	if !strings.HasPrefix(out, "split") || !strings.Contains(out, "Study hall from 2030-01-14, every tuesday, thursday") {
		t.Fatalf("split = %q", out)
	}
	// Nothing to change, no --from: refused before any request; the current
	// occurrence: refused by the server.
	if code, _, _ := h.run("task", "split", "study001", "--from", "2030-01-08"); code != ExitUsage {
		t.Fatalf("no change: %d", code)
	}
	if code, _, _ := h.run("task", "split", "study001", "--title", "x"); code != ExitUsage {
		t.Fatalf("no --from: %d", code)
	}
	if code, _, errb := h.run("task", "split", "study001", "--from", "2030-01-07", "--title", "x"); code != ExitServer || !strings.Contains(errb, "not an occurrence") {
		t.Fatalf("current: %d %q", code, errb)
	}
}
