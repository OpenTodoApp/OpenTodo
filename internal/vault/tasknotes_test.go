package vault

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"
)

// notesT is a vault with a linked TaskNotes folder inside an Obsidian vault.
type notesT struct {
	*vaultT
	notes string // the linked folder
}

// linkNotes links a TaskNotes folder (testdata settings file name, "" none).
func (v *vaultT) linkNotes(t *testing.T, settings string) *notesT {
	t.Helper()
	root := obsidianVault(t, settings)
	folder := filepath.Join(root, "TaskNotes", "Tasks")
	if err := os.MkdirAll(folder, 0o755); err != nil {
		t.Fatal(err)
	}
	if _, err := LinkTaskNotes(v.dir, folder, false); err != nil {
		t.Fatal(err)
	}
	return &notesT{vaultT: v, notes: folder}
}

func (n *notesT) note(t *testing.T, name string) string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(n.notes, name))
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func (n *notesT) put(t *testing.T, name, text string) {
	t.Helper()
	p := filepath.Join(n.notes, filepath.FromSlash(name))
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte(text), 0o644); err != nil {
		t.Fatal(err)
	}
}

func (n *notesT) change(t *testing.T, name, old, new string) {
	t.Helper()
	text := n.note(t, name)
	if !strings.Contains(text, old) {
		t.Fatalf("%s does not hold %q:\n%s", name, old, text)
	}
	n.put(t, name, strings.Replace(text, old, new, 1))
}

// idOf reads a note's opentodo-id.
func (n *notesT) idOf(t *testing.T, name string) string {
	t.Helper()
	id := ParseFront(n.note(t, name)).str(keyID)
	if id == "" {
		t.Fatalf("%s has no id:\n%s", name, n.note(t, name))
	}
	return id
}

// diffLines lists the lines of b that are not in a and the lines of a not in b.
func diffLines(a, b string) (added, removed []string) {
	count := map[string]int{}
	for _, l := range strings.Split(a, "\n") {
		count[l]++
	}
	for _, l := range strings.Split(b, "\n") {
		if count[l] > 0 {
			count[l]--
			continue
		}
		added = append(added, l)
	}
	for l, c := range count {
		for ; c > 0; c-- {
			removed = append(removed, l)
		}
	}
	sort.Strings(removed)
	return added, removed
}

func labelNames(s *server, task map[string]any) []string {
	byID := map[string]string{}
	for _, l := range s.list("labels") {
		byID[l["id"].(string)], _ = l["name"].(string)
	}
	var out []string
	for _, id := range task["labels"].([]any) {
		out = append(out, byID[id.(string)])
	}
	sort.Strings(out)
	return out
}

