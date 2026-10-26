package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestVaultTaskNotes(t *testing.T) {
	h := newHarness(t)
	h.login()
	obsidian := t.TempDir()
	writeFile(t, filepath.Join(obsidian, ".obsidian", "plugins", "tasknotes", "data.json"), `{"taskTag": "task"}`)
	// init inside an Obsidian vault with TaskNotes prints the hint.
	dir := filepath.Join(obsidian, "OpenTodo")
	code, _, errb := h.run("vault", "init", dir)
	if code != 0 || !strings.Contains(errb, "ot vault tasknotes <folder>") {
		t.Fatalf("init hint: %d %q", code, errb)
	}
	statePath := filepath.Join(dir, ".opentodo", "state.json")
	before := readFile(t, statePath)
	// A path that is not a folder: exit 2 naming it, the state unchanged.
	code, _, errb = h.run("vault", "tasknotes", filepath.Join(obsidian, "nope"), "--vault", dir)
	if code != ExitUsage || !strings.Contains(errb, "nope is not a folder") || readFile(t, statePath) != before {
		t.Fatalf("missing folder: %d %q", code, errb)
	}
	writeFile(t, filepath.Join(obsidian, "file.md"), "x")
	if code, _, _ = h.run("vault", "tasknotes", filepath.Join(obsidian, "file.md"), "--vault", dir); code != ExitUsage {
		t.Fatalf("a file: %d", code)
	}
	// Inside the vault folder only with --inside.
	inner := filepath.Join(dir, "Notes")
	if err := os.MkdirAll(inner, 0o755); err != nil {
		t.Fatal(err)
	}
	if code, _, errb = h.run("vault", "tasknotes", inner, "--vault", dir); code != ExitUsage || !strings.Contains(errb, "--inside") {
		t.Fatalf("inside: %d %q", code, errb)
	}
	// Link the folder next to the vault and sync: the note becomes a task.
	folder := filepath.Join(obsidian, "TaskNotes", "Tasks")
	writeFile(t, filepath.Join(folder, "Fix ebook cover.md"), "---\ntitle: Fix ebook cover\nstatus: open\ntags:\n  - task\n---\n")
	out := h.mustRun("vault", "tasknotes", folder, "--vault", dir, "--json")
	var linked map[string]any
	if err := json.Unmarshal([]byte(out), &linked); err != nil || linked["linked"] != true || linked["folder"] == "" {
		t.Fatalf("link: %s", out)
	}
	out = h.mustRun("vault", "sync", dir)
	if !strings.Contains(out, "created \"Fix ebook cover\"") {
		t.Fatalf("sync: %s", out)
	}
	note := readFile(t, filepath.Join(folder, "Fix ebook cover.md"))
	if !strings.Contains(note, "opentodo-id: ") {
		t.Fatalf("note:\n%s", note)
	}
	// Status names changed notes without the server.
	replaceIn(t, filepath.Join(folder, "Fix ebook cover.md"), "status: open", "status: done")
	out = h.mustRun("vault", "status", dir)
	if !strings.Contains(out, "Fix ebook cover.md") {
		t.Fatalf("status: %s", out)
	}
	// The watch snapshot includes the linked folder.
	snap := snapshot(dir)
	found := false
	for p := range snap {
		if strings.HasSuffix(p, "Fix ebook cover.md") {
			found = true
		}
	}
	if !found {
		t.Fatalf("snapshot misses the note: %v", snap)
	}
	// A read token: insufficient_scope, nothing changed.
	_, secret := h.apiToken2("read")
	h.setToken(secret)
	code, out, _ = h.run("vault", "tasknotes", "--off", "--vault", dir, "--json")
	if code != ExitNotPermitted || !strings.Contains(out, "insufficient_scope") {
		t.Fatalf("read token: %d %s", code, out)
	}
	delete(h.env, "OPENTODO_URL")
	delete(h.env, "OPENTODO_TOKEN")
	// Unlink.
	out = h.mustRun("vault", "tasknotes", "--off", "--vault", dir)
	if !strings.Contains(out, "unlinked") || strings.Contains(readFile(t, statePath), `"tasknotes"`) {
		t.Fatalf("off: %s", out)
	}
}
