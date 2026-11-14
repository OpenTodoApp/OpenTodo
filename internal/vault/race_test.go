package vault

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// during runs fn once, right before the next sync writes the vault's files:
// a save landing after the sync read the folder (vault-write-check).
func during(t *testing.T, fn func()) {
	t.Helper()
	done := false
	testHookBeforeWrite = func() {
		if !done {
			done = true
			fn()
		}
	}
	t.Cleanup(func() { testHookBeforeWrite = nil })
}

// TestSaveDuringSyncIsNotOverwritten: a file the app changed is not written
// when it was saved after the sync read it; the next sync merges the save
// with the app's change.
func TestSaveDuringSyncIsNotOverwritten(t *testing.T) {
	s := newServer(t)
	home := s.create("projects", map[string]any{"name": "Home"})
	pay := s.create("tasks", map[string]any{"title": "Pay rent", "project_id": home})
	s.create("tasks", map[string]any{"title": "Call mum", "project_id": home})
	v := s.vault(t)
	s.do("PATCH", "/api/v1/tasks/"+pay, map[string]any{"title": "Pay the rent"})
	during(t, func() { v.edit(t, "Home.md", "- [ ] Call mum", "- [ ] Call mum 📅 2026-11-05") })
	rep := v.sync(t)
	text := v.read(t, "Home.md")
	if !strings.Contains(text, "Call mum 📅 2026-11-05") || strings.Contains(text, "Pay the rent") {
		t.Fatalf("the save was overwritten or the file written:\n%s", text)
	}
	if rep.Written != 0 || !hasEvent(rep, "skipped", "Home.md") {
		t.Errorf("report %+v", rep)
	}
	// The next sync merges both: the save reaches the app, the app's title
	// reaches the file, and nothing is reverted.
	if rep := v.sync(t); rep.Updated != 1 {
		t.Errorf("second sync: %+v", rep)
	}
	text = v.read(t, "Home.md")
	if !strings.Contains(text, "Pay the rent") || !strings.Contains(lineOf(t, text, "Call mum"), "📅 2026-11-05") {
		t.Errorf("merged file:\n%s", text)
	}
	if s.get("tasks", pay)["title"] != "Pay the rent" {
		t.Errorf("the app's title was reverted: %v", s.get("tasks", pay)["title"])
	}
	if rep := v.sync(t); rep.Written != 0 || rep.Updated != 0 || rep.Created != 0 {
		t.Errorf("third sync not idle: %+v", rep)
	}
}

// TestSaveDuringSyncKeepsNewLineIDs: a new line read by the sync gets its id
// in the saved file, so the next sync does not create its task again.
func TestSaveDuringSyncKeepsNewLineIDs(t *testing.T) {
	s := newServer(t)
	home := s.create("projects", map[string]any{"name": "Home"})
	s.create("tasks", map[string]any{"title": "Pay rent", "project_id": home})
	v := s.vault(t)
	v.write(t, "Home.md", v.read(t, "Home.md")+"- [ ] Order compost\n")
	during(t, func() { v.write(t, "Home.md", v.read(t, "Home.md")+"- [ ] Buy seeds\n") })
	if rep := v.sync(t); rep.Created != 1 {
		t.Fatalf("report %+v", rep)
	}
	text := v.read(t, "Home.md")
	if !strings.Contains(lineOf(t, text, "Order compost"), "🆔 ") || strings.Contains(lineOf(t, text, "Buy seeds"), "🆔") {
		t.Fatalf("saved file:\n%s", text)
	}
	if rep := v.sync(t); rep.Created != 1 {
		t.Fatalf("second sync %+v", rep)
	}
	n := 0
	for _, task := range s.list("tasks") {
		if task["title"] == "Order compost" {
			n++
		}
	}
	if n != 1 {
		t.Errorf("Order compost created %d times", n)
	}
	if rep := v.sync(t); rep.Written != 0 || rep.Updated != 0 || rep.Created != 0 {
		t.Errorf("third sync not idle: %+v", rep)
	}
}

// TestSaveDuringSyncIsNotRemoved: the file of a project archived in the app
// is kept when it was saved after the sync read it.
func TestSaveDuringSyncIsNotRemoved(t *testing.T) {
	s := newServer(t)
	home := s.create("projects", map[string]any{"name": "Home"})
	s.create("tasks", map[string]any{"title": "Pay rent", "project_id": home})
	v := s.vault(t)
	s.do("PATCH", "/api/v1/projects/"+home, map[string]any{"archived": true})
	during(t, func() { v.edit(t, "Home.md", "- [ ] Pay rent", "- [ ] Pay rent today") })
	v.sync(t)
	if _, err := os.Stat(filepath.Join(v.dir, "Home.md")); err != nil {
		t.Fatalf("the saved file was removed: %v", err)
	}
	// The next sync sees an edited file of an archived project: a conflict
	// file that holds the save.
	v.sync(t)
	if b, err := os.ReadFile(filepath.Join(v.dir, "Home.conflict.md")); err != nil || !strings.Contains(string(b), "Pay rent today") {
		t.Errorf("conflict file: %v %q", err, b)
	}
}