func TestTaskNotesMapSamples(t *testing.T) {
	s := newServer(t)
	home := s.create("projects", map[string]any{"name": "Home"})
	v := s.vault(t)
	n := v.linkNotes(t, "default.json")
	samples := map[string]string{}
	for _, name := range []string{"Service the boiler.md", "Row a million metres.md", "Redraw the book cover.md"} {
		samples[name] = readNote(t, name)
		n.put(t, name, samples[name])
	}
	// A plain note in the folder is never read.
	n.put(t, "Ideas.md", "---\ntags:\n  - idea\n---\nnot a task\n")
	n.put(t, "Sub/Paint the shed.md", "---\ntitle: Paint the shed\nstatus: in-progress\npriority: high\nprojects:\n  - \"[[Home]]\"\ntimeEstimate: 90\nscheduled: 2026-11-03T09:30\ntags:\n  - task\n---\n")
	rep := v.sync(t)
	if rep.Created != 4 {
		t.Fatalf("created %d: %+v", rep.Created, rep)
	}
	boiler := s.get("tasks", n.idOf(t, "Service the boiler.md"))
	if boiler["title"] != "Service the boiler" || boiler["completed_at"] != nil || boiler["priority"].(float64) != 4 ||
		boiler["deadline"] != "2026-12-01" || boiler["recurrence"] != "every year" || boiler["project_id"] != nil {
		t.Errorf("boiler = %v", boiler)
	}
	if got := labelNames(s, boiler); strings.Join(got, ",") != "home,house/upkeep" {
		t.Errorf("boiler labels = %v", got)
	}
	row := s.get("tasks", n.idOf(t, "Row a million metres.md"))
	if row["due"].(map[string]any)["date"] != "2029-08-20" || row["description"] != "https://example.com/million-metre-club" {
		t.Errorf("row = %v", row)
	}
	cover := s.get("tasks", n.idOf(t, "Redraw the book cover.md"))
	if int64(cover["completed_at"].(float64)) != time.Date(2026, 8, 21, 12, 0, 0, 0, time.UTC).UnixMilli() || cover["priority"].(float64) != 4 || len(cover["labels"].([]any)) != 0 {
		t.Errorf("cover = %v", cover)
	}
	shed := s.get("tasks", n.idOf(t, "Sub/Paint the shed.md"))
	due := shed["due"].(map[string]any)
	if shed["project_id"] != home || shed["priority"].(float64) != 1 || shed["estimate_minutes"].(float64) != 90 || due["date"] != "2026-11-03" || due["time"] != "09:30" || shed["completed_at"] != nil {
		t.Errorf("shed = %v", shed)
	}
	// Each note gained only its id line; the plain note is untouched.
	for name, text := range samples {
		added, removed := diffLines(text, n.note(t, name))
		if len(removed) != 0 || len(added) != 1 || !strings.HasPrefix(added[0], "opentodo-id: ") {
			t.Errorf("%s: added %q removed %q", name, added, removed)
		}
	}
	if n.note(t, "Ideas.md") != "---\ntags:\n  - idea\n---\nnot a task\n" {
		t.Error("the plain note changed")
	}
	// Tasks in notes are never lines of project files.
	if strings.Contains(v.read(t, "Home.md"), "Paint the shed") || strings.Contains(v.read(t, "Inbox.md"), "Service the boiler") {
		t.Errorf("a note's task is printed as a line:\n%s\n%s", v.read(t, "Home.md"), v.read(t, "Inbox.md"))
	}
	// The next sync is idle.
	rec := &recorder{Transport: &HTTPTransport{URL: s.url, Token: s.token}}
	rep, err := Sync(context.Background(), v.opts(&Options{Transport: rec}))
	if err != nil {
		t.Fatal(err)
	}
	if len(rec.sent) != 0 || rep.Written != 0 || len(rep.Events) != 0 {
		t.Errorf("second sync not idle: sent %v, %+v", rec.sent, rep)
	}
}

// TestTaskNotesGuideExampleMaps: the example note in docs/vault.md maps to
// every field the guide's table names.
func TestTaskNotesGuideExampleMaps(t *testing.T) {
	s := newServer(t)
	home := s.create("projects", map[string]any{"name": "Home"})
	v := s.vault(t)
	n := v.linkNotes(t, "default.json")
	text := strings.Replace(readNote(t, "Call-the-plumber.md"), "opentodo-id: t-plumber\n", "", 1)
	n.put(t, "Call the plumber.md", text)
	v.sync(t)
	id := n.idOf(t, "Call the plumber.md")
	task := s.get("tasks", id)
	due := task["due"].(map[string]any)
	if task["title"] != "Call the plumber" || task["completed_at"] != nil || task["priority"].(float64) != 1 || due["date"] != "2026-11-03" || due["time"] != "09:30" ||
		task["deadline"] != "2026-11-06" || task["estimate_minutes"].(float64) != 30 || task["recurrence"] != "every 3rd" || task["project_id"] != home ||
		task["description"] != "Ask about the boiler too." {
		t.Errorf("guide example = %v", task)
	}
	if got := labelNames(s, task); strings.Join(got, ",") != "errands,phone" {
		t.Errorf("labels = %v", got)
	}
	list, _ := s.do("GET", "/api/v1/tasks/"+id+"/time-entries", nil)["entries"].([]any)
	if len(list) != 1 || list[0].(map[string]any)["note"] != "First call" {
		t.Errorf("time entries = %v", list)
	}
	added, removed := diffLines(text, n.note(t, "Call the plumber.md"))
	if len(removed) != 0 || len(added) != 1 || added[0] != "opentodo-id: "+id {
		t.Errorf("the example changed beyond its id: added %q removed %q", added, removed)
	}
}

