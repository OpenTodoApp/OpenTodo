package cli

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/ids"
)

// `ot notes` and `ot task note` (OpenSpec change notes-overview, tasks 2.8):
// one test per scenario of "Notes in the CLI" and "Task note command".

// seedNotes creates the fixture: two standalone notes, a task note and a
// project note, with distinct body clocks (newest last here).
func (h *harness) seedNotes() {
	h.t.Helper()
	h.put("project", "home0001", map[string]any{"name": "Home", "color": "#10b981", "archived": false, "description": "Boiler serviced by the plumber in May"})
	time.Sleep(2 * time.Millisecond)
	h.put("task", "fixs0001", map[string]any{"title": "Fix the sink", "project_id": "home0001", "description": "Ask the plumber about the trap"})
	time.Sleep(2 * time.Millisecond)
	h.put("note", "3fa10001", map[string]any{"title": "Call the plumber", "description": "- [ ] get a quote\n- [ ] book a day", "labels": []string{}, "project_id": "home0001", "deleted_at": nil})
	time.Sleep(2 * time.Millisecond)
	h.put("note", "meet0001", map[string]any{"title": "Meeting", "description": "Agenda", "labels": []string{}, "project_id": nil, "deleted_at": nil})
}

// note reads one note through the API; nil when it is gone (or deleted).
func (h *harness) note(id string) map[string]any {
	h.t.Helper()
	for _, n := range h.apiJSON("GET", "/api/v1/notes?include_deleted=true", nil)["notes"].([]any) {
		if m := n.(map[string]any); m["id"] == id {
			return m
		}
	}
	return nil
}

// edit writes fields as another device would, with fresh op ids (put's op
// ids repeat, and the server ignores an op it already has).
func (h *harness) edit(entity, id string, fields map[string]any) {
	h.t.Helper()
	ts := time.Now().UnixMilli()
	var ops []map[string]any
	for f, v := range fields {
		ops = append(ops, map[string]any{"id": ids.New(), "entity": entity, "entityId": id, "field": f, "value": v, "ts": ts, "device": "phone"})
	}
	h.apiJSON("POST", "/api/v1/sync", map[string]any{"device": "phone", "cursor": 0, "ops": ops})
}

// onceBefore makes the server run change once, right before the first
// request matching method and path is handled.
func (h *harness) onceBefore(method, path string, change func()) {
	var once sync.Once
	h.hook = func(r *http.Request) {
		if r.Method == method && r.URL.Path == path {
			once.Do(change)
		}
	}
}

func TestNotesListAndSearch(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.seedNotes()
	out := h.mustRun("notes", "--json")
	var list []map[string]any
	if err := json.Unmarshal([]byte(out), &list); err != nil {
		t.Fatal(err)
	}
	var order []string
	for _, n := range list {
		order = append(order, n["kind"].(string)+":"+n["id"].(string))
	}
	if strings.Join(order, ",") != "note:meet0001,note:3fa10001,task:fixs0001,project:home0001" {
		t.Fatalf("order = %v", order)
	}
	if out := h.mustRun("notes", "list", "--standalone"); !strings.Contains(out, "Call the plumber") || strings.Contains(out, "Fix the sink") {
		t.Fatalf("--standalone:\n%s", out)
	}
	if out := h.mustRun("notes", "list", "--source", "project", "--json"); !strings.Contains(out, `"kind":"project"`) || strings.Contains(out, `"kind":"note"`) {
		t.Fatalf("--source project: %s", out)
	}

	// Scenario "CLI search": title matches first, with their project, from
	// what the API returned (only reads are sent).
	h.requestLog()
	out = h.mustRun("notes", "search", "plumber", "--json")
	if w := writesIn(h.requestLog()); len(w) != 0 {
		t.Fatalf("search wrote: %v", w)
	}
	list = nil
	_ = json.Unmarshal([]byte(out), &list)
	if len(list) != 3 || list[0]["id"] != "3fa10001" || list[0]["project"] != "Home" || list[0]["snippet"] == nil {
		t.Fatalf("search = %s", out)
	}
	table := h.mustRun("notes", "search", "plumber")
	if !strings.Contains(table, "MATCH") || !strings.Contains(table, "Home") || strings.Index(table, "Call the plumber") > strings.Index(table, "Fix the sink") {
		t.Fatalf("search table:\n%s", table)
	}
	if out := h.mustRun("notes", "list", "--search", "quote", "--json"); !strings.Contains(out, "3fa10001") || strings.Contains(out, "fixs0001") {
		t.Fatalf("--search: %s", out)
	}
}

