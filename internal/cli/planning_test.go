package cli

import (
	"encoding/json"
	"strings"
	"testing"
)

// Planning fields on add, edit and list (OpenSpec change agent-planning-fields,
// cli-client "Add and edit tasks" and "Planning fields in list output").

func TestPlanningFlagsAddEdit(t *testing.T) {
	h := newHarness(t)
	h.seedViews()
	h.login()
	var created map[string]any
	_ = json.Unmarshal([]byte(h.mustRun("add", "Quarterly report", "--start", "monday", "--deadline", "2026-11-06", "--json")), &created)
	if created["start"] != "2026-10-12" || created["deadline"] != "2026-11-06" || created["due"] != nil {
		t.Fatalf("created = %v", created)
	}
	id := created["id"].(string)

	// Park in Someday: the due date is kept and the output says parked.
	if out := h.mustRun("edit", "rent0001", "--start", "someday"); !strings.HasPrefix(out, "parked") {
		t.Fatalf("output %q", out)
	}
	if got := h.task("rent0001"); got["start"] != "someday" || got["due"].(map[string]any)["date"] != "2026-10-08" {
		t.Fatalf("parked = %v", got)
	}
	h.mustRun("edit", id, "--evening")
	if h.task(id)["evening"] != true {
		t.Fatal("evening not set")
	}
	h.mustRun("edit", id, "--evening=false")
	if got := h.task(id); got["evening"] != false || got["deadline"] != "2026-11-06" {
		t.Fatalf("evening cleared = %v", got)
	}

	// Blockers resolve by prefix; ot list --blocked lists the waiting task.
	shelves := strings.TrimSpace(h.mustRun("add", "Install shelves", "--project", "Home", "--blocked-by", "plant"))
	if l := h.task(shelves)["blocked_by"].([]any); len(l) != 1 || l[0] != "plant001" {
		t.Fatalf("blocked_by = %v", l)
	}
	if out := h.mustRun("list", "--blocked"); !strings.Contains(out, "Install shelves") || strings.Contains(out, "Pay rent") || !strings.Contains(out, "waiting") {
		t.Fatalf("blocked list:\n%s", out)
	}
	h.requestLog()
	if code, _, errb := h.run("edit", id, "--blocked-by", "p"); code != ExitServer || !strings.Contains(errb, "ambiguous") {
		t.Fatalf("ambiguous = %d %q", code, errb)
	}
	if w := writesIn(h.requestLog()); len(w) != 0 {
		t.Fatalf("ambiguous blocker wrote: %v", w)
	}

	// Locations: a saved one by name, coordinates, none.
	h.put("place", "gym00001", map[string]any{"name": "Gym", "address": "Via Roma 1", "geo": map[string]any{"lat": 45.07, "lon": 7.68}})
	h.mustRun("edit", id, "--location", "gym")
	if loc := h.task(id)["location"].(map[string]any); loc["place_id"] != "gym00001" || loc["name"] != "Gym" || loc["address"] != "Via Roma 1" || loc["lat"] != 45.07 {
		t.Fatalf("location = %v", loc)
	}
	h.mustRun("edit", id, "--location", "none")
	if h.task(id)["location"] != nil {
		t.Fatal("location not cleared")
	}
	plumber := strings.TrimSpace(h.mustRun("add", "Meet the plumber", "--location", "45.4642,9.1900"))
	if loc := h.task(plumber)["location"].(map[string]any); loc["lat"] != 45.4642 || loc["name"] != nil {
		t.Fatalf("coordinates = %v", loc)
	}
	h.requestLog()
	if code, _, errb := h.run("add", "x", "--location", "Mars base"); code != ExitServer || !strings.Contains(errb, "Mars base") {
		t.Fatalf("unknown location = %d %q", code, errb)
	}
	if w := writesIn(h.requestLog()); len(w) != 0 {
		t.Fatalf("unknown location wrote: %v", w)
	}

	// Invalid words exit 2 before any request.
	for _, args := range [][]string{{"add", "x", "--start", "later"}, {"add", "x", "--deadline", "2026-02-30"}, {"add", "x", "--deadline", "none"}, {"add", "x", "--location", "91,0"}} {
		h.requestLog()
		if code, _, _ := h.run(args...); code != ExitUsage {
			t.Fatalf("%v = %d", args, code)
		}
		if w := writesIn(h.requestLog()); len(w) != 0 {
			t.Fatalf("%v wrote %v", args, w)
		}
	}
}

func TestPlanningListOutput(t *testing.T) {
	h := newHarness(t)
	h.seedViews()
	h.put("task", "idea0001", map[string]any{"title": "Learn the cello", "start": "someday"})
	h.put("task", "tax00001", map[string]any{"title": "Tax return", "deadline": "2026-11-06", "due": map[string]any{"date": "2026-10-20"}})
	h.put("task", "late0001", map[string]any{"title": "Late form", "deadline": "2026-10-01"})
	h.login()
	out := h.mustRun("list", "--someday")
	if !strings.Contains(out, "Learn the cello") || !strings.Contains(out, "(someday)") || strings.Contains(out, "Pay rent") {
		t.Fatalf("someday:\n%s", out)
	}
	out = h.mustRun("list")
	header := strings.SplitN(out, "\n", 2)[0]
	if !strings.Contains(header, " BY ") || !strings.Contains(out, "2026-11-06") || !strings.Contains(out, "2026-10-01 overdue") {
		t.Fatalf("BY column:\n%s", out)
	}
	if out := h.mustRun("list", "--today"); strings.Contains(strings.SplitN(out, "\n", 2)[0], " BY ") {
		t.Fatalf("BY column without a deadline:\n%s", out)
	}
	if out := h.mustRun("list", "--anytime"); !strings.Contains(out, "Read a book") || strings.Contains(out, "Late form") || strings.Contains(out, "Learn the cello") {
		t.Fatalf("anytime:\n%s", out)
	}
	if code, _, _ := h.run("list", "--someday", "--today"); code != ExitUsage {
		t.Fatalf("--someday --today = %d", code)
	}
	var list []map[string]any
	_ = json.Unmarshal([]byte(h.mustRun("list", "--someday", "--json")), &list)
	if len(list) != 1 || list[0]["start"] != "someday" {
		t.Fatalf("json = %v", list)
	}
}

func TestPlanningFlagsAgentToken(t *testing.T) {
	h := newHarness(t)
	h.seedViews()
	h.enableAgentWrites()
	tokenID, secret := h.apiToken2("agent")
	h.setToken(secret)
	h.mustRun("edit", "rent0001", "--start", "someday", "--deadline", "2026-11-06")
	if got := h.task("rent0001"); got["start"] != "someday" || got["deadline"] != "2026-11-06" {
		t.Fatalf("agent edit = %v", got)
	}
	var n int
	_ = h.db.QueryRow(`SELECT COUNT(*) FROM ops WHERE entity_id = 'rent0001' AND device = ?`, "agent:"+tokenID).Scan(&n)
	if n != 2 {
		t.Fatalf("agent ops = %d", n)
	}
}