func TestTaskNotesMapRenamedFields(t *testing.T) {
	s := newServer(t)
	s.create("projects", map[string]any{"name": "Garden"})
	v := s.vault(t)
	n := v.linkNotes(t, "custom.json")
	n.put(t, "Prune.md", "---\nname: Prune the roses\nstate: doing\nimportance: important\ndeadline: 2026-12-01\nwhen: 2026-11-20\nwhere:\n  - outside\narea: \"[[Garden]]\"\nestimate: 45\ntags:\n  - todo\n  - plants\n---\nUse the long shears.\n")
	n.put(t, "Shipped.md", "---\nname: Ship the brochure\nstate: shipped\nfinished: 2026-10-02\ntags: [todo]\n---\n")
	n.put(t, "Wrong tag.md", "---\nname: Not mine\ntags: [task]\n---\n")
	rep := v.sync(t)
	if rep.Created != 2 {
		t.Fatalf("created %d: %+v", rep.Created, rep)
	}
	prune := s.get("tasks", n.idOf(t, "Prune.md"))
	if prune["title"] != "Prune the roses" || prune["priority"].(float64) != 2 || prune["deadline"] != "2026-12-01" ||
		prune["due"].(map[string]any)["date"] != "2026-11-20" || prune["estimate_minutes"].(float64) != 45 || prune["description"] != "Use the long shears." {
		t.Errorf("prune = %v", prune)
	}
	if got := labelNames(s, prune); strings.Join(got, ",") != "outside,plants" {
		t.Errorf("prune labels = %v", got)
	}
	shipped := s.get("tasks", n.idOf(t, "Shipped.md"))
	if shipped["completed_at"] == nil {
		t.Errorf("a custom completed status: %v", shipped)
	}
	// A deadline set in the app goes to the renamed key.
	id := n.idOf(t, "Prune.md")
	s.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"deadline": "2026-12-24", "priority": 3})
	v.sync(t)
	text := n.note(t, "Prune.md")
	if !strings.Contains(text, "deadline: 2026-12-24\n") || !strings.Contains(text, "importance: nice\n") || !strings.Contains(text, "updated: ") {
		t.Errorf("renamed keys not written:\n%s", text)
	}
	// Reopened in the app: the default status.
	s.do("PATCH", "/api/v1/tasks/"+n.idOf(t, "Shipped.md"), map[string]any{"completed_at": nil})
	v.sync(t)
	if text := n.note(t, "Shipped.md"); !strings.Contains(text, "state: backlog\n") || strings.Contains(text, "finished:") {
		t.Errorf("reopened:\n%s", text)
	}
}

func TestTaskNotesMergeAppToNote(t *testing.T) {
	s := newServer(t)
	v := s.vault(t)
	n := v.linkNotes(t, "default.json")
	n.put(t, "Call the bank.md", "---\ntitle: Call the bank\nstatus: in-progress\npriority: normal\ntags:\n  - task\n  - money\n# kept comment\ncustom: keep me\n---\n\nAsk about the fee.\n")
	v.sync(t)
	id := n.idOf(t, "Call the bank.md")
	before := n.note(t, "Call the bank.md")
	// Priority 2 with only "high" above the default is written as high.
	s.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"priority": 2})
	v.sync(t)
	added, removed := diffLines(before, n.note(t, "Call the bank.md"))
	if strings.Join(removed, "|") != "priority: normal" || len(added) != 2 || added[0] != "priority: high" || !strings.HasPrefix(added[1], "dateModified: ") {
		t.Errorf("priority write: added %q removed %q", added, removed)
	}
	// The approximate priority does not bounce.
	rec := &recorder{Transport: &HTTPTransport{URL: s.url, Token: s.token}}
	if _, err := Sync(context.Background(), v.opts(&Options{Transport: rec})); err != nil {
		t.Fatal(err)
	}
	if len(rec.sent) != 0 {
		t.Errorf("an approximate priority bounced: %v", rec.sent)
	}
	if got := s.get("tasks", id)["priority"].(float64); got != 2 {
		t.Errorf("priority = %v", got)
	}
	// Completion from the app: the first completed status and the date; an
	// in-progress status counts as open and the comment and custom key stay.
	before = n.note(t, "Call the bank.md")
	at := time.Date(2026, 10, 20, 15, 0, 0, 0, time.UTC).UnixMilli()
	s.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"completed_at": at})
	v.sync(t)
	text := n.note(t, "Call the bank.md")
	added, removed = diffLines(before, text)
	if strings.Join(removed, "|") != "dateModified: "+strings.TrimPrefix(lineOf(t, before, "dateModified: "), "dateModified: ")+"|status: in-progress" &&
		strings.Join(removed, "|") != "status: in-progress" {
		t.Errorf("completion removed %q", removed)
	}
	if !strings.Contains(text, "status: done\n") || !strings.Contains(text, "completedDate: 2026-10-20\n") || !strings.Contains(text, "# kept comment\ncustom: keep me\n") {
		t.Errorf("completion:\n%s", text)
	}
	_ = added
}