// TestNoteSavedDuringSyncIsNotOverwritten: a task note saved after the sync
// read it is not written; a new note still gets its task's id.
func TestNoteSavedDuringSyncIsNotOverwritten(t *testing.T) {
	s := newServer(t)
	v := s.vault(t)
	n := v.linkNotes(t, "default.json")
	n.put(t, "Fix cover.md", "---\ntitle: Fix cover\ntags:\n  - task\n---\n")
	during(t, func() {
		n.put(t, "Fix cover.md", "---\ntitle: Fix cover\ntags:\n  - task\n---\nBody typed meanwhile.\n")
	})
	if rep := v.sync(t); rep.Created != 1 {
		t.Fatalf("report %+v", rep)
	}
	text := n.note(t, "Fix cover.md")
	id := n.idOf(t, "Fix cover.md")
	if !strings.Contains(text, "Body typed meanwhile.") {
		t.Fatalf("the save was overwritten:\n%s", text)
	}
	v.sync(t)
	got := 0
	for _, task := range s.list("tasks") {
		if task["title"] == "Fix cover" {
			got++
		}
	}
	if got != 1 || !strings.Contains(s.get("tasks", id)["description"].(string), "Body typed meanwhile.") {
		t.Errorf("tasks named Fix cover: %d, task %v", got, s.get("tasks", id))
	}
}

func hasEvent(rep *Report, kind, file string) bool {
	for _, e := range rep.Events {
		if e.Kind == kind && e.File == file {
			return true
		}
	}
	return false
}

// beforePush runs fn once, right before the next sync pushes its ops: a save
// landing after the sync read the folder but before anything was sent.
func beforePush(t *testing.T, fn func()) {
	t.Helper()
	done := false
	testHookBeforePush = func() {
		if !done {
			done = true
			fn()
		}
	}
	t.Cleanup(func() { testHookBeforePush = nil })
}

// TestHalfSavedFileIsNotPushed: a sync that read a file in the middle of a
// save (an editor's empty first step) pushes nothing derived from it when the
// save lands before the push; the next sync reads the whole save, and no task
// the save keeps is trashed (TestVaultWatch on CI ended with an empty Home.md).
func TestHalfSavedFileIsNotPushed(t *testing.T) {
	s := newServer(t)
	home := s.create("projects", map[string]any{"name": "Home"})
	pay := s.create("tasks", map[string]any{"title": "Pay rent", "project_id": home})
	mum := s.create("tasks", map[string]any{"title": "Call mum", "project_id": home})
	v := s.vault(t)
	saved := v.read(t, "Home.md") + "- [ ] Buy seeds\n"
	v.write(t, "Home.md", "") // the save's first step, as the sync reads it
	beforePush(t, func() { v.write(t, "Home.md", saved) })
	rep := v.sync(t)
	if !hasEvent(rep, "skipped", "Home.md") {
		t.Errorf("first sync report %+v", rep)
	}
	for _, id := range []string{pay, mum} {
		if s.get("tasks", id)["deleted_at"] != nil {
			t.Fatalf("task %s was trashed from the half-saved file", id)
		}
	}
	if v.read(t, "Home.md") != saved {
		t.Fatalf("the save was overwritten:\n%s", v.read(t, "Home.md"))
	}
	// The next sync reads the whole save: the new line becomes a task and the
	// others stay.
	if rep := v.sync(t); rep.Created != 1 {
		t.Fatalf("second sync %+v", rep)
	}
	text := v.read(t, "Home.md")
	for _, title := range []string{"Pay rent", "Call mum", "Buy seeds"} {
		if !strings.Contains(lineOf(t, text, title), "🆔 ") {
			t.Errorf("%s lost or without id:\n%s", title, text)
		}
	}
	for _, id := range []string{pay, mum} {
		if s.get("tasks", id)["deleted_at"] != nil {
			t.Errorf("task %s trashed after the second sync", id)
		}
	}
}

// TestHalfSavedNoteIsNotPushed: a note file read in the middle of a save (an
// empty file, without its opentodo-id) is not trashed and its body not
// cleared when the save lands before the push.
func TestHalfSavedNoteIsNotPushed(t *testing.T) {
	s := newServer(t)
	s.newNote(t, "n-pack", "Packing list", "Socks\nCharger", "", nil)
	v := s.notesVault(t)
	saved := strings.Replace(v.read(t, "Notes/Packing list.md"), "Charger\n", "Charger\nPassport\n", 1)
	v.write(t, "Notes/Packing list.md", "")
	beforePush(t, func() { v.write(t, "Notes/Packing list.md", saved) })
	rep := v.sync(t)
	if !hasEvent(rep, "skipped", "Notes/Packing list.md") {
		t.Errorf("first sync report %+v", rep)
	}
	note := s.account(t).Get("note", "n-pack")
	if note == nil || !note.Live() || note.Str("description") != "Socks\nCharger" {
		t.Fatalf("the half-saved file reached the note: %+v", note)
	}
	v.sync(t)
	if got := noteDesc(t, s, "n-pack"); got != "Socks\nCharger\nPassport" {
		t.Errorf("after the whole save the note holds %q", got)
	}
}
