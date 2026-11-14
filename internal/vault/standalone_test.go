package vault

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// The tests of OpenSpec change vault-notes: standalone notes as files in Notes/,
// against the real server, with a phone that writes through the sync exchange.

// phoneTS keeps the phone's timestamps strictly increasing.
var phoneTS int64

// phone writes fields of one entity as another device would.
func (s *server) phone(t *testing.T, entity, id string, fields map[string]any) {
	t.Helper()
	ts := time.Now().UnixMilli()
	if ts <= phoneTS {
		ts = phoneTS + 1
	}
	phoneTS = ts
	var ops []Op
	for f, v := range fields {
		raw, _ := json.Marshal(v)
		ops = append(ops, Op{ID: "phone-" + entity + id + f + time.Now().Format("150405.000000000"), Entity: entity, EntityID: id, Field: f, Value: raw, TS: ts, Device: "web:phone"})
	}
	tr := &HTTPTransport{URL: s.url, Token: s.token}
	rep, err := tr.Exchange(context.Background(), Request{Device: "web:phone", Cursor: 1 << 62, Ops: ops})
	if err != nil {
		t.Fatal(err)
	}
	if len(rep.Rejected) > 0 {
		t.Fatalf("phone ops refused: %+v", rep.Rejected)
	}
}

// newNote creates a standalone note from the phone.
func (s *server) newNote(t *testing.T, id, title, body, project string, labels []string) {
	t.Helper()
	if labels == nil {
		labels = []string{}
	}
	s.phone(t, "note", id, map[string]any{"title": title, "description": body, "project_id": nullable(project), "labels": labels,
		"position": 1, "created_at": time.Now().UnixMilli(), "deleted_at": nil})
}

// account pulls the whole log as a fresh device sees it.
func (s *server) account(t *testing.T) Store {
	t.Helper()
	tr := &HTTPTransport{URL: s.url, Token: s.token}
	st := Store{}
	cursor := int64(0)
	for {
		rep, err := tr.Exchange(context.Background(), Request{Device: "web:reader", Cursor: cursor, Ops: []Op{}})
		if err != nil {
			t.Fatal(err)
		}
		for _, op := range rep.Ops {
			st.Apply(op)
		}
		cursor = rep.Cursor
		if !rep.HasMore {
			return st
		}
	}
}

// notesVault is a vault made with notes on, as `ot vault init` does.
func (s *server) notesVault(t *testing.T) *vaultT {
	t.Helper()
	v := &vaultT{s: s, dir: t.TempDir(), now: time.Now}
	st := NewState("default", s.url)
	st.Notes = true
	if _, err := Sync(context.Background(), v.opts(&Options{State: st})); err != nil {
		t.Fatal(err)
	}
	return v
}

func noteDesc(t *testing.T, s *server, id string) string {
	t.Helper()
	return s.account(t).Get("note", id).Str("description")
}

func TestNotesWritten(t *testing.T) {
	s := newServer(t)
	home := s.create("projects", map[string]any{"name": "Home"})
	s.newNote(t, "n-pack", "Packing list", "Socks\nCharger", home, nil)
	s.newNote(t, "n-wifi", "Wi-Fi", "The password is on the router.", "", nil)
	v := s.notesVault(t)
	pack := v.read(t, "Notes/Packing list.md")
	for _, want := range []string{"opentodo-id: n-pack", `project: "[[Home]]"`, "Socks\nCharger\n"} {
		if !strings.Contains(pack, want) {
			t.Errorf("Packing list.md lacks %q:\n%s", want, pack)
		}
	}
	wifi := v.read(t, "Notes/Wi-Fi.md")
	if strings.Contains(wifi, "project:") || !strings.Contains(wifi, "opentodo-id: n-wifi") {
		t.Errorf("Wi-Fi.md:\n%s", wifi)
	}
	// A second sync changes nothing and sends nothing.
	if rep := v.sync(t); rep.Notes == nil || rep.Notes.Written != 0 || rep.Notes.Changed != 0 || rep.Notes.Notes != 2 {
		t.Errorf("second sync: %+v", rep.Notes)
	}
}