func TestTaskNotesMergeCases(t *testing.T) {
	s := newServer(t)
	v := s.vault(t)
	n := v.linkNotes(t, "")
	n.put(t, "Fix sink.md", "---\ntitle: Fix sink\nstatus: open\ntags:\n  - task\n---\n")
	rep := v.sync(t)
	if len(rep.Warnings) == 0 || !strings.Contains(strings.Join(rep.Warnings, "\n"), "TaskNotes' defaults are used") {
		t.Errorf("no warning for missing settings: %v", rep.Warnings)
	}
	id := n.idOf(t, "Fix sink.md")
	// Only in the note: pushed.
	n.change(t, "Fix sink.md", "status: open", "status: open\nscheduled: 2026-11-01")
	v.sync(t)
	if s.get("tasks", id)["due"].(map[string]any)["date"] != "2026-11-01" {
		t.Error("the note's date was not pushed")
	}
	// Only in the app: written, with only that key's line changed.
	before := n.note(t, "Fix sink.md")
	s.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"title": "Fix the sink"})
	v.sync(t)
	added, removed := diffLines(before, n.note(t, "Fix sink.md"))
	if strings.Join(removed, "|") != "title: Fix sink" || added[0] != "title: Fix the sink" || len(added) != 2 {
		t.Errorf("app title: added %q removed %q", added, removed)
	}
	// Both sides: the app wins and the conflict file names the note and field.
	n.change(t, "Fix sink.md", "title: Fix the sink", "title: Fix the kitchen sink")
	s.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"title": "Fix the bathroom sink"})
	rep = v.sync(t)
	if got := s.get("tasks", id)["title"]; got != "Fix the bathroom sink" {
		t.Errorf("title = %v", got)
	}
	if rep.Conflicts != 1 || !strings.Contains(n.note(t, "Fix sink.md"), "title: Fix the bathroom sink\n") {
		t.Errorf("conflict: %+v\n%s", rep, n.note(t, "Fix sink.md"))
	}
	conf := v.read(t, tnConflictFile)
	if !strings.Contains(conf, "Fix sink.md: title") || !strings.Contains(conf, "title: Fix the kitchen sink") {
		t.Errorf("conflict file:\n%s", conf)
	}
	// Offline edit: a date changed in the note while a phone changed the title.
	n.change(t, "Fix sink.md", "scheduled: 2026-11-01", "scheduled: 2026-11-05")
	s.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"title": "Fix the sink today"})
	v.sync(t)
	task := s.get("tasks", id)
	text := n.note(t, "Fix sink.md")
	if task["title"] != "Fix the sink today" || task["due"].(map[string]any)["date"] != "2026-11-05" ||
		!strings.Contains(text, "title: Fix the sink today\n") || !strings.Contains(text, "scheduled: 2026-11-05\n") {
		t.Errorf("offline edit: %v\n%s", task, text)
	}
}