// Scenario "Show as Markdown": the checklist, then the pending append.
func TestNotesShowMarkdown(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.seedNotes()
	h.apiJSON("POST", "/api/v1/notes/3fa10001/append", map[string]any{"text": "- called on Monday"})
	out := h.mustRun("notes", "show", "3fa1")
	want := "- [ ] get a quote\n- [ ] book a day\n\n- called on Monday\n"
	if out != want {
		t.Fatalf("show = %q, want %q", out, want)
	}
	var js map[string]any
	_ = json.Unmarshal([]byte(h.mustRun("notes", "show", "Call the", "--json")), &js)
	if js["id"] != "3fa10001" || js["text"] != strings.TrimSuffix(want, "\n") || len(js["appends"].([]any)) != 1 || js["body_version"] == "" {
		t.Fatalf("show --json = %v", js)
	}
	// A task's note shows by its id too; an ambiguous prefix changes nothing.
	if out := h.mustRun("notes", "show", "fixs"); !strings.Contains(out, "trap") {
		t.Fatalf("task note via show: %q", out)
	}
	if code, _, errb := h.run("notes", "show", "zzz"); code != ExitUsage || !strings.Contains(errb, "no note matches") {
		t.Fatalf("unknown ref: %d %s", code, errb)
	}
}

// Scenario "Append from a script".
func TestNotesAppendFromScript(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.seedNotes()
	out := h.mustRun("notes", "append", "Meeting", "- decided: ship Friday", "--json")
	var res map[string]any
	_ = json.Unmarshal([]byte(out), &res)
	if res["entity"] != "note" || res["entity_id"] != "meet0001" || res["append_id"] == "" {
		t.Fatalf("append = %s", out)
	}
	n := h.note("meet0001")
	apps := n["appends"].([]any)
	if n["description"] != "Agenda" || len(apps) != 1 || apps[0].(map[string]any)["text"] != "- decided: ship Friday" || apps[0].(map[string]any)["id"] != res["append_id"] {
		t.Fatalf("note after append = %v", n)
	}
	// From standard input.
	h.stdin = "- second line\n"
	h.mustRun("notes", "append", "meet", "--body-file", "-")
	h.stdin = ""
	if apps := h.note("meet0001")["appends"].([]any); len(apps) != 2 {
		t.Fatalf("stdin append: %v", apps)
	}
}

// Scenario "Edit refused after a newer change".
func TestNotesEditBodyChanged(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.seedNotes()
	file := filepath.Join(t.TempDir(), "notes.md")
	if err := os.WriteFile(file, []byte("# From the CLI\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	h.onceBefore("PATCH", "/api/v1/notes/3fa10001", func() {
		h.edit("note", "3fa10001", map[string]any{"description": "edited in the app"})
	})
	code, out, _ := h.run("notes", "edit", "3fa1", "--body-file", file, "--json")
	h.hook = nil
	if code != ExitServer || !strings.Contains(out, `"code":"body_changed"`) {
		t.Fatalf("stale edit: %d %s", code, out)
	}
	if d := h.note("3fa10001")["description"]; d != "edited in the app" {
		t.Fatalf("description = %v", d)
	}
	// Without a concurrent change the replacement and the other fields go through.
	h.mustRun("notes", "edit", "3fa1", "--body-file", file, "--title", "Plumber", "--project", "none")
	n := h.note("3fa10001")
	if n["description"] != "# From the CLI\n" || n["title"] != "Plumber" || n["project_id"] != nil {
		t.Fatalf("edit = %v", n)
	}
}