func TestNoteRenameNewFileAndMove(t *testing.T) {
	s := newServer(t)
	home := s.create("projects", map[string]any{"name": "Home"})
	work := s.create("projects", map[string]any{"name": "Work"})
	s.create("projects", map[string]any{"name": "Clients", "parent_id": work})
	s.newNote(t, "n-wifi", "Wi-Fi", "Router.", home, nil)
	v := s.notesVault(t)
	// Rename the file: the note is renamed and keeps its id.
	if err := os.Rename(filepath.Join(v.dir, "Notes/Wi-Fi.md"), filepath.Join(v.dir, "Notes/Home network.md")); err != nil {
		t.Fatal(err)
	}
	// A new file creates a note with its tag as a label.
	v.write(t, "Notes/Recipes.md", "---\ntags: [cooking]\n---\nPancakes.\n\nWaffles.\n")
	v.sync(t)
	acc := s.account(t)
	if got := acc.Get("note", "n-wifi").Str("title"); got != "Home network" {
		t.Errorf("title %q", got)
	}
	var recipes string
	for _, id := range acc.IDs("note") {
		if acc.Get("note", id).Str("title") == "Recipes" {
			recipes = id
		}
	}
	if recipes == "" {
		t.Fatal("no note Recipes")
	}
	r := acc.Get("note", recipes)
	if r.Str("description") != "Pancakes.\n\nWaffles." || len(r.Strs("labels")) != 1 {
		t.Errorf("Recipes: %q %v", r.Str("description"), r.Strs("labels"))
	}
	if !strings.Contains(v.read(t, "Notes/Recipes.md"), "opentodo-id: "+recipes) {
		t.Errorf("Recipes.md has no id:\n%s", v.read(t, "Notes/Recipes.md"))
	}
	// Move by front matter, then a link that names no project file.
	v.edit(t, "Notes/Home network.md", `project: "[[Home]]"`, `project: "[[Work/Work]]"`)
	v.sync(t)
	if got := s.account(t).Get("note", "n-wifi").Str("project_id"); got != work {
		t.Errorf("project %q, want Work %q", got, work)
	}
	v.edit(t, "Notes/Home network.md", `project: "[[Work/Work]]"`, `project: "[[Nowhere]]"`)
	rep := v.sync(t)
	if got := s.account(t).Get("note", "n-wifi").Str("project_id"); got != work {
		t.Errorf("an unknown project link moved the note to %q", got)
	}
	if !strings.Contains(strings.Join(rep.Warnings, "\n"), "names no project file") {
		t.Errorf("no warning for the unknown project: %v", rep.Warnings)
	}
}

func TestNoteMergeDifferentLines(t *testing.T) {
	s := newServer(t)
	s.newNote(t, "n-pack", "Packing list", "Socks\nCharger\nBook", "", nil)
	v := s.notesVault(t)
	v.edit(t, "Notes/Packing list.md", "Book\n", "Book\nPassport\n")
	s.phone(t, "note", "n-pack", map[string]any{"description": "Wool socks\nCharger\nBook"})
	rep := v.sync(t)
	want := "Wool socks\nCharger\nBook\nPassport"
	if got := noteDesc(t, s, "n-pack"); got != want {
		t.Errorf("app %q, want %q", got, want)
	}
	if !strings.Contains(v.read(t, "Notes/Packing list.md"), want+"\n") {
		t.Errorf("file:\n%s", v.read(t, "Notes/Packing list.md"))
	}
	if rep.Conflicts != 0 {
		t.Errorf("%d conflicts", rep.Conflicts)
	}
}

