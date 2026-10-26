package vault

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// obsidianVault makes an Obsidian vault folder holding the TaskNotes settings
// file of testdata/tasknotes/settings/<name> ("" for none) and returns it.
func obsidianVault(t *testing.T, name string) string {
	t.Helper()
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, ".obsidian", "plugins", "tasknotes"), 0o755); err != nil {
		t.Fatal(err)
	}
	if name != "" {
		b, err := os.ReadFile(filepath.Join("testdata", "tasknotes", "settings", name))
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(root, filepath.FromSlash(tnSettingsFile)), b, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return root
}

func TestStateVersionTwo(t *testing.T) {
	dir := t.TempDir()
	// A version-1 state reads as nothing linked.
	if err := os.MkdirAll(filepath.Join(dir, StateDir), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(StatePath(dir), []byte(`{"version":1,"device":"vault:abc","files":{},"printed":{},"store":{}}`), 0o600); err != nil {
		t.Fatal(err)
	}
	st, err := LoadState(dir)
	if err != nil || st.TaskNotes != nil {
		t.Fatalf("version 1: %v %+v", err, st)
	}
	// A round trip of version 2 keeps the linked folder.
	st.TaskNotes = &TaskNotesState{Folder: "/notes", Notes: map[string]string{"t1": "a.md"}, Hashes: map[string]string{"a.md": "h"}, Archived: map[string]bool{}}
	if err := st.Save(dir); err != nil {
		t.Fatal(err)
	}
	back, err := LoadState(dir)
	if err != nil || back.Version != 2 || back.TaskNotes.Folder != "/notes" || back.TaskNotes.Notes["t1"] != "a.md" || back.TaskNotes.Archived == nil {
		t.Fatalf("round trip: %v %+v", err, back)
	}
	// A newer state is refused rather than overwritten.
	if err := os.WriteFile(StatePath(dir), []byte(`{"version":3,"device":"vault:abc"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadState(dir); !errors.Is(err, ErrNewerState) {
		t.Fatalf("newer state: %v", err)
	}
}

func TestTaskNotesSettings(t *testing.T) {
	root := obsidianVault(t, "default.json")
	folder := filepath.Join(root, "TaskNotes", "Tasks")
	if err := os.MkdirAll(folder, 0o755); err != nil {
		t.Fatal(err)
	}
	s, found, err := LoadTNSettings(folder)
	if err != nil || !found {
		t.Fatalf("default: %v %v", found, err)
	}
	want := DefaultTNSettings()
	want.Source = s.Source
	for k, v := range tnDefaultMapping {
		if s.key(k) != v {
			t.Errorf("default key %s = %q, want %q", k, s.key(k), v)
		}
	}
	if !reflect.DeepEqual(s.Statuses, want.Statuses) || !reflect.DeepEqual(s.Priorities, want.Priorities) ||
		s.DefaultStatus != "open" || s.DefaultPriority != "normal" || s.TaskTag != "task" || !s.StoreTitleInFilename {
		t.Errorf("default settings differ from the documented defaults: %+v", s)
	}

	root = obsidianVault(t, "custom.json")
	c, found, err := LoadTNSettings(root)
	if err != nil || !found {
		t.Fatalf("custom: %v %v", found, err)
	}
	for field, key := range map[string]string{"title": "name", "status": "state", "due": "deadline", "scheduled": "when", "contexts": "where",
		"projects": "area", "archiveTag": "shelved", "timeEntries": "log", "completeInstances": "done_dates", "dateCreated": "dateCreated"} {
		if c.key(field) != key {
			t.Errorf("custom key %s = %q, want %q", field, c.key(field), key)
		}
	}
	if !c.completed("shipped") || !c.completed("Dropped") || c.completed("doing") || c.doneStatus() != "shipped" || c.openStatus() != "backlog" || c.TaskTag != "todo" {
		t.Errorf("custom statuses: %+v", c)
	}

	// No settings file: the defaults, found=false.
	d, found, err := LoadTNSettings(t.TempDir())
	if err != nil || found || d.key("due") != "due" {
		t.Fatalf("missing: %v %v", found, err)
	}
	// A broken file stops the sync.
	root = obsidianVault(t, "")
	if err := os.WriteFile(filepath.Join(root, filepath.FromSlash(tnSettingsFile)), []byte(`{"fieldMapping": `), 0o644); err != nil {
		t.Fatal(err)
	}
	var se *SettingsError
	if _, _, err := LoadTNSettings(root); !errors.As(err, &se) || !strings.Contains(se.Error(), "data.json") {
		t.Fatalf("broken: %v", err)
	}
}

func TestTaskNotesMapPriorities(t *testing.T) {
	def := DefaultTNSettings()
	for _, c := range []struct {
		value string
		n     int
	}{{"high", 1}, {"normal", 4}, {"low", 4}, {"none", 4}, {"unknown", 4}} {
		if got := def.priorityOf(c.value); got != c.n {
			t.Errorf("default priorityOf(%s) = %d, want %d", c.value, got, c.n)
		}
	}
	// Fewer levels than four: 2 and 3 are written as the nearest level above.
	for n, want := range map[int]string{1: "high", 2: "high", 3: "high", 4: "normal"} {
		if got := def.priorityValue(n); got != want {
			t.Errorf("default priorityValue(%d) = %s, want %s", n, got, want)
		}
	}
	root := obsidianVault(t, "custom.json")
	c, _, _ := LoadTNSettings(root)
	for value, n := range map[string]int{"urgent": 1, "important": 2, "nice": 3, "extra": 3, "medium": 4, "someday": 4} {
		if got := c.priorityOf(value); got != n {
			t.Errorf("custom priorityOf(%s) = %d, want %d", value, got, n)
		}
	}
	for n, want := range map[int]string{1: "urgent", 2: "important", 3: "nice", 4: "medium"} {
		if got := c.priorityValue(n); got != want {
			t.Errorf("custom priorityValue(%d) = %s, want %s", n, got, want)
		}
	}
	// No priority above the default: everything is 4.
	flat := DefaultTNSettings()
	flat.Priorities = []TNPriority{{Value: "normal", Weight: 1}}
	if flat.priorityOf("normal") != 4 || flat.priorityValue(1) != "normal" {
		t.Error("a single priority level")
	}
}

func readNote(t *testing.T, name string) string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("testdata", "tasknotes", "notes", name))
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

// TestTaskNoteFrontGolden reads the anonymised shapes of the issue's three
// sample notes.
func TestTaskNoteFrontGolden(t *testing.T) {
	boiler := ParseFront(readNote(t, "Service the boiler.md"))
	if !boiler.Has || boiler.str("title") != "Service the boiler" || boiler.str("status") != "open" || boiler.str("priority") != "normal" ||
		boiler.str("due") != "2026-12-01" || boiler.str("recurrence") != "DTSTART:20260802;FREQ=YEARLY" ||
		boiler.str("dateModified") != "2026-08-02T17:45:02.250-04:00" ||
		!reflect.DeepEqual(boiler.strings("tags"), []string{"house/upkeep", "task"}) || !reflect.DeepEqual(boiler.strings("contexts"), []string{"home"}) ||
		boiler.Body != "\n" {
		t.Errorf("boiler: %+v body %q", boiler.index, boiler.Body)
	}
	row := ParseFront(readNote(t, "Row a million metres.md"))
	if row.str("scheduled") != "2029-08-20" || normBody(row.Body) != "https://example.com/million-metre-club" || row.get("due") != nil {
		t.Errorf("row: %+v body %q", row.index, row.Body)
	}
	cover := ParseFront(readNote(t, "Redraw the book cover.md"))
	if cover.str("status") != "done" || cover.str("priority") != "none" || cover.str("completedDate") != "2026-08-21" ||
		cover.str("taskSourceType") != "taskNotes" || !reflect.DeepEqual(cover.strings("tags"), []string{"task", ""}) || cover.Body != "" {
		t.Errorf("cover: %+v body %q", cover.index, cover.Body)
	}
	set := DefaultTNSettings()
	for _, f := range []*Front{boiler, row, cover} {
		if !set.isTaskNote(f) {
			t.Error("a sample is not a task note")
		}
	}

	// A no-op write is byte-identical; editing one key changes only its lines.
	for _, name := range []string{"Service the boiler.md", "Row a million metres.md", "Redraw the book cover.md"} {
		text := readNote(t, name)
		f := ParseFront(text)
		if got := f.apply(nil, nil); got != text {
			t.Errorf("%s: no-op write changed it:\n%q\n%q", name, text, got)
		}
		got := f.apply([]fmEdit{{name: "status", lines: fmScalarLine("status", "in-progress")}}, nil)
		if strings.Replace(text, "status: "+f.str("status"), "status: in-progress", 1) != got {
			t.Errorf("%s: editing status changed more than its line:\n%s", name, got)
		}
	}
	text := readNote(t, "Service the boiler.md")
	f := ParseFront(text)
	got := f.apply([]fmEdit{{name: "tags", lines: fmListLines("tags", []string{"house/upkeep", "task", "garden"}, f.get("tags"))}, {name: "opentodo-id", lines: fmScalarLine("opentodo-id", "abc")}}, nil)
	want := strings.Replace(text, "  - task\n", "  - task\n  - garden\n", 1)
	want = strings.Replace(want, "  - home\n---", "  - home\nopentodo-id: abc\n---", 1)
	if got != want {
		t.Errorf("list edit and new key:\n%s\nwant\n%s", got, want)
	}
}

func TestTaskNoteFrontForms(t *testing.T) {
	text := "---\n" +
		"title: 'It''s done'\n" +
		"quoted: \"a \\\"b\\\" c\"\n" +
		"flow: [a, 'b, c', \"d\"]\n" +
		"empty:\n" +
		"nul: ~\n" +
		"# a comment\n" +
		"block: |\n  line one\n  line two\n" +
		"anchor: &x value\n" +
		"nested:\n  key: value\n" +
		"timeEntries:\n  - startTime: 2026-10-01T08:00:00.000Z\n    endTime: 2026-10-01T09:30:00.000Z\n    description: Draft\n  - startTime: 2026-10-02T08:00:00.000Z\n" +
		"tags: [task]  # inline comment\n" +
		"---\nBody\n"
	f := ParseFront(text)
	if f.str("title") != "It's done" || f.str("quoted") != `a "b" c` || !reflect.DeepEqual(f.strings("flow"), []string{"a", "b, c", "d"}) {
		t.Errorf("scalars: %+v", f.index)
	}
	if f.get("empty").Kind != kindNull || f.get("nul").Kind != kindNull {
		t.Error("null values")
	}
	for _, k := range []string{"block", "anchor", "nested"} {
		if f.get(k).Kind != kindUnsupported || f.supported(k) {
			t.Errorf("%s should be unsupported", k)
		}
	}
	te := f.get("timeEntries")
	if te.Kind != kindMaps || len(te.Maps) != 2 || te.Maps[0].Vals["description"] != "Draft" || te.Maps[1].Vals["startTime"] != "2026-10-02T08:00:00.000Z" {
		t.Errorf("time entries: %+v", te)
	}
	if !reflect.DeepEqual(f.strings("tags"), []string{"task"}) || f.get("tags").flow != true {
		t.Errorf("flow tags: %+v", f.get("tags"))
	}
	if got := f.apply(nil, nil); got != text {
		t.Errorf("no-op:\n%q", got)
	}
	// A note without frontmatter gets one.
	plain := ParseFront("Just text\n")
	if got := plain.apply([]fmEdit{{name: "opentodo-id", lines: fmScalarLine("opentodo-id", "x1")}}, nil); got != "---\nopentodo-id: x1\n---\nJust text\n" {
		t.Errorf("new frontmatter: %q", got)
	}
	// CRLF notes keep their line ends.
	crlf := "---\r\ntitle: A\r\nstatus: open\r\n---\r\nBody\r\n"
	cf := ParseFront(crlf)
	if got := cf.apply([]fmEdit{{name: "status", lines: fmScalarLine("status", "done")}}, nil); got != strings.Replace(crlf, "open", "done", 1) {
		t.Errorf("crlf: %q", got)
	}
}

func TestFMScalarQuoting(t *testing.T) {
	for in, want := range map[string]string{
		"plain words": "plain words", "": `""`, "123": `"123"`, "true": `"true"`, "a: b": `"a: b"`, "#tag": `"#tag"`,
		"- dash": `"- dash"`, "2026-10-01": "2026-10-01", "2026-10-01T08:00:00.000Z": "2026-10-01T08:00:00.000Z", "it's": "it's", " lead": `" lead"`, "say \"hi\"": `"say \"hi\""`,
	} {
		if got := fmScalar(in); got != want {
			t.Errorf("fmScalar(%q) = %s, want %s", in, got, want)
		}
		if back, ok := scalarOf(fmScalar(in)); !ok || back != in {
			t.Errorf("round trip of %q: %q %v", in, back, ok)
		}
	}
}