// Scenario "Remove needs --yes off a terminal".
func TestNotesRmNeedsYes(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.seedNotes()
	h.requestLog()
	code, out, _ := h.run("notes", "rm", "3fa1", "--json")
	if code != ExitUsage || !strings.Contains(out, "confirmation_required") {
		t.Fatalf("rm without --yes: %d %s", code, out)
	}
	if w := writesIn(h.requestLog()); len(w) != 0 || h.note("3fa10001")["deleted_at"] != nil {
		t.Fatalf("something was deleted: %v", w)
	}
	out = h.mustRun("notes", "rm", "3fa1", "--yes", "--json")
	if !strings.Contains(out, `"status":"deleted"`) || h.note("3fa10001")["deleted_at"] == nil {
		t.Fatalf("rm --yes: %s", out)
	}
}

// Scenario "Turn into a task".
func TestNotesToTask(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.seedNotes()
	out := strings.TrimSpace(h.mustRun("notes", "to-task", "Call the plumber"))
	tk := h.task(out)
	if tk == nil || tk["title"] != "Call the plumber" || !strings.Contains(tk["description"].(string), "get a quote") {
		t.Fatalf("task %q = %v", out, tk)
	}
	if h.note("3fa10001")["deleted_at"] == nil {
		t.Fatal("the note is not in the Trash")
	}
}

func TestNotesAddAndReadOnly(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.seedNotes()
	out := h.mustRun("notes", "add", "Wi-Fi", "--project", "Home", "--label", "home", "--body", "- network: home", "--idempotency-key", "wifi-1", "--json")
	var n map[string]any
	_ = json.Unmarshal([]byte(out), &n)
	stored := h.note(n["id"].(string))
	if stored["title"] != "Wi-Fi" || stored["description"] != "- network: home" || stored["project_id"] != "home0001" || len(stored["labels"].([]any)) != 1 {
		t.Fatalf("add = %v", stored)
	}
	again := h.mustRun("notes", "add", "Wi-Fi", "--project", "Home", "--label", "home", "--body", "- network: home", "--idempotency-key", "wifi-1", "--json")
	var n2 map[string]any
	_ = json.Unmarshal([]byte(again), &n2)
	if n2["id"] != n["id"] {
		t.Fatalf("idempotent add made a second note: %v %v", n["id"], n2["id"])
	}
	h.requestLog()
	for _, args := range [][]string{{"notes", "add", "x"}, {"notes", "append", "meet", "y"}, {"task", "note", "fixs", "--append", "z"}} {
		if code, _, _ := h.run(append(args, "--read-only")...); code != ExitNotPermitted {
			t.Fatalf("%v --read-only: exit %d", args, code)
		}
	}
	if w := writesIn(h.requestLog()); len(w) != 0 {
		t.Fatalf("read-only sent %v", w)
	}
	// Reads still work in read-only mode.
	if out := h.mustRun("task", "note", "fixs", "--read-only"); !strings.Contains(out, "trap") {
		t.Fatalf("read-only read: %q", out)
	}
}

// ---- ot task note ----

// Scenario "Read a task's note".
func TestTaskNoteRead(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.put("task", "8c2a0001", map[string]any{"title": "Plan the trip", "description": "# Plan\n\n- [ ] book the train\n- [ ] pack"})
	out := h.mustRun("task", "note", "8c2a")
	if !strings.Contains(out, "# Plan\n") || !strings.Contains(out, "- [ ] book the train\n- [ ] pack\n") {
		t.Fatalf("task note = %q", out)
	}
	var js map[string]any
	_ = json.Unmarshal([]byte(h.mustRun("task", "note", "Plan the", "--json")), &js)
	if js["id"] != "8c2a0001" || js["kind"] != "task" || js["body_version"] == "" || js["appends"] == nil {
		t.Fatalf("--json = %v", js)
	}
}

