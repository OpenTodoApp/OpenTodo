package cli

import (
	"strings"
	"testing"
)

// TestSectorFlag (OpenSpec change time-sectors, task 5.4): --sector takes a
// relative word (resolved with Monday weeks on the local date, here Saturday
// 2026-10-10) or a period, none clears it, an invalid value is a usage error
// naming it that writes nothing, the DUE cell names the sector, list filters by
// it and --json carries it.
func TestSectorFlag(t *testing.T) {
	h := newHarness(t)
	h.seedViews()
	h.login()
	id := strings.TrimSpace(h.mustRun("add", "Book the venue", "--sector", "next-week"))
	if got := h.task(id); got["sector"] != "2026-W42" {
		t.Fatalf("add = %v", got)
	}
	old := strings.TrimSpace(h.mustRun("add", "Old plan", "--sector", "2026-w30"))
	if got := h.task(old); got["sector"] != "2026-W30" {
		t.Fatalf("add period = %v", got)
	}
	out := h.mustRun("list", "--sector", "next-week")
	if !strings.Contains(out, "next week") || !strings.Contains(out, "Book the venue") || strings.Contains(out, "Old plan") {
		t.Fatalf("list --sector next-week:\n%s", out)
	}
	out = h.mustRun("list", "--sector", "carried")
	if !strings.Contains(out, "from 2026-W30") || strings.Contains(out, "Book the venue") {
		t.Fatalf("list --sector carried:\n%s", out)
	}
	if out := h.mustRun("list", "--json"); !strings.Contains(out, `"sector": "2026-W42"`) && !strings.Contains(out, `"sector":"2026-W42"`) {
		t.Fatalf("list --json lacks the sector:\n%s", out)
	}
	if out := h.mustRun("list", "--inbox"); strings.Contains(out, "Book the venue") {
		t.Fatalf("a sectored task is in the Inbox:\n%s", out)
	}
	h.mustRun("edit", id, "--sector", "2026-Q4")
	if got := h.task(id); got["sector"] != "2026-Q4" {
		t.Fatalf("edit period = %v", got)
	}
	h.mustRun("edit", id, "--sector", "none")
	if got := h.task(id); got["sector"] != nil {
		t.Fatalf("edit none = %v", got)
	}
	h.requestLog()
	for _, args := range [][]string{{"edit", id, "--sector", "soon"}, {"add", "Plan", "--sector", "2027-W53"}, {"add", "Plan", "--sector", "none"}, {"list", "--sector", "later"}} {
		code, _, errb := h.run(args...)
		if code != ExitUsage || !strings.Contains(errb, args[len(args)-1]) {
			t.Fatalf("%v = %d (%s)", args, code, errb)
		}
	}
	if w := writesIn(h.requestLog()); len(w) != 0 {
		t.Fatalf("invalid --sector wrote %v", w)
	}

	// --natural reads sector phrases only while the account has Time sectors on (task 4.2).
	off := strings.TrimSpace(h.mustRun("add", "Clean the garage this month", "--natural"))
	if got := h.task(off); got["title"] != "Clean the garage this month" || got["sector"] != nil {
		t.Fatalf("off = %v", got)
	}
	h.apiJSON("POST", "/api/v1/sync", map[string]any{"device": "seed", "cursor": 0, "ops": []map[string]any{
		{"id": "prefs/sectors", "entity": "user_prefs", "entityId": "me", "field": "time_sectors", "value": "on", "ts": 1, "device": "seed"},
	}})
	on := strings.TrimSpace(h.mustRun("add", "Clean the garage this month", "--natural"))
	if got := h.task(on); got["title"] != "Clean the garage" || got["sector"] != "2026-10" {
		t.Fatalf("on = %v", got)
	}
}
