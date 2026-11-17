package cli

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

// habits "Log from the terminal" (OpenSpec change habits-assistant): ot habits
// log writes through the habits route and prints the new numbers.
func TestHabitsCommands(t *testing.T) {
	h := newHarness(t)
	h.loginAdmin()
	today := time.Now().Format(time.DateOnly)
	out := h.apiJSON("POST", "/api/v1/tasks", map[string]any{"title": "Run", "due": map[string]any{"date": today}, "recurrence": "every day", "habit": true})
	id, _ := out["id"].(string)
	if id == "" {
		t.Fatalf("seed habit: %v", out)
	}
	if got := h.mustRun("habits", "log", "Run", "--note", "5k"); !strings.Contains(got, "Run: kept") || !strings.Contains(got, "streak 1") {
		t.Fatalf("log = %q", got)
	}
	if table := h.mustRun("habits"); !strings.Contains(table, "Run") {
		t.Fatalf("list = %q", table)
	}
	var detail map[string]any
	if err := json.Unmarshal([]byte(h.mustRun("habits", "show", "run", "--json")), &detail); err != nil {
		t.Fatal(err)
	}
	days := detail["days"].([]any)
	first := days[0].(map[string]any)
	if first["state"] != "done" || first["untrusted_text"].(map[string]any)["note"] != "5k" {
		t.Fatalf("days = %v", days)
	}
	if code, _, _ := h.run("habits", "log", "Run", "--tiny", "--skip"); code != ExitUsage {
		t.Fatalf("two states: exit %d", code)
	}
	if code, _, _ := h.run("habits", "log", "Nope"); code != ExitUsage {
		t.Fatalf("unknown habit: exit %d", code)
	}
}

// With TZ unset Go names the machine's zone "Local"; the habit routes still get
// the zone's IANA name (from TZ or /etc/localtime), never the server's UTC (#1500).
func TestHabitsZoneWhenLocalIsUnnamed(t *testing.T) {
	a := &App{
		Now:    func() time.Time { return time.Date(2026, 11, 16, 19, 48, 0, 0, time.FixedZone("Local", -8*3600)) },
		Getenv: func(k string) string { return map[string]string{"TZ": "America/Los_Angeles"}[k] },
	}
	if got := a.habitQuery(nil); got != "?timezone=America%2FLos_Angeles" {
		t.Fatalf("habitQuery = %q", got)
	}
}