func TestTaskNotesRecurrence(t *testing.T) {
	s := newServer(t)
	v := s.vault(t)
	n := v.linkNotes(t, "default.json")
	n.put(t, "Bins.md", "---\ntitle: Bins\nstatus: open\nscheduled: 2026-10-26\nrecurrence: DTSTART:20261026;FREQ=WEEKLY\ntags:\n  - task\n---\n")
	n.put(t, "Hourly.md", "---\ntitle: Stretch\nstatus: open\nrecurrence: DTSTART:20261026T090000Z;FREQ=HOURLY\ntags:\n  - task\n---\n")
	n.put(t, "Water.md", "---\ntitle: Water the plants\nstatus: open\nscheduled: 2026-10-26\nrecurrence: DTSTART:20261026;FREQ=DAILY;INTERVAL=3\nrecurrence_anchor: completion\ntags:\n  - task\n---\n")
	rep := v.sync(t)
	bins := n.idOf(t, "Bins.md")
	if got := s.get("tasks", bins)["recurrence"]; got != "every week" {
		t.Errorf("bins rule = %v", got)
	}
	if got := s.get("tasks", n.idOf(t, "Water.md"))["recurrence"]; got != "every 3 days after completion" {
		t.Errorf("water rule = %v", got)
	}
	if got := s.get("tasks", n.idOf(t, "Hourly.md"))["recurrence"]; got != nil {
		t.Errorf("an hourly rule was pushed: %v", got)
	}
	if !strings.Contains(strings.Join(rep.Warnings, "\n"), "cannot express") {
		t.Errorf("no warning for the hourly rule: %v", rep.Warnings)
	}
	// The current occurrence completed in the note.
	n.change(t, "Bins.md", "tags:", "complete_instances:\n  - 2026-10-26\ntags:")
	v.sync(t)
	rec := s.get("tasks", occurrenceID(bins, "2026-10-26"))
	if rec["completed_at"] == nil || rec["series_id"] != bins {
		t.Errorf("occurrence = %v", rec)
	}
	text := n.note(t, "Bins.md")
	if !strings.Contains(text, "scheduled: 2026-11-02\n") || !strings.Contains(text, "  - 2026-10-26\n") || !strings.Contains(text, "status: open\n") {
		t.Errorf("after the instance:\n%s", text)
	}
	// Completion from the app appends the date and moves scheduled.
	s.do("PATCH", "/api/v1/tasks/"+bins, map[string]any{"completed_at": time.Now().UnixMilli()})
	v.sync(t)
	text = n.note(t, "Bins.md")
	if !strings.Contains(text, "  - 2026-10-26\n  - 2026-11-02\n") || !strings.Contains(text, "scheduled: 2026-11-09\n") {
		t.Errorf("after the app's completion:\n%s", text)
	}
	if !strings.Contains(text, "recurrence: DTSTART:20261026;FREQ=WEEKLY\n") {
		t.Errorf("the rule's text changed:\n%s", text)
	}
}

func TestTaskNotesTime(t *testing.T) {
	s := newServer(t)
	v := s.vault(t)
	n := v.linkNotes(t, "default.json")
	n.put(t, "Write report.md", "---\ntitle: Write report\nstatus: open\ntimeEntries:\n  - startTime: 2026-10-01T08:00:00.000Z\n    endTime: 2026-10-01T09:30:00.000Z\n    description: Outline\ntags:\n  - task\n---\n")
	v.sync(t)
	id := n.idOf(t, "Write report.md")
	entries := s.do("GET", "/api/v1/tasks/"+id+"/time-entries", nil)
	list, _ := entries["entries"].([]any)
	if len(list) != 1 {
		t.Fatalf("entries = %v", entries)
	}
	e1 := list[0].(map[string]any)
	if e1["userId"] != s.user || int64(e1["startedAt"].(float64)) != time.Date(2026, 10, 1, 8, 0, 0, 0, time.UTC).UnixMilli() ||
		int64(e1["endedAt"].(float64)) != time.Date(2026, 10, 1, 9, 30, 0, 0, time.UTC).UnixMilli() || e1["note"] != "Outline" {
		t.Errorf("entry = %v", e1)
	}
	// The note's end time and description merge per field; a running entry is added.
	n.change(t, "Write report.md", "description: Outline", "description: Outline and intro\n  - startTime: 2026-10-02T08:00:00.000Z")
	v.sync(t)
	list, _ = s.do("GET", "/api/v1/tasks/"+id+"/time-entries", nil)["entries"].([]any)
	notes := map[string]bool{}
	running := 0
	for _, raw := range list {
		e := raw.(map[string]any)
		notes[e["note"].(string)] = true
		if e["endedAt"] == nil {
			running++
		}
	}
	if len(list) != 2 || !notes["Outline and intro"] || running != 1 {
		t.Errorf("entries after the edit = %v", list)
	}
	// An entry logged in the app is written to the note.
	s.do("POST", "/api/v1/time-entries", map[string]any{"taskId": id, "startedAt": time.Date(2026, 9, 30, 10, 0, 0, 0, time.UTC).UnixMilli(), "endedAt": time.Date(2026, 9, 30, 10, 45, 0, 0, time.UTC).UnixMilli(), "note": "Research"})
	v.sync(t)
	text := n.note(t, "Write report.md")
	if !strings.Contains(text, "  - startTime: 2026-09-30T10:00:00.000Z\n    endTime: 2026-09-30T10:45:00.000Z\n    description: Research\n") ||
		strings.Index(text, "2026-09-30T10") > strings.Index(text, "2026-10-01T08") {
		t.Errorf("app entry not written in order:\n%s", text)
	}
	// An entry removed from the note is deleted.
	text = n.note(t, "Write report.md")
	n.put(t, "Write report.md", strings.Replace(text, "  - startTime: 2026-09-30T10:00:00.000Z\n    endTime: 2026-09-30T10:45:00.000Z\n    description: Research\n", "", 1))
	v.sync(t)
	list, _ = s.do("GET", "/api/v1/tasks/"+id+"/time-entries", nil)["entries"].([]any)
	if len(list) != 2 {
		t.Errorf("entries after the removal = %v", list)
	}
}

