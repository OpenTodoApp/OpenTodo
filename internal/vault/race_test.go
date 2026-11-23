package vault

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
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
	// The save's first step as the sync reads it: a line short (an empty first
	// step is held before the merge, TestEmptyFileMidSaveTrashesNothing).
	v.write(t, "Home.md", strings.Replace(saved, lineOf(t, saved, "Call mum")+"\n", "", 1))
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

// TestSaveHeldEmptyThroughTheRunIsNotPushed: the save's empty first step lasts
// through the whole read and the check before the push (the writer was paused
// between its two steps), so the file reads the same both times. The watch
// knows the folder changed after its run started (Settled false): nothing is
// pushed, and the next sync reads the whole save (TestVaultWatch on CI,
// 16 Nov: Home.md left with only its front matter).
func TestSaveHeldEmptyThroughTheRunIsNotPushed(t *testing.T) {
	s := newServer(t)
	home := s.create("projects", map[string]any{"name": "Home"})
	pay := s.create("tasks", map[string]any{"title": "Pay rent", "project_id": home})
	v := s.vault(t)
	saved := v.read(t, "Home.md") + "- [ ] Buy seeds\n"
	v.write(t, "Home.md", "") // the first step, still on disk at the push
	rep, err := Sync(context.Background(), v.opts(&Options{Settled: func() bool { return false }}))
	if err != nil {
		t.Fatal(err)
	}
	if !hasEvent(rep, "skipped", "Home.md") {
		t.Errorf("report %+v", rep)
	}
	if s.get("tasks", pay)["deleted_at"] != nil {
		t.Fatal("the task was trashed from the half-saved file")
	}
	v.write(t, "Home.md", saved)
	if rep := v.sync(t); rep.Created != 1 {
		t.Fatalf("second sync %+v", rep)
	}
	if s.get("tasks", pay)["deleted_at"] != nil {
		t.Fatal("the task was trashed")
	}
}

// TestEmptyFileMidSaveTrashesNothing (the TestVaultWatch data loss): an editor
// saves in two steps, an empty file and then its text, and a sync reads the
// empty step. Every check after the read (the re-read before the push, the
// watch's snapshot) still saw the same empty file, so the sync trashed every
// task of it in the app and wrote the file over the save. A vault file the
// sync wrote is never empty (its frontmatter at least), so an empty one is a
// save still under way: that file is neither read nor written, the rest of the
// vault syncs, and the next sync reads the save.
func TestEmptyFileMidSaveTrashesNothing(t *testing.T) {
	s := newServer(t)
	home := s.create("projects", map[string]any{"name": "Home"})
	lamp := s.create("tasks", map[string]any{"title": "Fix the lamp", "project_id": home})
	v := s.vault(t)
	saved := v.read(t, "Home.md")
	v.write(t, "Home.md", "")
	rep := v.sync(t)
	if got := s.get("tasks", lamp)["deleted_at"]; got != nil {
		t.Fatalf("the empty step trashed the task: deleted_at %v", got)
	}
	if text := v.read(t, "Home.md"); text != "" {
		t.Fatalf("the half-saved file was written over:\n%s", text)
	}
	if rep.Written != 0 || !hasEvent(rep, "skipped", "Home.md") {
		t.Errorf("report %+v", rep)
	}
	// The save completes; the next sync keeps the task and adds the new line.
	v.write(t, "Home.md", saved+"- [ ] Oil the hinge\n")
	if rep := v.sync(t); rep.Created != 1 {
		t.Fatalf("second sync %+v", rep)
	}
	text := v.read(t, "Home.md")
	if !strings.Contains(text, "Fix the lamp") || !strings.Contains(lineOf(t, text, "Oil the hinge"), "🆔 ") {
		t.Fatalf("saved file:\n%s", text)
	}
	if got := s.get("tasks", lamp)["deleted_at"]; got != nil {
		t.Fatalf("the task was trashed later: deleted_at %v", got)
	}
}