func TestNoteMergeSameLine(t *testing.T) {
	s := newServer(t)
	s.newNote(t, "n-pack", "Packing list", "Socks\nCharger\nBook", "", nil)
	v := s.notesVault(t)
	v.edit(t, "Notes/Packing list.md", "Charger\n", "Two chargers\n")
	s.phone(t, "note", "n-pack", map[string]any{"description": "Socks\nUSB-C charger\nBook"})
	rep := v.sync(t)
	if got := noteDesc(t, s, "n-pack"); got != "Socks\nUSB-C charger\nBook" {
		t.Errorf("app %q", got)
	}
	if rep.Conflicts != 1 {
		t.Errorf("%d conflicts", rep.Conflicts)
	}
	if c := v.read(t, "Notes/Packing list.conflict.md"); !strings.Contains(c, "Two chargers") {
		t.Errorf("conflict file:\n%s", c)
	}
	if f := v.read(t, "Notes/Packing list.md"); !strings.Contains(f, "USB-C charger") {
		t.Errorf("file not written from the app:\n%s", f)
	}
}

// A phone edit made after the vault pulled and before it pushes wins, and the
// next sync merges the three versions instead of losing either.
func TestNoteStalePush(t *testing.T) {
	s := newServer(t)
	s.newNote(t, "n-pack", "Packing list", "Socks\nCharger\nBook", "", nil)
	v := s.notesVault(t)
	v.edit(t, "Notes/Packing list.md", "Book\n", "Book\nPassport\n")
	tr := &racingTransport{Transport: &HTTPTransport{URL: s.url, Token: s.token}, before: func() {
		s.phone(t, "note", "n-pack", map[string]any{"description": "Wool socks\nCharger\nBook"})
	}}
	r1, err := Sync(context.Background(), v.opts(&Options{Transport: tr}))
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("racing: %+v %+v", r1.Notes, r1.Events)
	if got := noteDesc(t, s, "n-pack"); got != "Wool socks\nCharger\nBook" {
		t.Errorf("after the racing sync the app holds %q", got)
	}
	r2 := v.sync(t)
	t.Logf("next: %+v %+v %v", r2.Notes, r2.Events, r2.Warnings)
	if got := noteDesc(t, s, "n-pack"); got != "Wool socks\nCharger\nBook\nPassport" {
		t.Errorf("after the next sync the app holds %q", got)
	}
}

// racingTransport runs before() once, just before the first push.
type racingTransport struct {
	Transport
	before func()
	done   bool
}

func (r *racingTransport) Exchange(ctx context.Context, req Request) (Reply, error) {
	if len(req.Ops) > 0 && !r.done {
		r.done = true
		r.before()
	}
	return r.Transport.Exchange(ctx, req)
}

func TestNoteLinks(t *testing.T) {
	s := newServer(t)
	home := s.create("projects", map[string]any{"name": "Home"})
	s.newNote(t, "n-ferry", "Ferry times", "8:10 and 17:40", "", nil)
	body := "Take the [Ferry times](?note=n-ferry). Packing: [Home](?project=" + home + ") and [a task](?task=t-1).\n\n`[code](?note=n-ferry)`"
	s.newNote(t, "n-trip", "Trip", body, "", nil)
	v := s.notesVault(t)
	trip := v.read(t, "Notes/Trip.md")
	for _, want := range []string{"[Ferry times](Ferry%20times.md)", "[Home](../Home.md)", "[a task](?task=t-1)", "`[code](?note=n-ferry)`"} {
		if !strings.Contains(trip, want) {
			t.Errorf("Trip.md lacks %q:\n%s", want, trip)
		}
	}
	// A round trip leaves the app's Markdown as it was.
	v.edit(t, "Notes/Trip.md", "Take the", "Take  the")
	v.sync(t)
	v.edit(t, "Notes/Trip.md", "Take  the", "Take the")
	v.sync(t)
	if got := noteDesc(t, s, "n-trip"); got != body {
		t.Errorf("round trip:\n%q\nwant\n%q", got, body)
	}
	// A link written in the file reads back as the id form.
	v.edit(t, "Notes/Trip.md", "Take the", "See [Home](../Home.md). Take the")
	v.sync(t)
	if got := noteDesc(t, s, "n-trip"); !strings.HasPrefix(got, "See [Home](?project="+home+"). Take the") {
		t.Errorf("link not read back: %q", got)
	}
}

