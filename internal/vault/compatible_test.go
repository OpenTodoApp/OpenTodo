package vault

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/recurrence/recurrence10"
)

// TestRuleWrittenInTheFileReadBy10: a 🔁 rule on one weekday whose 📅 date
// falls on it is sent as every N weeks, which a 1.0 client reads; on another
// date it keeps the weekday (recurrence-1-0-compatible).
func TestRuleWrittenInTheFileReadBy10(t *testing.T) {
	dir := t.TempDir()
	var log []Op
	log = append(log, project("p-home", "Home")...)
	log = append(log, task("t1", "Bins", "p-home", nil)...)
	log = append(log, task("t2", "Paper", "p-home", map[string]any{"position": 2000})...)
	f := &fake{log: log}
	if _, err := runFake(t, dir, f, NewState("default", "http://x")); err != nil {
		t.Fatal(err)
	}
	home := filepath.Join(dir, "Home.md")
	b, _ := os.ReadFile(home)
	text := strings.Replace(string(b), "- [ ] Bins 🆔 t1", "- [ ] Bins 📅 2026-11-07 🔁 every 2 weeks on saturday 🆔 t1", 1)
	text = strings.Replace(text, "- [ ] Paper 🆔 t2", "- [ ] Paper 📅 2026-11-04 🔁 every 2 weeks on sat 🆔 t2", 1)
	if err := os.WriteFile(home, []byte(text), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := runFake(t, dir, f, nil); err != nil {
		t.Fatal(err)
	}
	for id, c := range map[string]struct{ due, want string }{"t1": {"2026-11-07", `"every 2 weeks"`}, "t2": {"2026-11-04", `"every 2 weeks on saturday"`}} {
		got := fieldsSent(f, id)["recurrence"]
		if got != c.want {
			t.Errorf("%s sent %s, want %s", id, got, c.want)
			continue
		}
		if err := recurrence10.Check(strings.Trim(got, `"`), c.due); err != nil {
			t.Error(err)
		}
	}
}