func TestTaskNotesCreateIDsAndRename(t *testing.T) {
	s := newServer(t)
	v := s.vault(t)
	n := v.linkNotes(t, "default.json")
	n.put(t, "Fix ebook cover.md", "---\ntitle: Fix ebook cover\ntags:\n  - task\n---\n")
	n.put(t, "Stranger.md", "---\ntitle: Stranger\nopentodo-id: nosuchtask\ntags:\n  - task\n---\n")
	rep := v.sync(t)
	id := n.idOf(t, "Fix ebook cover.md")
	if s.get("tasks", id)["title"] != "Fix ebook cover" || rep.Created != 1 {
		t.Fatalf("created: %+v", rep)
	}
	if n.note(t, "Stranger.md") != "---\ntitle: Stranger\nopentodo-id: nosuchtask\ntags:\n  - task\n---\n" ||
		!strings.Contains(strings.Join(rep.Warnings, "\n"), "nosuchtask is not in the account") {
		t.Errorf("unknown id: %v\n%s", rep.Warnings, n.note(t, "Stranger.md"))
	}
	// A renamed note is found again by its id.
	if err := os.Rename(filepath.Join(n.notes, "Fix ebook cover.md"), filepath.Join(n.notes, "Cover.md")); err != nil {
		t.Fatal(err)
	}
	rep = v.sync(t)
	st, _ := LoadState(v.dir)
	if st.TaskNotes.Notes[id] != "Cover.md" || rep.Trashed != 0 || s.get("tasks", id)["deleted_at"] != nil {
		t.Errorf("rename: %+v %v", rep, st.TaskNotes.Notes)
	}
}

