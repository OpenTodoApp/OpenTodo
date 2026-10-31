package vault

import (
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestStandaloneNotesLeftOut (notes-overview): a pull that carries standalone
// notes (entity note) writes nothing of them to the vault files or the state
// file, a task's pending append never reaches its Markdown line, and the vault
// never sends an op for either back.
func TestStandaloneNotesLeftOut(t *testing.T) {
	dir := t.TempDir()
	var log []Op
	log = append(log, project("p-home", "Home")...)
	log = append(log, task("t1", "Water", "p-home", nil)...)
	log = append(log, task("t2", "Rent", "", nil)...)
	log = append(log, row("note", "note-home", map[string]any{"title": "Wifi password", "description": "secret-home-text", "project_id": "p-home",
		"labels": []string{}, "position": 1, "created_at": 1, "deleted_at": nil, "appends.a1": "appended-note-text"})...)
	log = append(log, row("note", "note-inbox", map[string]any{"title": "Loose thought", "description": "secret-inbox-text", "project_id": nil,
		"labels": []string{}, "position": 2, "created_at": 1, "deleted_at": nil})...)
	log = append(log, row("task", "t1", map[string]any{"appends.a2": "appended-task-text"})...)
	f := &fake{log: log}
	if _, err := runFake(t, dir, f, NewState("default", "http://x")); err != nil {
		t.Fatal(err)
	}
	// A second run sees the files it wrote and must not turn anything into ops.
	if _, err := runFake(t, dir, f, nil); err != nil {
		t.Fatal(err)
	}
	var sawTask bool
	err := filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		b, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		text := string(b)
		if strings.Contains(text, "Water") {
			sawTask = true
		}
		leaks := []string{"note-home", "note-inbox", "Wifi password", "Loose thought", "secret-home-text", "secret-inbox-text", "appended-note-text"}
		if strings.HasSuffix(path, ".md") {
			// The state file mirrors every pulled task field as the merge base
			// (a task's appends.<id> included); the Markdown never shows one.
			leaks = append(leaks, "appended-task-text")
		}
		for _, leak := range leaks {
			if strings.Contains(text, leak) {
				t.Errorf("%s contains %q:\n%s", path, leak, text)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if !sawTask {
		t.Fatal("the task itself was not written: the vault did not sync")
	}
	for _, op := range f.received {
		if op.Entity == "note" || strings.HasPrefix(op.Field, "appends.") {
			t.Errorf("vault sent %s.%s for %s", op.Entity, op.Field, op.EntityID)
		}
	}
}