func TestNoteDeleteAndTrash(t *testing.T) {
	s := newServer(t)
	s.newNote(t, "n-rec", "Recipes", "Pancakes", "", nil)
	s.newNote(t, "n-keep", "Keep", "One", "", nil)
	s.newNote(t, "n-gone", "Gone", "Two", "", nil)
	v := s.notesVault(t)
	// Deleted with nothing changed in the app: trashed.
	_ = os.Remove(filepath.Join(v.dir, "Notes/Recipes.md"))
	rep := v.sync(t)
	if !s.account(t).Get("note", "n-rec").Set("deleted_at") || rep.Notes.Trashed != 1 {
		t.Errorf("Recipes not trashed: %+v", rep.Notes)
	}
	// Deleted while the phone edited it: written again with the phone's text.
	_ = os.Remove(filepath.Join(v.dir, "Notes/Keep.md"))
	s.phone(t, "note", "n-keep", map[string]any{"description": "One and a half"})
	v.sync(t)
	if s.account(t).Get("note", "n-keep").Set("deleted_at") || !strings.Contains(v.read(t, "Notes/Keep.md"), "One and a half") {
		t.Error("Keep was not restored with the phone's text")
	}
	// Trashed on the phone while the file was edited: kept as a conflict file.
	v.edit(t, "Notes/Gone.md", "Two", "Two, edited")
	s.phone(t, "note", "n-gone", map[string]any{"deleted_at": time.Now().UnixMilli()})
	v.sync(t)
	if _, err := os.Stat(filepath.Join(v.dir, "Notes/Gone.md")); !os.IsNotExist(err) {
		t.Error("Gone.md is still there")
	}
	if !strings.Contains(v.read(t, "Notes/Gone.conflict.md"), "Two, edited") {
		t.Error("no conflict file for Gone")
	}
	if !s.account(t).Get("note", "n-gone").Set("deleted_at") {
		t.Error("Gone left the Trash")
	}
}

func TestNotesOffAndOn(t *testing.T) {
	s := newServer(t)
	s.newNote(t, "n-1", "First", "One", "", nil)
	// A vault of an earlier version: no notes until they are turned on.
	v := s.vault(t)
	if _, err := os.Stat(filepath.Join(v.dir, NotesDir)); !os.IsNotExist(err) {
		t.Fatal("Notes/ written for a vault without notes")
	}
	if changed, err := SetNotes(v.dir, true); err != nil || !changed {
		t.Fatal(changed, err)
	}
	v.sync(t)
	if !strings.Contains(v.read(t, "Notes/First.md"), "opentodo-id: n-1") {
		t.Fatal("First.md not written after notes on")
	}
	if _, err := SetNotes(v.dir, false); err != nil {
		t.Fatal(err)
	}
	v.write(t, "Notes/While off.md", "Not synced.\n")
	v.sync(t)
	if _, err := SetNotes(v.dir, true); err != nil {
		t.Fatal(err)
	}
	v.sync(t)
	acc := s.account(t)
	titles := map[string]int{}
	for _, id := range acc.IDs("note") {
		if acc.Get("note", id).Live() {
			titles[acc.Get("note", id).Str("title")]++
		}
	}
	if titles["First"] != 1 || titles["While off"] != 1 || len(titles) != 2 {
		t.Errorf("notes after off and on: %v", titles)
	}
	// A project folder of the same name never swallows the notes.
	if _, err := os.Stat(filepath.Join(v.dir, "Notes", "Notes.md")); err == nil {
		t.Error("a project file inside Notes/")
	}
}