func TestTaskNotesDelete(t *testing.T) {
	s := newServer(t)
	v := s.vault(t)
	n := v.linkNotes(t, "default.json")
	for _, name := range []string{"Gone.md", "Changed.md", "Trash me.md", "Edited.md", "Shelf.md"} {
		n.put(t, name, "---\ntitle: "+strings.TrimSuffix(name, ".md")+"\nstatus: open\ntags:\n  - task\n---\n")
	}
	v.sync(t)
	ids := map[string]string{}
	for _, name := range []string{"Gone.md", "Changed.md", "Trash me.md", "Edited.md", "Shelf.md"} {
		ids[name] = n.idOf(t, name)
	}
	// A deleted note with an unchanged task trashes it.
	_ = os.Remove(filepath.Join(n.notes, "Gone.md"))
	// A deleted note whose task changed in the app is written again.
	_ = os.Remove(filepath.Join(n.notes, "Changed.md"))
	s.do("PATCH", "/api/v1/tasks/"+ids["Changed.md"], map[string]any{"priority": 1})
	// Trashed in the app with an unchanged note: the note is removed.
	s.do("DELETE", "/api/v1/tasks/"+ids["Trash me.md"], nil)
	// Trashed in the app with an edited note: kept, unlinked, reported.
	s.do("DELETE", "/api/v1/tasks/"+ids["Edited.md"], nil)
	n.put(t, "Edited.md", n.note(t, "Edited.md")+"A thought I want to keep.\n")
	rep := v.sync(t)
	if s.status("/api/v1/tasks/"+ids["Gone.md"]) == 200 && s.get("tasks", ids["Gone.md"])["deleted_at"] == nil {
		t.Error("the deleted note's task is not trashed")
	}
	if text := n.note(t, "Changed.md"); !strings.Contains(text, "priority: high\n") || !strings.Contains(text, "opentodo-id: "+ids["Changed.md"]) {
		t.Errorf("restored note:\n%s", text)
	}
	if _, err := os.Stat(filepath.Join(n.notes, "Trash me.md")); !errors.Is(err, os.ErrNotExist) {
		t.Error("the trashed task's unchanged note is still there")
	}
	if !strings.Contains(n.note(t, "Edited.md"), "A thought I want to keep.") || rep.Conflicts != 1 {
		t.Errorf("edited note: %+v", rep)
	}
	st, _ := LoadState(v.dir)
	if _, ok := st.TaskNotes.Notes[ids["Edited.md"]]; ok {
		t.Error("the edited note is still synced")
	}
	status, err := ReadStatus(v.dir)
	if err != nil || len(status.Conflicts) != 1 || status.Conflicts[0] != tnConflictFile {
		t.Errorf("status: %v %+v", err, status)
	}
	// Archived: not written, task not changed, until the tag is removed.
	n.change(t, "Shelf.md", "  - task\n", "  - task\n  - archived\n")
	v.sync(t)
	s.do("PATCH", "/api/v1/tasks/"+ids["Shelf.md"], map[string]any{"title": "Shelf renamed"})
	n.change(t, "Shelf.md", "status: open", "status: done")
	v.sync(t)
	if text := n.note(t, "Shelf.md"); strings.Contains(text, "Shelf renamed") {
		t.Errorf("an archived note was written:\n%s", text)
	}
	if s.get("tasks", ids["Shelf.md"])["completed_at"] != nil {
		t.Error("an archived note changed its task")
	}
	n.change(t, "Shelf.md", "  - archived\n", "")
	v.sync(t)
	if text := n.note(t, "Shelf.md"); !strings.Contains(text, "title: Shelf renamed\n") || !strings.Contains(text, "status: open\n") {
		t.Errorf("unarchived note:\n%s", text)
	}
}

func TestTaskNotesFenceAndLimits(t *testing.T) {
	s := newServer(t)
	v := s.vault(t)
	folder := filepath.Join(v.dir, "TaskNotes")
	if err := os.MkdirAll(folder, 0o755); err != nil {
		t.Fatal(err)
	}
	if _, err := LinkTaskNotes(v.dir, folder, false); !errors.Is(err, ErrInsideVault) {
		t.Fatalf("inside without --inside: %v", err)
	}
	if _, err := LinkTaskNotes(v.dir, filepath.Join(v.dir, "nope"), true); !errors.Is(err, ErrNotFolder) {
		t.Fatalf("missing folder: %v", err)
	}
	if stored, err := LinkTaskNotes(v.dir, folder, true); err != nil || stored != "TaskNotes" {
		t.Fatalf("inside: %q %v", stored, err)
	}
	for i := 0; i < 40; i++ {
		v.write(t, filepath.Join("TaskNotes", "Note "+string(rune('A'+i%26))+string(rune('a'+i/26))+".md"), "---\nstatus: open\ntags:\n  - task\n---\n")
	}
	rep := v.sync(t)
	if rep.Created != 40 || len(s.list("projects")) != 0 || rep.Tasks != 40 {
		t.Fatalf("40 notes: created %d, projects %d, tasks %d", rep.Created, len(s.list("projects")), rep.Tasks)
	}
	if _, err := os.Stat(filepath.Join(v.dir, "TaskNotes.md")); err == nil {
		t.Error("a project file was written for the notes")
	}
	// A note over 1 MB stops the sync before any write.
	v.write(t, filepath.Join("TaskNotes", "Huge.md"), "---\ntags:\n  - task\n---\n"+strings.Repeat("x", MaxFileBytes))
	before, _ := os.ReadFile(StatePath(v.dir))
	_, err := Sync(context.Background(), v.opts(&Options{}))
	var le *LimitError
	if !errors.As(err, &le) || !strings.Contains(le.Msg, "Huge.md") {
		t.Fatalf("huge note: %v", err)
	}
	if after, _ := os.ReadFile(StatePath(v.dir)); string(after) != string(before) {
		t.Error("the state changed")
	}
	// A broken settings file stops it too.
	_ = os.Remove(filepath.Join(v.dir, "TaskNotes", "Huge.md"))
	root := obsidianVault(t, "")
	_ = os.WriteFile(filepath.Join(root, filepath.FromSlash(tnSettingsFile)), []byte("{"), 0o644)
	other := filepath.Join(root, "Tasks")
	_ = os.MkdirAll(other, 0o755)
	if _, err := LinkTaskNotes(v.dir, other, false); err != nil {
		t.Fatal(err)
	}
	var se *SettingsError
	if _, err := Sync(context.Background(), v.opts(&Options{})); !errors.As(err, &se) {
		t.Fatalf("broken settings: %v", err)
	}
	// A linked folder that is gone stops it.
	_ = os.RemoveAll(other)
	if _, err := Sync(context.Background(), v.opts(&Options{})); !IsNoFolder(err) {
		t.Fatalf("missing folder: %v", err)
	}
	if was, err := UnlinkTaskNotes(v.dir); !was || err != nil {
		t.Fatalf("unlink: %v %v", was, err)
	}
}