// Scenario "Replace from a file".
func TestTaskNoteReplaceFromFile(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.put("task", "8c2a0001", map[string]any{"title": "Plan the trip", "description": "old plan"})
	file := filepath.Join(t.TempDir(), "plan.md")
	if err := os.WriteFile(file, []byte("## New plan\n- [ ] go\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	h.mustRun("task", "note", "8c2a", "--file", file)
	if d := h.task("8c2a0001")["description"]; d != "## New plan\n- [ ] go\n" {
		t.Fatalf("description = %q", d)
	}
	h.mustRun("task", "note", "8c2a", "--clear")
	if d := h.task("8c2a0001")["description"]; d != "" {
		t.Fatalf("cleared description = %q", d)
	}
}

// Scenario "Replace after a concurrent edit".
func TestTaskNoteReplaceConflict(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.put("task", "8c2a0001", map[string]any{"title": "Plan the trip", "description": "old plan"})
	h.onceBefore("PATCH", "/api/v1/tasks/8c2a0001", func() {
		h.edit("task", "8c2a0001", map[string]any{"description": "the app's edit"})
	})
	code, out, _ := h.run("task", "note", "8c2a", "--set", "mine", "--json")
	h.hook = nil
	if code != ExitServer || !strings.Contains(out, `"code":"body_changed"`) {
		t.Fatalf("concurrent replace: %d %s", code, out)
	}
	if d := h.task("8c2a0001")["description"]; d != "the app's edit" {
		t.Fatalf("description = %q", d)
	}
}

// Scenario "Append".
func TestTaskNoteAppend(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.put("task", "8c2a0001", map[string]any{"title": "Call the plumber", "description": "Number: 555"})
	out := h.mustRun("task", "note", "8c2a", "--append", "- called, no answer", "--json")
	var res map[string]any
	_ = json.Unmarshal([]byte(out), &res)
	if res["entity"] != "task" || res["entity_id"] != "8c2a0001" || res["append_id"] == "" {
		t.Fatalf("append = %s", out)
	}
	tk := h.task("8c2a0001")
	apps := tk["appends"].([]any)
	if tk["description"] != "Number: 555" || len(apps) != 1 || apps[0].(map[string]any)["text"] != "- called, no answer" {
		t.Fatalf("task = %v", tk)
	}
	if out := h.mustRun("task", "note", "8c2a"); out != "Number: 555\n\n- called, no answer\n" {
		t.Fatalf("read after append = %q", out)
	}
}

// Scenario "Two options".
func TestTaskNoteTwoOptions(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.put("task", "8c2a0001", map[string]any{"title": "Plan the trip"})
	h.requestLog()
	code, _, errb := h.run("task", "note", "8c2a", "--set", "x", "--append", "y")
	if code != ExitUsage || !strings.Contains(errb, "only one of") {
		t.Fatalf("two options: %d %s", code, errb)
	}
	if log := h.requestLog(); len(log) != 0 {
		t.Fatalf("requests sent: %v", log)
	}
}

func TestNotesOutputsMatchSchemas(t *testing.T) {
	h := newHarness(t)
	h.login()
	h.seedNotes()
	schemas := loadSchemas(t)
	check := func(spec string, args ...string) string {
		t.Helper()
		out := h.mustRun(append(args, "--json")...)
		mustMatch(t, schemas, spec, out, specOutput(t, spec))
		return out
	}
	check("notes list", "notes")
	check("notes search", "notes", "search", "plumber")
	check("notes show", "notes", "show", "meet")
	var added map[string]any
	_ = json.Unmarshal([]byte(check("notes add", "notes", "add", "Schema note", "--body", "x")), &added)
	id := added["id"].(string)
	check("notes edit", "notes", "edit", id, "--title", "Schema note 2")
	check("notes append", "notes", "append", id, "more")
	check("task note", "task", "note", "fixs")
	check("task note", "task", "note", "fixs", "--append", "more")
	check("notes to-task", "notes", "to-task", "meet")
	check("notes rm", "notes", "rm", id, "--yes")
}