func TestNoteLimits(t *testing.T) {
	s := newServer(t)
	s.newNote(t, "n-1", "Big", "x", "", nil)
	v := s.notesVault(t)
	v.write(t, "Notes/Big.md", "---\nopentodo-id: n-1\n---\n"+strings.Repeat("a", MaxNoteBytes+1))
	before := v.read(t, ".opentodo/state.json")
	_, err := Sync(context.Background(), v.opts(&Options{}))
	var le *LimitError
	if !errors.As(err, &le) || !strings.Contains(le.Msg, "Notes/Big.md") {
		t.Fatalf("want a limit error naming the file, got %v", err)
	}
	if v.read(t, ".opentodo/state.json") != before || noteDesc(t, s, "n-1") != "x" {
		t.Error("the sync wrote or pushed past the limit")
	}
}

func TestNoteViewerReadOnly(t *testing.T) {
	// The read-only rule, through a reply that names a viewer's project.
	dir := t.TempDir()
	var log []Op
	log = append(log, project("p-shared", "Shared")...)
	log = append(log, row("note", "n-s", map[string]any{"title": "Theirs", "description": "Fixed", "project_id": "p-shared", "labels": []string{},
		"position": 1, "created_at": 1, "deleted_at": nil})...)
	f := &viewerFake{fake: fake{log: log, shared: []string{"p-shared"}}}
	st := NewState("default", "http://x")
	st.Notes = true
	if _, err := runFake(t, dir, &f.fake, st); err != nil {
		t.Fatal(err)
	}
	p := filepath.Join(dir, "Notes", "Theirs.md")
	b, _ := os.ReadFile(p)
	_ = os.WriteFile(p, []byte(strings.Replace(string(b), "Fixed", "Changed", 1)), 0o644)
	st2, _ := LoadState(dir)
	st2.Viewing = []string{"p-shared"}
	if err := st2.Save(dir); err != nil {
		t.Fatal(err)
	}
	f.fake.received = nil
	rep, err := Sync(context.Background(), Options{Dir: dir, Transport: f, Loc: time.UTC})
	if err != nil {
		t.Fatal(err)
	}
	if got := fieldsSent(&f.fake, "n-s"); len(got) != 0 {
		t.Errorf("a viewer's note sent %v", got)
	}
	if b, _ := os.ReadFile(p); !strings.Contains(string(b), "Fixed") {
		t.Errorf("the app's text was not written back:\n%s", b)
	}
	if !strings.Contains(strings.Join(rep.Warnings, "\n"), "only view") {
		t.Errorf("no read-only warning: %v", rep.Warnings)
	}
}

// viewerFake answers with the shared project as a viewer's.
type viewerFake struct{ fake fake }

func (v *viewerFake) Exchange(ctx context.Context, req Request) (Reply, error) {
	rep, err := v.fake.Exchange(ctx, req)
	for i := range rep.Memberships {
		rep.Memberships[i].Role = "viewer"
	}
	return rep, err
}

func TestNoteMerge3(t *testing.T) {
	cases := []struct {
		base, a, b, want string
		ok               bool
	}{
		{"1\n2\n3", "1\n2\n3\n4", "0\n2\n3", "0\n2\n3\n4", true},
		{"1\n2\n3", "1\nx\n3", "1\ny\n3", "", false},
		{"1\n2\n3", "1\nx\n3", "1\nx\n3", "1\nx\n3", true},
		{"1\n2\n3", "1\n3", "1\n2\n3\n4", "1\n3\n4", true},
		{"", "a", "", "a", true},
		{"1\n2", "1\na\n2", "1\nb\n2", "", false},
	}
	for _, c := range cases {
		got, ok := merge3(c.base, c.a, c.b)
		if ok != c.ok || ok && got != c.want {
			t.Errorf("merge3(%q, %q, %q) = %q, %v; want %q, %v", c.base, c.a, c.b, got, ok, c.want, c.ok)
		}
	}
}

