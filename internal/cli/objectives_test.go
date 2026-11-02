package cli

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/e2ee/crypt"
)

// plan-objectives 2.4 (cli-client "Objective commands"): add to the current
// or next week and quarter, list by default and by period, done, undone,
// edit, delete, the limit and encrypted titles. fixedNow is Saturday
// 2026-10-10: Q4 2026, ISO week 41.
func TestObjectivesCommands(t *testing.T) {
	h := newHarness(t)
	h.loginAdmin()
	q := strings.TrimSpace(h.mustRun("objectives", "add", "Ship", "1.0", "--quarter"))
	w := strings.TrimSpace(h.mustRun("objectives", "add", "Draft the talk", "--week"))
	n := strings.TrimSpace(h.mustRun("objectives", "add", "Give the talk", "--week", "--next"))
	if o := h.apiJSON("GET", "/api/v1/objectives/"+n, nil); o["period"] != "2026-W42" || o["title"] != "Give the talk" {
		t.Fatalf("next week objective %v", o)
	}
	if o := h.apiJSON("GET", "/api/v1/objectives/"+q, nil); o["period"] != "2026-Q4" {
		t.Fatalf("quarterly objective %v", o)
	}
	table := h.mustRun("objectives")
	if !strings.Contains(table, "Ship 1.0") || !strings.Contains(table, "Draft the talk") || strings.Contains(table, "Give the talk") {
		t.Fatalf("default list:\n%s", table)
	}
	var list []map[string]any
	if err := json.Unmarshal([]byte(h.mustRun("objectives", "--period", "2026-W42", "--json")), &list); err != nil || len(list) != 1 || list[0]["id"] != n {
		t.Fatalf("--period list %v %v", list, err)
	}
	if out := h.mustRun("objectives", "--quarter"); strings.Contains(out, "Draft the talk") {
		t.Fatalf("--quarter lists the week:\n%s", out)
	}
	if code, _, _ := h.run("objectives", "--period", "2026-10"); code != ExitUsage {
		t.Fatalf("month period exit %d", code)
	}

	h.mustRun("objectives", "done", w[:8])
	if o := h.apiJSON("GET", "/api/v1/objectives/"+w, nil); o["done_at"] == float64(0) {
		t.Fatalf("not done: %v", o)
	}
	h.mustRun("objectives", "undone", w)
	h.mustRun("objectives", "edit", w, "--title", "Draft the keynote")
	if o := h.apiJSON("GET", "/api/v1/objectives/"+w, nil); o["done_at"] != float64(0) || o["title"] != "Draft the keynote" {
		t.Fatalf("after undone and edit: %v", o)
	}

	// The limit: four more fill the week, the sixth exits non-zero with the message.
	for _, title := range []string{"b", "c", "d", "e"} {
		h.mustRun("objectives", "add", title, "--week")
	}
	code, out, errb := h.run("objectives", "add", "One more", "--week")
	if code == 0 || !strings.Contains(out+errb, "open objectives") {
		t.Fatalf("sixth: %d %s %s", code, out, errb)
	}
	code, out, _ = h.run("objectives", "add", "One more", "--week", "--json")
	if code == 0 || !strings.Contains(out, `"code":"too_many_objectives"`) {
		t.Fatalf("sixth --json: %d %s", code, out)
	}

	// Dry run sends nothing.
	before := len(h.apiJSON("GET", "/api/v1/objectives", nil)["objectives"].([]any))
	h.mustRun("objectives", "add", "Planned", "--quarter", "--dry-run")
	if after := len(h.apiJSON("GET", "/api/v1/objectives", nil)["objectives"].([]any)); after != before {
		t.Fatalf("dry run wrote: %d -> %d", before, after)
	}

	if out := h.mustRun("objectives", "delete", q, "--yes"); !strings.Contains(out, "deleted") {
		t.Fatalf("delete %q", out)
	}
	if out := h.mustRun("objectives", "--quarter"); !strings.Contains(out, "No objectives") {
		t.Fatalf("after delete:\n%s", out)
	}
}

// An encrypted title prints as [encrypted] while locked and decrypted once
// unlocked; an add while unlocked sends ciphertext only.
func TestObjectivesEncrypted(t *testing.T) {
	h := newHarness(t)
	h.login()
	dek := seqBytes(0x40, 32)
	h.encrypted(1, dek)
	sealed, err := crypt.Seal(dek, "objective", "ob000001", "title", "Finish the grant")
	if err != nil {
		t.Fatal(err)
	}
	h.put("objective", "ob000001", map[string]any{"title": sealed, "period": "2026-W41", "position": 1, "done_at": 0})
	if out := h.mustRun("objectives"); !strings.Contains(out, "[encrypted]") || strings.Contains(out, "enc:v1:") {
		t.Fatalf("locked list:\n%s", out)
	}
	if code, _, _ := h.run("objectives", "add", "Plain", "--week"); code != ExitNotPermitted {
		t.Fatalf("locked add exit %d", code)
	}
	h.mustRun("encryption", "unlock", "--passphrase-file", h.passphraseFile())
	if out := h.mustRun("objectives"); !strings.Contains(out, "Finish the grant") {
		t.Fatalf("unlocked list:\n%s", out)
	}
	id := strings.TrimSpace(h.mustRun("objectives", "add", "Write the report", "--week"))
	o := h.apiJSON("GET", "/api/v1/objectives/"+id, nil)
	title, _ := o["title"].(string)
	if pt, err := crypt.Open(dek, "objective", id, "title", title); err != nil || pt != "Write the report" {
		t.Fatalf("stored title %q: %q %v", title, pt, err)
	}
}
