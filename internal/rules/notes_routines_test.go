package rules

import (
	"errors"
	"fmt"
	"io"
	"log/slog"
	"slices"
	"strings"
	"testing"
	"time"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Standalone notes in routines (notes-in-routines): note triggers, the quiet
// wait of note.edited, the note steps, undo, encryption and Run now.

func (h *harness) note(user, id, title, text string, fields map[string]any) {
	h.t.Helper()
	base := map[string]any{"title": title, "description": text, "labels": []string{}, "position": 1, "created_at": h.clock.UnixMilli(), "deleted_at": nil, "project_id": nil}
	for k, v := range fields {
		base[k] = v
	}
	h.write(user, "phone", "note", id, base)
}

func (h *harness) getNote(user, id string) opsync.Entity {
	h.t.Helper()
	e, err := h.sync.Get(h.ctx, user, "note", id)
	if err != nil || e == nil {
		h.t.Fatalf("note %s: %v", id, err)
	}
	return e
}

func (h *harness) notes(user string) []opsync.Entity {
	h.t.Helper()
	rows, err := h.sync.List(h.ctx, user, "note", false)
	if err != nil {
		h.t.Fatal(err)
	}
	return rows
}

// "Routine" (standalone-notes) and "Import does not fire note triggers": a
// new note fires the note.created routine only; an import's notes fire none;
// a label added on a phone fires note.label.added once.
func TestNoteTriggers(t *testing.T) {
	h, sink, _ := routineHarness(t)
	h.write("alice", "laptop", "label", "todo", map[string]any{"name": "todo", "created_at": 1, "deleted_at": nil})
	h.routine("alice", "nc", "New note", `{"kind":"note.created"}`, "", `[{"id":"a","kind":"notify","in":{"text":{"literal":"note"}}}]`)
	h.routine("alice", "tc", "New task", `{"kind":"task.created"}`, "", `[{"id":"a","kind":"notify","in":{"text":{"literal":"task"}}}]`)
	h.routine("alice", "nl", "Todo", `{"kind":"note.label.added","label_id":"todo"}`, "", `[{"id":"a","kind":"note_to_task","in":{"note":{"ref":"trigger"}}}]`)

	h.note("alice", "n1", "Call the bank about the card", "", nil)
	h.e.Drain(h.ctx)
	if got := outcomes(h.runs("nc")); !slices.Equal(got, []string{OutcomeApplied + ":"}) {
		t.Fatalf("note.created runs %v", got)
	}
	if n := len(h.runs("tc")); n != 0 {
		t.Fatalf("task.created ran %d times for a note", n)
	}
	if r := h.runs("nc")[0]; r.NoteID != "n1" || r.TaskID != "" {
		t.Fatalf("run subject task=%q note=%q", r.TaskID, r.NoteID)
	}
	for i := range 40 {
		h.write("alice", "import", "note", fmt.Sprintf("imp%d", i), map[string]any{"title": "x", "description": "", "labels": []string{}, "position": 1, "created_at": 1, "deleted_at": nil})
	}
	h.e.Drain(h.ctx)
	if n := len(h.runs("nc")); n != 1 {
		t.Fatalf("an import fired %d note.created runs", n-1)
	}

	h.write("alice", "phone", "note", "n1", map[string]any{"labels": []string{"todo"}})
	h.e.Drain(h.ctx)
	if got := outcomes(h.runs("nl")); !slices.Equal(got, []string{OutcomeApplied + ":"}) {
		t.Fatalf("note.label.added runs %v", got)
	}
	if !h.getNote("alice", "n1").Deleted() {
		t.Fatal("the note is not in the Trash")
	}
	tasks := h.live("alice", func(e opsync.Entity) bool { return strOf(e["title"]) == "Call the bank about the card" })
	if len(tasks) != 1 {
		t.Fatalf("tasks %v", tasks)
	}
	// The note's routine, then the task routine for the task it became.
	if len(sink.notices) != 2 || sink.notices[0].Text != "note" || sink.notices[1].Text != "task" {
		t.Fatalf("notices %+v", sink.notices)
	}
}

// "Many saves, one event" and "Restart during the wait": a burst of edits
// fires note.edited once, 5 minutes after the last one, and a new engine on
// the same database neither loses nor repeats the wait.
func TestNoteEditedQuietWait(t *testing.T) {
	h, sink, _ := routineHarness(t)
	h.routine("alice", "ed", "Edited", `{"kind":"note.edited"}`, "", `[{"id":"a","kind":"notify","in":{"text":{"literal":"edited"}}}]`)
	h.note("alice", "j", "Journal", "", nil)
	for i := range 20 {
		h.clock = h.clock.Add(time.Minute)
		h.write("alice", "phone", "note", "j", map[string]any{"description": strings.Repeat("x", i+1)})
		h.e.Drain(h.ctx)
	}
	if n := len(h.runs("ed")); n != 0 {
		t.Fatalf("fired %d times while writing", n)
	}
	if next, ok, err := h.e.NextDue(h.ctx); err != nil || !ok || next.After(h.clock.Add(NoteEditQuiet)) || !next.After(h.clock) {
		t.Fatalf("next due %v %v %v, want by %v", next, ok, err, h.clock.Add(NoteEditQuiet))
	}
	h.clock = h.clock.Add(2 * time.Minute)
	// A restart: a new engine over the same database.
	e2 := New(h.e.db, h.sync, slog.New(slog.NewTextHandler(io.Discard, nil)))
	e2.Tools, e2.Env, e2.Routine = h.e.Tools, h.e.Env, h.e.Routine
	e2.SetClock(func() time.Time { return h.clock })
	h.sync.SetObserver(e2.Observe)
	h.e = e2
	h.e.Drain(h.ctx)
	if n := len(h.runs("ed")); n != 0 {
		t.Fatal("fired before the quiet time")
	}
	h.clock = h.clock.Add(3 * time.Minute)
	h.e.Drain(h.ctx)
	h.e.Drain(h.ctx)
	if got := outcomes(h.runs("ed")); !slices.Equal(got, []string{OutcomeApplied + ":"}) || len(sink.notices) != 1 {
		t.Fatalf("runs %v notices %d", got, len(sink.notices))
	}
	// A later edit fires again; a note moved to the Trash before the wait ends does not.
	h.clock = h.clock.Add(time.Hour)
	h.write("alice", "phone", "note", "j", map[string]any{"title": "Journal 2"})
	h.clock = h.clock.Add(NoteEditQuiet)
	h.e.Drain(h.ctx)
	h.write("alice", "phone", "note", "j", map[string]any{"description": "y"})
	h.write("alice", "phone", "note", "j", map[string]any{"deleted_at": h.clock.UnixMilli()})
	h.clock = h.clock.Add(NoteEditQuiet)
	h.e.Drain(h.ctx)
	if n := len(h.runs("ed")); n != 2 {
		t.Fatalf("runs %d, want 2", n)
	}
}

// "A note from the week's work", "Stale reference notes", "Only standalone
// notes", "Append while editing" and "Undo a run".
func TestNoteSteps(t *testing.T) {
	h, _, _ := routineHarness(t)
	h.project("alice", "reviews", "Reviews", "")
	h.project("alice", "ref", "Reference", "")
	h.write("alice", "laptop", "label", "review", map[string]any{"name": "review", "created_at": 1, "deleted_at": nil})
	for _, id := range []string{"t1", "t2"} {
		h.task("alice", id, map[string]any{"labels": []string{"review"}})
	}
	h.routine("alice", "week", "Weekly review note", `{"kind":"manual"}`, "", `[
		{"id":"a","kind":"find_tasks","in":{"condition":{"literal":{"labels":{"any":["review"]}}}}},
		{"id":"d","kind":"date","in":{}},
		{"id":"c","kind":"create_note","in":{"title":{"literal":{"format":"Week {d}"}},"text":{"literal":{"format":"{a}"}},"project":{"literal":{"project":"reviews"}},"labels":{"literal":["review"]}}}]`)
	res := h.runNow("alice", "week", "", false)
	if res.Run.Outcome != OutcomeApplied {
		t.Fatalf("week: %+v %v", res.Run, statuses(res))
	}
	var week opsync.Entity
	for _, n := range h.notes("alice") {
		if strOf(n["title"]) == "Week 2026-10-21" {
			week = n
		}
	}
	if week == nil || strOf(week["project_id"]) != "reviews" || !slices.Equal(listOf(week["labels"]), []string{"review"}) {
		t.Fatalf("week note %v", week)
	}

	// Stale reference notes: unchanged for 90 days get the label.
	h.note("alice", "old", "Old", "invoice 2024", map[string]any{"project_id": "ref"})
	h.clock = h.clock.Add(100 * 24 * time.Hour)
	h.note("alice", "new", "New", "fresh", map[string]any{"project_id": "ref"})
	h.task("alice", "inv", map[string]any{"description": "invoice"})
	h.routine("alice", "stale", "Stale", `{"kind":"manual"}`, "", `[
		{"id":"a","kind":"find_notes","in":{"project":{"literal":{"project":"ref"}},"unchanged_days":{"literal":90}}},
		{"id":"b","kind":"change_notes","in":{"notes":{"ref":"a"},"add_labels":{"literal":["review"]}}}]`)
	res = h.runNow("alice", "stale", "", false)
	if res.Run.Outcome != OutcomeApplied || res.Run.Writes != 1 {
		t.Fatalf("stale: %+v %v", res.Run, statuses(res))
	}
	if !slices.Contains(listOf(h.getNote("alice", "old")["labels"]), "review") || len(listOf(h.getNote("alice", "new")["labels"])) != 0 {
		t.Fatal("labels")
	}

	// Only standalone notes: words find the note, never the task's note.
	h.routine("alice", "find", "Find", `{"kind":"manual"}`, "", `[{"id":"a","kind":"find_notes","in":{"words":{"literal":"invoice"}}}]`)
	res = h.runNow("alice", "find", "", true)
	if ids := res.Steps[0].IDs; !slices.Equal(ids, []string{"old"}) {
		t.Fatalf("found %v", ids)
	}

	// Append while editing: the device's edit and the routine's line are both kept.
	h.note("alice", "journal", "Journal", "morning", nil)
	h.routine("alice", "line", "Journal line", `{"kind":"manual"}`, "", `[
		{"id":"g","kind":"get_note","in":{"note":{"literal":{"note":"journal"}}}},
		{"id":"a","kind":"append_to_note","in":{"of":{"ref":"g"},"text":{"literal":"Completed: 4 tasks"}}}]`)
	res = h.runNow("alice", "line", "", false)
	h.write("alice", "phone", "note", "journal", map[string]any{"appends.dev1": "a new paragraph"})
	n := h.getNote("alice", "journal")
	var appends []string
	for f, v := range n {
		if _, ok := opsync.AppendID(f); ok {
			appends = append(appends, strOf(v))
		}
	}
	slices.Sort(appends)
	if res.Run.Outcome != OutcomeApplied || !slices.Equal(appends, []string{"Completed: 4 tasks", "a new paragraph"}) {
		t.Fatalf("appends %v (%+v)", appends, res.Run)
	}

	// Undo a run: the created note goes to the Trash.
	u, err := h.e.Undo(h.ctx, "alice", "week", h.runs("week")[0].RunID)
	if err != nil || u.Restored == 0 {
		t.Fatalf("undo %+v %v", u, err)
	}
	if !h.getNote("alice", strOf(week["id"])).Deleted() {
		t.Fatal("the created note is not in the Trash")
	}
}

// "Note needed", "Task and note together" (engine side) and "Run on this note".
func TestNoteRunNow(t *testing.T) {
	h, _, _ := routineHarness(t)
	h.project("alice", "work", "Work", "")
	h.note("alice", "plan", "Planning meeting", "- [ ] book room\n- [x] done\n- [ ] send agenda", map[string]any{"project_id": "work"})
	h.routine("alice", "cb", "Checkboxes to tasks", `{"kind":"manual","on":"note"}`, "", `[
		{"id":"a","kind":"note_text","in":{"of":{"ref":"trigger"}}},
		{"id":"b","kind":"split_lines","in":{"text":{"ref":"a"},"only":{"literal":"open_checkboxes"}}},
		{"id":"c","kind":"create_tasks","in":{"text":{"ref":"b"},"project":{"literal":{"project":"work"}}}}]`)
	if _, err := h.e.RunNow(h.ctx, "alice", RunRequest{RuleID: "cb", RunID: "x1"}); !errors.Is(err, ErrNoteRequired) {
		t.Fatalf("without a note: %v", err)
	}
	h.task("alice", "t1", nil)
	if _, err := h.e.RunNow(h.ctx, "alice", RunRequest{RuleID: "cb", RunID: "x2", TaskID: "t1"}); !errors.Is(err, ErrNoteRequired) {
		t.Fatalf("with a task: %v", err)
	}
	res, err := h.e.RunNow(h.ctx, "alice", RunRequest{RuleID: "cb", RunID: "x3", NoteID: "plan"})
	if err != nil || res.Run.Outcome != OutcomeApplied || res.Run.NoteID != "plan" || res.Run.Source != SourceManual {
		t.Fatalf("run %+v %v", res.Run, err)
	}
	titles := []string{}
	for _, e := range h.live("alice", inProject("work")) {
		titles = append(titles, strOf(e["title"]))
	}
	slices.Sort(titles)
	if !slices.Equal(titles, []string{"book room", "send agenda"}) {
		t.Fatalf("tasks %v", titles)
	}
}

// "Labels on the server": an encrypted account's content-free note routine
// runs on the server; a note's text step is skipped (it needs a device).
func TestNoteRoutinesEncrypted(t *testing.T) {
	h, _, _ := routineHarness(t)
	if _, err := h.e.db.Exec(`INSERT INTO encryption_keys(user_id, version, kdf, salt, iterations, wrapped_passphrase, wrapped_recovery, created_at, updated_at)
		VALUES ('alice', 1, 1, 's', 600000, 'p', 'r', 1, 1)`); err != nil {
		t.Fatal(err)
	}
	h.project("alice", "ref", "Reference", "")
	h.write("alice", "laptop", "label", "review", map[string]any{"name": "review", "created_at": 1, "deleted_at": nil})
	h.note("alice", "old", "enc:v1:x", "enc:v1:y", map[string]any{"project_id": "ref"})
	h.clock = h.clock.Add(100 * 24 * time.Hour)
	h.routine("alice", "stale", "Stale", `{"kind":"manual"}`, "", `[
		{"id":"a","kind":"find_notes","in":{"project":{"literal":{"project":"ref"}},"unchanged_days":{"literal":90}}},
		{"id":"b","kind":"change_notes","in":{"notes":{"ref":"a"},"add_labels":{"literal":["review"]}}}]`)
	if res := h.runNow("alice", "stale", "", false); res.Run.Outcome != OutcomeApplied || res.Run.Writes != 1 {
		t.Fatalf("labels: %+v %v", res.Run, statuses(res))
	}
	h.routine("alice", "text", "Journal", `{"kind":"manual"}`, "", `[
		{"id":"g","kind":"get_note","in":{"note":{"literal":{"note":"old"}}}},
		{"id":"a","kind":"append_to_note","in":{"of":{"ref":"g"},"text":{"literal":"line"}}}]`)
	if res := h.runNow("alice", "text", "", false); res.Run.Outcome != OutcomeSkipped || res.Run.Reason != ErrCodeEncrypted {
		t.Fatalf("text: %+v", res.Run)
	}
}