func TestNoteEncrypted(t *testing.T) {
	var c fakeCrypter
	seal := func(id, pt string) string { s, _ := c.Seal("note", id, "title", pt); return s }
	f := &fake{}
	f.log = append(f.log, row("note", "n-enc", map[string]any{"title": seal("n-enc", "Diary"), "description": seal("n-enc", "Dear diary"),
		"project_id": nil, "labels": []string{}, "position": 1, "created_at": 1, "deleted_at": nil})...)
	f.log = append(f.log, row("note", "n-bad", map[string]any{"title": seal("other", "Locked"), "description": seal("other", "Secret"),
		"project_id": nil, "labels": []string{}, "position": 2, "created_at": 2, "deleted_at": nil})...)
	dir := t.TempDir()
	st := NewState("default", "http://x")
	st.Notes = true
	if _, err := runFakeC(t, dir, f, st); err != nil {
		t.Fatal(err)
	}
	p := filepath.Join(dir, "Notes", "Diary.md")
	b, err := os.ReadFile(p)
	if err != nil || !strings.Contains(string(b), "Dear diary") {
		t.Fatalf("Diary.md: %v\n%s", err, b)
	}
	_ = os.WriteFile(p, []byte(strings.Replace(string(b), "Dear diary", "Dear diary, today", 1)), 0o644)
	// The note that does not open is written as the placeholder and never sent.
	var locked string
	entries, _ := os.ReadDir(filepath.Join(dir, "Notes"))
	for _, e := range entries {
		if e.Name() != "Diary.md" {
			locked = filepath.Join(dir, "Notes", e.Name())
		}
	}
	lb, _ := os.ReadFile(locked)
	_ = os.WriteFile(locked, append(lb, []byte("more\n")...), 0o644)
	f.received = nil
	if _, err := runFakeC(t, dir, f, nil); err != nil {
		t.Fatal(err)
	}
	sent := fieldsSent(f, "n-enc")
	if d := sent["description"]; !strings.Contains(d, "enc:v1:n-enc:") || strings.Contains(d, "today") {
		t.Errorf("the body was not sent as ciphertext: %v", sent)
	}
	if got := fieldsSent(f, "n-bad"); len(got) != 0 {
		t.Errorf("an undecryptable note sent %v", got)
	}
}

// TestFixtureNotes pins the note file parser and printer (vault-notes task
// 1.1): each fixture note reads back as the recorded note, links in the id
// form, and the note prints back to the file byte for byte.
func TestFixtureNotes(t *testing.T) {
	s := loadFixture(t)
	v := newView(s, nil, time.UTC, nil)
	v.notesDir = true
	layout := v.Layout()
	paths := notePaths(v)
	links := newNoteLinks(paths, layout)
	entries, err := os.ReadDir("testdata/vault/Notes")
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != len(paths) {
		t.Fatalf("fixture notes %d, notes %v", len(entries), paths)
	}
	for id, p := range paths {
		b, err := os.ReadFile("testdata/vault/" + p)
		if err != nil {
			t.Errorf("note %s: %v", id, err)
			continue
		}
		f := ParseFront(string(b))
		if got := f.str("opentodo-id"); got != id {
			t.Errorf("%s: opentodo-id %q, want %q", p, got, id)
		}
		if got := links.fromFiles(f.Body); normBody(got) != s.Get("note", id).Str("description") {
			t.Errorf("%s: body reads as %q, want %q", p, got, s.Get("note", id).Str("description"))
		}
		pid, ok := projectOfLink(f.str("project"), layout)
		if f.get("project") == nil {
			pid, ok = "", true
		}
		if !ok || pid != s.Get("note", id).Str("project_id") {
			t.Errorf("%s: project %q, want %q", p, pid, s.Get("note", id).Str("project_id"))
		}
		if out := renderNote(v, id, f, links, layout); out != string(b) {
			t.Errorf("%s does not print back:\n%s\n--- want ---\n%s", p, out, b)
		}
		if out := renderNote(v, id, nil, links, layout); out != string(b) {
			t.Errorf("%s printed from nothing differs:\n%s\n--- want ---\n%s", p, out, b)
		}
	}
}