func TestTaskNotesStatusAndUnlink(t *testing.T) {
	s := newServer(t)
	v := s.vault(t)
	n := v.linkNotes(t, "default.json")
	n.put(t, "One.md", "---\ntitle: One\ntags:\n  - task\n---\n")
	v.sync(t)
	n.change(t, "One.md", "title: One", "title: One more")
	n.put(t, "Two.md", "---\ntitle: Two\ntags:\n  - task\n---\n")
	n.put(t, "Plain.md", "just a note\n")
	st, err := ReadStatus(v.dir)
	if err != nil {
		t.Fatal(err)
	}
	joined := strings.Join(st.Changed, "\n")
	if !strings.Contains(joined, "One.md") || !strings.Contains(joined, "Two.md") || strings.Contains(joined, "Plain.md") {
		t.Errorf("status changed = %v", st.Changed)
	}
	// Unlinked: nothing is read or written, the notes keep their id.
	id := n.idOf(t, "One.md")
	if _, err := UnlinkTaskNotes(v.dir); err != nil {
		t.Fatal(err)
	}
	v.sync(t)
	if s.get("tasks", id)["title"] != "One" || strings.Contains(n.note(t, "Two.md"), "opentodo-id") {
		t.Error("an unlinked folder was synced")
	}
	if !strings.Contains(v.read(t, "Inbox.md"), "One") {
		t.Error("an unlinked note's task is not printed as a line")
	}
}

func TestTaskNotesReadOnlyAndDryRun(t *testing.T) {
	s := newServer(t)
	v := s.vault(t)
	n := v.linkNotes(t, "default.json")
	n.put(t, "Plan.md", "---\ntitle: Plan\ntags:\n  - task\n---\n")
	v.sync(t)
	id := n.idOf(t, "Plan.md")
	// A dry run lists the note it would write and changes nothing.
	s.do("PATCH", "/api/v1/tasks/"+id, map[string]any{"title": "Plan the trip"})
	before := n.note(t, "Plan.md")
	rep, err := Sync(context.Background(), v.opts(&Options{DryRun: true}))
	if err != nil {
		t.Fatal(err)
	}
	if n.note(t, "Plan.md") != before || !strings.Contains(strings.Join(rep.Files, "\n"), "Plan.md") {
		t.Errorf("dry run: files %v\n%s", rep.Files, n.note(t, "Plan.md"))
	}
	// Read-only: the note's own edit stays pending and is pushed later.
	v.sync(t)
	n.change(t, "Plan.md", "title: Plan the trip", "title: Plan the long trip")
	if _, err := Sync(context.Background(), v.opts(&Options{ReadOnly: true})); err != nil {
		t.Fatal(err)
	}
	if s.get("tasks", id)["title"] != "Plan the trip" || !strings.Contains(n.note(t, "Plan.md"), "Plan the long trip") {
		t.Error("read-only pushed or overwrote the note")
	}
	v.sync(t)
	if s.get("tasks", id)["title"] != "Plan the long trip" {
		t.Error("the pending note edit was lost")
	}
}
