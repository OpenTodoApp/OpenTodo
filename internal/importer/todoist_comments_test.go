package importer

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Todoist CSV note rows become comments of their task (OpenSpec change
// todoist-notes-comments).

const todoistNotesHeader = "TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE\n"

func todoistNotesPlan(t *testing.T, csv string) *Plan {
	t.Helper()
	parsed := parse(t, []byte(csv), Options{Format: todoistFormat})
	return BuildPlan(parsed, normalized(t, Options{}), &State{UserID: "user-1"}, time.Date(2026, 11, 23, 12, 0, 0, 0, time.UTC), counter())
}

func TestTodoistNotesBecomeComments(t *testing.T) {
	csv := todoistNotesHeader +
		"task,Plan trip,Book flights,1,1,Pete (14148749),,,,\n" +
		"note,Window seat please,,,,Pete (14148749),,2023-11-01T16:08:26.405000Z,,\n" +
		"note,Done – see **mail**,,,,Ana *B* (2),,,,\n" +
		"task,Pack,,4,1,,,,,\n" +
		"note,No author here,,,,,,2024-02-29T23:59:00+01:00,,\n" +
		"note,Nothing known,,,,,,,,\n" +
		"note,Bad date,,,,Ana,,yesterday,,\n"
	p := todoistNotesPlan(t, csv)
	tasks := changesOf(p, KindTask)
	comments := changesOf(p, KindComment)
	if len(tasks) != 2 || len(comments) != 5 {
		t.Fatalf("tasks %d, comments %d: %+v", len(tasks), len(comments), p.changes)
	}
	if d := fieldString(tasks[0], "description"); d != "Book flights" {
		t.Fatalf("description = %q", d)
	}
	if d := fieldString(tasks[1], "description"); d != "" {
		t.Fatalf("description = %q", d)
	}
	want := []struct{ task, body string }{
		{tasks[0].id, "**Pete** · 2023-11-01 16:08 UTC\n\nWindow seat please"},
		{tasks[0].id, "**Ana \\*B\\***\n\nDone – see **mail**"},
		{tasks[1].id, "2024-02-29 22:59 UTC\n\nNo author here"},
		{tasks[1].id, "Nothing known"},
		{tasks[1].id, "**Ana**\n\nBad date"},
	}
	var last int64
	for i, c := range comments {
		if got := fieldString(c, "body"); got != want[i].body {
			t.Fatalf("comment %d body = %q, want %q", i, got, want[i].body)
		}
		if fieldString(c, "task_id") != want[i].task || fieldString(c, "author_id") != "user-1" || !c.created {
			t.Fatalf("comment %d = %+v", i, c)
		}
		var at int64
		_ = json.Unmarshal(c.value("created_at"), &at)
		if at <= last {
			t.Fatalf("comment %d created_at %d not after %d: the file's order is lost", i, at, last)
		}
		last = at
		if string(c.value("mentions")) != "[]" || !opsync.IsNull(c.value("parent_id")) {
			t.Fatalf("comment %d = %+v", i, c)
		}
	}
	for _, r := range p.Rows {
		if len(r.Warnings) > 0 {
			t.Fatalf("row warnings: %+v", r)
		}
	}
	if len(p.Notes) != 1 || !strings.Contains(p.Notes[0], "single Todoist CSV") {
		t.Fatalf("notes = %q", p.Notes)
	}
}

// Past the per-import cap a note goes into the description as before, with one
// note for the whole file.
func TestTodoistNotesPastTheCap(t *testing.T) {
	var b strings.Builder
	b.WriteString(todoistNotesHeader)
	b.WriteString("task,Busy,,4,1,,,,,\n")
	for i := range MaxComments + 2 {
		fmt.Fprintf(&b, "note,Note %d,,,,Pete (1),,,,\n", i)
	}
	p := todoistNotesPlan(t, b.String())
	if n := len(changesOf(p, KindComment)); n != MaxComments {
		t.Fatalf("comments = %d, want %d", n, MaxComments)
	}
	task := changesOf(p, KindTask)[0]
	want := fmt.Sprintf("Comments\n\n- Note %d\n- Note %d", MaxComments, MaxComments+1)
	if d := fieldString(task, "description"); d != want {
		t.Fatalf("description = %q", d)
	}
	var notes []string
	for _, n := range p.Notes {
		if strings.Contains(n, "description") {
			notes = append(notes, n)
		}
	}
	if len(notes) != 1 || notes[0] != "2 notes were added to their tasks' description instead, as an import creates at most 5,000 comments" {
		t.Fatalf("notes = %q", p.Notes)
	}
}

// A note too long for a comment body with its first line is posted without it; one too
// long even alone is cut to fit. Neither goes into the description, which has the same bound.
func TestTodoistLongNotes(t *testing.T) {
	nearly := strings.Repeat("x", opsync.MaxValueBytes-30)
	huge := strings.Repeat("é", opsync.MaxValueBytes)
	csv := todoistNotesHeader + "task,Long,,4,1,,,,,\n" +
		"note," + nearly + ",,,,Pete (1),,2023-11-01T16:08:26Z,,\n" +
		"note," + huge + ",,,,Pete (1),,,,\n" +
		"note,Short,,,,Pete (1),,,,\n"
	p := todoistNotesPlan(t, csv)
	comments := changesOf(p, KindComment)
	if len(comments) != 3 {
		t.Fatalf("comments = %d", len(comments))
	}
	if b := fieldString(comments[0], "body"); b != nearly {
		t.Fatalf("first body has %d bytes, want the note alone", len(b))
	}
	cut := fieldString(comments[1], "body")
	if !strings.HasSuffix(cut, "…") || !strings.HasPrefix(huge, strings.TrimSuffix(cut, "…")) || !utf8.ValidString(cut) {
		t.Fatalf("second body is not a cut of the note (%d bytes)", len(cut))
	}
	if b := fieldString(comments[2], "body"); b != "**Pete**\n\nShort" {
		t.Fatalf("third body = %q", b)
	}
	if d := fieldString(changesOf(p, KindTask)[0], "description"); d != "" {
		t.Fatalf("description has %d bytes", len(d))
	}
	var notes []string
	for _, n := range p.Notes {
		if strings.Contains(n, "cut to fit") {
			notes = append(notes, n)
		}
	}
	if len(notes) != 1 || notes[0] != "1 comment was cut to fit, as it was too long for a comment" {
		t.Fatalf("notes = %q", p.Notes)
	}
}

// A note after a row the profile cannot read still belongs to the task above it.
func TestTodoistNoteAfterAnUnknownRow(t *testing.T) {
	p := todoistNotesPlan(t, todoistNotesHeader+"task,A,,4,1,,,,,\nbogus,x,,,,,,,,\nnote,Kept,,,,Pete (1),,,,\n")
	if c := changesOf(p, KindComment); len(c) != 1 || fieldString(c[0], "body") != "**Pete**\n\nKept" {
		t.Fatalf("comments = %+v", c)
	}
}

// An author's name never reads as a mention or a link.
func TestTodoistAuthorIsPlainText(t *testing.T) {
	p := todoistNotesPlan(t, todoistNotesHeader+"task,A,,4,1,,,,,\nnote,Hi,,,,@bob https://x.example (7),,,,\n")
	if b := fieldString(changesOf(p, KindComment)[0], "body"); b != "**\\@bob https\\://x.example**\n\nHi" {
		t.Fatalf("body = %q", b)
	}
}

// The job writes every comment although the account's comment limit (60 a
// minute) is in force; a device stays limited, re-importing adds nothing, and
// Undo removes the comments.
func TestTodoistNotesImportJob(t *testing.T) {
	h := newHarness(t)
	var b strings.Builder
	b.WriteString(todoistNotesHeader)
	b.WriteString("task,Busy,,4,1,,,,,\n")
	for i := range 100 {
		fmt.Fprintf(&b, "note,Note %d,,,,Pete (1),,2023-11-01T16:08:26Z,,\n", i)
	}
	opts := Options{Format: todoistFormat}
	job := h.run(b.String(), opts)
	if job.Status != StatusDone || job.Totals.Refused != 0 {
		t.Fatalf("job = %+v", job)
	}
	list := h.list(KindComment, false)
	if len(list) != 100 {
		t.Fatalf("comments = %d", len(list))
	}
	tasks := h.list(KindTask, false)
	if len(tasks) != 1 || str(tasks[0], "description") != "" {
		t.Fatalf("tasks = %+v", tasks)
	}
	for _, c := range list {
		if str(c, "author_id") != h.uid || str(c, "task_id") != str(tasks[0], "id") || !strings.HasPrefix(str(c, "body"), "**Pete** · 2023-11-01 16:08 UTC\n\nNote ") {
			t.Fatalf("comment = %v", c)
		}
	}
	// A device's comments still count against the limit, from a full window.
	refused := 0
	for i := range opsync.CommentRateLimit + 1 {
		id := fmt.Sprintf("dev-%d", i)
		h.write("A", time.Now().UnixMilli()+int64(i), KindComment, id, map[string]any{
			"task_id": str(tasks[0], "id"), "author_id": h.uid, "body": "mine", "parent_id": nil, "created_at": 1})
		if len(h.list(KindComment, false)) != 100+i+1 {
			refused++
		}
	}
	if refused != 1 {
		t.Fatalf("device comments refused = %d, want 1 (the one over the limit)", refused)
	}
	if again := h.run(b.String(), opts); again.Totals.Written != 0 {
		t.Fatalf("re-import wrote %+v", again.Totals)
	}
	if _, err := h.svc.Undo(context.Background(), h.uid, job.ID); err != nil {
		t.Fatal(err)
	}
	if n := len(h.list(KindComment, false)); n != opsync.CommentRateLimit {
		t.Fatalf("comments after undo = %d, want the device's %d", n, opsync.CommentRateLimit)
	}
}