// TestEmptyFileMidSaveHoldsOnlyThatFile: while one file is half saved, an edit
// in another file still reaches the app.
func TestEmptyFileMidSaveHoldsOnlyThatFile(t *testing.T) {
	s := newServer(t)
	home := s.create("projects", map[string]any{"name": "Home"})
	work := s.create("projects", map[string]any{"name": "Work"})
	lamp := s.create("tasks", map[string]any{"title": "Fix the lamp", "project_id": home})
	s.create("tasks", map[string]any{"title": "Send the invoice", "project_id": work})
	v := s.vault(t)
	v.write(t, "Home.md", "")
	v.edit(t, "Work.md", "- [ ] Send the invoice", "- [ ] Send the invoice 📅 2026-11-30")
	rep := v.sync(t)
	if rep.Updated != 1 || !hasEvent(rep, "skipped", "Home.md") {
		t.Fatalf("report %+v", rep)
	}
	if got := s.get("tasks", lamp)["deleted_at"]; got != nil {
		t.Fatalf("the half-saved file's task was trashed: %v", got)
	}
	if text := v.read(t, "Home.md"); text != "" {
		t.Fatalf("the half-saved file was written over:\n%s", text)
	}
}

// TestEmptyFileMidSaveAfterPartialMove: one line was cut from Home.md into
// Work.md, and the sync reads Home.md at its empty save step. The moved line
// does not make the empty file real: its other tasks stay.
func TestEmptyFileMidSaveAfterPartialMove(t *testing.T) {
	s := newServer(t)
	home := s.create("projects", map[string]any{"name": "Home"})
	s.create("projects", map[string]any{"name": "Work"})
	lamp := s.create("tasks", map[string]any{"title": "Fix the lamp", "project_id": home})
	mum := s.create("tasks", map[string]any{"title": "Call mum", "project_id": home})
	v := s.vault(t)
	line := lineOf(t, v.read(t, "Home.md"), "Fix the lamp")
	v.write(t, "Work.md", v.read(t, "Work.md")+line+"\n")
	v.write(t, "Home.md", "")
	rep := v.sync(t)
	if !hasEvent(rep, "skipped", "Home.md") {
		t.Errorf("report %+v", rep)
	}
	for _, id := range []string{lamp, mum} {
		if s.get("tasks", id)["deleted_at"] != nil {
			t.Fatalf("task %s was trashed", id)
		}
	}
	if v.read(t, "Home.md") != "" {
		t.Fatalf("the half-saved file was written over:\n%s", v.read(t, "Home.md"))
	}
}

// TestEmptyFileMidSaveWithoutTasks: a project file holding only prose is read
// at its empty save step: it is held too, and no second project is made.
func TestEmptyFileMidSaveWithoutTasks(t *testing.T) {
	s := newServer(t)
	s.create("projects", map[string]any{"name": "Home"})
	v := s.vault(t)
	saved := v.read(t, "Home.md") + "\nIdeas for the garden.\n"
	v.write(t, "Home.md", saved)
	v.sync(t)
	v.write(t, "Home.md", "")
	rep := v.sync(t)
	if !hasEvent(rep, "skipped", "Home.md") || rep.Written != 0 {
		t.Errorf("report %+v", rep)
	}
	if got := len(s.list("projects")); got != 1 {
		t.Fatalf("%d projects, want 1", got)
	}
	v.write(t, "Home.md", saved)
	v.sync(t)
	if got := len(s.list("projects")); got != 1 {
		t.Fatalf("%d projects after the save, want 1", got)
	}
	if !strings.Contains(v.read(t, "Home.md"), "Ideas for the garden.") {
		t.Fatalf("file:\n%s", v.read(t, "Home.md"))
	}
}

