package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// editState rewrites the vault's state file through fn.
func editState(t *testing.T, dir string, fn func(st map[string]any)) {
	t.Helper()
	p := filepath.Join(dir, ".opentodo", "state.json")
	var st map[string]any
	if err := json.Unmarshal([]byte(readFile(t, p)), &st); err != nil {
		t.Fatal(err)
	}
	fn(st)
	b, _ := json.Marshal(st)
	if err := os.WriteFile(p, b, 0o600); err != nil {
		t.Fatal(err)
	}
}

func readState(t *testing.T, dir string) map[string]any {
	t.Helper()
	var st map[string]any
	if err := json.Unmarshal([]byte(readFile(t, filepath.Join(dir, ".opentodo", "state.json"))), &st); err != nil {
		t.Fatal(err)
	}
	return st
}

// TestVaultOwnership: the scenarios of "One syncing device per vault folder"
// (OpenSpec change obsidian-vault-sync) on the command line.
func TestVaultOwnership(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.put("project", "home0001", map[string]any{"name": "Home", "color": "#10b981", "archived": false})
	h.put("task", "rent0001", map[string]any{"title": "Pay rent", "project_id": "home0001"})
	dir := filepath.Join(t.TempDir(), "Tasks")
	h.mustRun("vault", "init", dir)
	st := readState(t, dir)
	owner, _ := st["owner"].(map[string]any)
	if owner["kind"] != "cli" || owner["install"] == "" || owner["label"] != "testbox" {
		t.Fatalf("init owner %v", st["owner"])
	}
	if lease, _ := st["lease_until"].(float64); int64(lease) <= time.Now().UnixMilli() {
		t.Fatalf("lease_until %v", st["lease_until"])
	}
	install := owner["install"]

	// Older state file: no owner, so this installation becomes the owner.
	editState(t, dir, func(st map[string]any) { delete(st, "owner"); delete(st, "lease_until") })
	h.mustRun("vault", "sync", dir)
	if o, _ := readState(t, dir)["owner"].(map[string]any); o["install"] != install {
		t.Fatalf("older state not owned: %v", o)
	}

	// Refused on the command line: the phone owns the folder.
	editState(t, dir, func(st map[string]any) {
		st["owner"] = map[string]any{"kind": "obsidian", "install": "phone-1", "label": "Obsidian on iPhone"}
		st["lease_until"] = time.Now().Add(3 * time.Minute).UnixMilli()
	})
	device := readState(t, dir)["device"]
	home := filepath.Join(dir, "Home.md")
	replaceIn(t, home, "Pay rent", "Pay the rent")
	h.requestLog()
	code, out, _ := h.run("vault", "sync", dir, "--json")
	if code != ExitUsage || !strings.Contains(out, "vault_owned") || !strings.Contains(out, "Obsidian on iPhone") || !strings.Contains(out, "--take-over") || !strings.Contains(out, "lease runs until") {
		t.Fatalf("owned: %d %s", code, out)
	}
	if log := h.requestLog(); len(log) != 0 {
		t.Fatalf("requests sent for an owned folder: %v", log)
	}
	// watch stops with the same error.
	if code, _, errb := h.run("vault", "watch", dir); code != ExitUsage || !strings.Contains(errb, "Obsidian on iPhone") {
		t.Fatalf("watch on an owned folder: %d %q", code, errb)
	}

	// Owner gone: take over. The server keeps its title, the file's line goes to
	// the conflict file, a new line becomes one task and nothing is created twice.
	h.apiJSON("PATCH", "/api/v1/tasks/rent0001", map[string]any{"title": "Pay rent in cash"})
	writeFile(t, home, readFile(t, home)+"- [ ] Buy bulbs\n")
	h.mustRun("vault", "sync", dir, "--take-over")
	if got := h.task("rent0001")["title"]; got != "Pay rent in cash" {
		t.Fatalf("take-over pushed the file's title: %v", got)
	}
	conf := readFile(t, filepath.Join(dir, "Home.conflict.md"))
	if !strings.Contains(conf, "Pay the rent 🆔 rent0001") {
		t.Fatalf("conflict file:\n%s", conf)
	}
	text := readFile(t, home)
	if !strings.Contains(text, "- [ ] Pay rent in cash 🆔 rent0001") || strings.Count(text, "Buy bulbs") != 1 {
		t.Fatalf("Home.md after take-over:\n%s", text)
	}
	st = readState(t, dir)
	if o, _ := st["owner"].(map[string]any); o["install"] != install || st["device"] == device {
		t.Fatalf("after take-over: owner %v device %v (was %v)", st["owner"], st["device"], device)
	}
	h.mustRun("vault", "sync", dir)
	bulbs := 0
	tasks, _ := readState(t, dir)["store"].(map[string]any)["task"].(map[string]any)
	for _, row := range tasks {
		if title, _ := row.(map[string]any)["title"].(map[string]any); title["v"] == "Buy bulbs" {
			bulbs++
		}
	}
	if bulbs != 1 {
		t.Fatalf("Buy bulbs created %d times", bulbs)
	}
}