// TestFileEmptiedOnPurpose: a file still empty a while after it was first held
// was emptied on purpose: its tasks go.
func TestFileEmptiedOnPurpose(t *testing.T) {
	s := newServer(t)
	home := s.create("projects", map[string]any{"name": "Home"})
	lamp := s.create("tasks", map[string]any{"title": "Fix the lamp", "project_id": home})
	v := s.vault(t)
	v.write(t, "Home.md", "")
	if rep := v.sync(t); !hasEvent(rep, "skipped", "Home.md") {
		t.Fatalf("first sync %+v", rep)
	}
	later := time.Now().Add(2 * halfSavedHold)
	v.now = func() time.Time { return later }
	rep := v.sync(t)
	if hasEvent(rep, "skipped", "Home.md") {
		t.Fatalf("held again: %+v", rep)
	}
	for _, task := range s.list("tasks") {
		if task["id"] == lamp && task["deleted_at"] == nil {
			t.Fatalf("the task of the emptied file stays: %+v", rep)
		}
	}
	// The project stays, with no second one and no "Home 2.md"
	// (vault-file-keeps-project); the file gets its front matter back.
	if got := len(s.list("projects")); got != 1 {
		t.Fatalf("%d projects, want 1", got)
	}
	if _, err := os.Stat(filepath.Join(v.dir, "Home 2.md")); err == nil {
		t.Fatal("Home 2.md was written")
	}
	if text := v.read(t, "Home.md"); !strings.Contains(text, "opentodo-id: "+home) {
		t.Fatalf("Home.md:\n%s", text)
	}
}

// TestEmptyFileHeldAcrossQuickSyncs: the watch syncs again while the save's
// empty step still lasts (another file changed): the file is held again, and
// the save that lands then keeps every task.
func TestEmptyFileHeldAcrossQuickSyncs(t *testing.T) {
	s := newServer(t)
	home := s.create("projects", map[string]any{"name": "Home"})
	work := s.create("projects", map[string]any{"name": "Work"})
	lamp := s.create("tasks", map[string]any{"title": "Fix the lamp", "project_id": home})
	s.create("tasks", map[string]any{"title": "Send the invoice", "project_id": work})
	v := s.vault(t)
	saved := v.read(t, "Home.md")
	v.write(t, "Home.md", "")
	if rep := v.sync(t); !hasEvent(rep, "skipped", "Home.md") {
		t.Fatalf("first sync %+v", rep)
	}
	v.edit(t, "Work.md", "- [ ] Send the invoice", "- [ ] Send the invoice 📅 2026-11-30")
	if rep := v.sync(t); !hasEvent(rep, "skipped", "Home.md") || rep.Updated != 1 {
		t.Fatalf("second sync %+v", rep)
	}
	if got := s.get("tasks", lamp)["deleted_at"]; got != nil {
		t.Fatalf("the second sync at the empty step trashed the task: %v", got)
	}
	v.write(t, "Home.md", saved+"- [ ] Oil the hinge\n")
	if rep := v.sync(t); rep.Created != 1 {
		t.Fatalf("the save %+v", rep)
	}
	if got := s.get("tasks", lamp)["deleted_at"]; got != nil {
		t.Fatalf("the task was trashed after the save: %v", got)
	}
}

// TestEmptyFileHoldEndsWhenTheClockWentBack: a hold time in the future (the
// clock was set back since) does not hold the file for hours: the file syncs
// as it is.
func TestEmptyFileHoldEndsWhenTheClockWentBack(t *testing.T) {
	s := newServer(t)
	home := s.create("projects", map[string]any{"name": "Home"})
	lamp := s.create("tasks", map[string]any{"title": "Fix the lamp", "project_id": home})
	v := s.vault(t)
	v.write(t, "Home.md", "")
	ahead := time.Now().Add(3 * time.Hour)
	v.now = func() time.Time { return ahead }
	if rep := v.sync(t); !hasEvent(rep, "skipped", "Home.md") {
		t.Fatalf("first sync %+v", rep)
	}
	v.now = time.Now
	if rep := v.sync(t); hasEvent(rep, "skipped", "Home.md") {
		t.Fatalf("held with a hold time hours ahead: %+v", rep)
	}
	for _, task := range s.list("tasks") {
		if task["id"] == lamp && task["deleted_at"] == nil {
			t.Fatal("the task of the file emptied on purpose stays")
		}
	}
}
