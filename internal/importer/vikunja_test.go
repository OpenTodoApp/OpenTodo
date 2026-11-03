package importer

import (
	"io"
	"strings"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/blobs"
)

// vikunjaZip is a Vikunja 2.x export of one board project: buckets Backlog,
// Doing and the done bucket Done (view 36), a task in Doing, a weekly task, a
// task with an attachment, and the default Inbox with one task.
func vikunjaZip(t *testing.T) []byte {
	t.Helper()
	data := `[
 {"id":1,"title":"Inbox","description":"","hex_color":"","parent_project_id":0,"is_archived":false,"position":65536,"views":[],
  "tasks":[{"id":9,"title":"Call mum","description":"","done":false,"done_at":"0001-01-01T00:00:00Z","due_date":"0001-01-01T00:00:00Z",
   "start_date":"0001-01-01T00:00:00Z","end_date":"0001-01-01T00:00:00Z","priority":0,"repeat_after":0,"repeat_mode":0,"labels":null,
   "reminders":null,"related_tasks":{},"attachments":null,"created":"2026-11-02T10:00:00Z","updated":"2026-11-02T10:00:00Z"}]},
 {"id":7,"title":"Work Board","description":"<p>Team board</p>","hex_color":"1973ff","parent_project_id":0,"is_archived":false,"position":131072,
  "views":[{"id":33,"view_kind":"list","position":100,"done_bucket_id":0},{"id":36,"view_kind":"kanban","position":400,"done_bucket_id":27}],
  "buckets":[{"id":25,"title":"Backlog","project_view_id":36},{"id":26,"title":"Doing","project_view_id":36},{"id":27,"title":"Done","project_view_id":36}],
  "task_buckets":[{"bucket_id":26,"task_id":5,"project_view_id":36},{"bucket_id":25,"task_id":6,"project_view_id":36},{"bucket_id":27,"task_id":8,"project_view_id":36}],
  "positions":[{"task_id":5,"project_view_id":33,"position":1},{"task_id":6,"project_view_id":33,"position":2},{"task_id":8,"project_view_id":33,"position":3}],
  "tasks":[
   {"id":5,"title":"Outline the report","description":"<p>Draft it.</p><ul><li><p>Revenue</p></li></ul>","done":false,"done_at":"0001-01-01T00:00:00Z",
    "due_date":"2026-11-20T17:00:00Z","start_date":"0001-01-01T00:00:00Z","end_date":"0001-01-01T00:00:00Z","priority":5,"repeat_after":0,"repeat_mode":0,
    "labels":[{"id":3,"title":"urgent","hex_color":"e53935"}],"reminders":[{"reminder":"2026-11-20T16:00:00Z","relative_period":-3600,"relative_to":"due_date"}],
    "related_tasks":{},"attachments":[{"id":1,"task_id":5,"file":{"id":2,"name":"notes.txt","mime":"text/plain; charset=utf-8","size":5}}],
    "created":"2026-11-02T10:00:00Z","updated":"2026-11-02T10:00:00Z","percent_done":0.5,"hex_color":"ff5722"},
   {"id":6,"title":"Water the plants","description":"","done":false,"done_at":"0001-01-01T00:00:00Z","due_date":"2026-11-05T00:00:00Z",
    "start_date":"0001-01-01T00:00:00Z","end_date":"0001-01-01T00:00:00Z","priority":3,"repeat_after":604800,"repeat_mode":0,"labels":null,
    "reminders":null,"related_tasks":{"related":[{"id":5}]},"attachments":null,"created":"2026-11-02T10:00:00Z","updated":"2026-11-02T10:00:00Z"},
   {"id":8,"title":"Ship notes","description":"","done":true,"done_at":"0001-01-01T00:00:00Z","due_date":"0001-01-01T00:00:00Z",
    "start_date":"0001-01-01T00:00:00Z","end_date":"0001-01-01T00:00:00Z","priority":1,"repeat_after":0,"repeat_mode":0,"labels":null,
    "reminders":null,"related_tasks":{},"attachments":null,"created":"2026-11-02T10:00:00Z","updated":"2026-11-02T11:00:00Z"}]}
]`
	return zipOf(t, map[string]string{"VERSION": "v2.7.1", "data.json": data, "filters.json": "null", "files/2": "hello"})
}

func TestVikunjaExport(t *testing.T) {
	h := newHarness(t)
	store, err := blobs.New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	h.svc.SetBlobs(store, nil)
	job := h.run(string(vikunjaZip(t)), Options{TimeZone: "UTC"})
	if job.Status != StatusDone || job.Format != vikunjaFormat {
		t.Fatalf("job = %+v", job)
	}
	sections := map[string]string{}
	for _, s := range h.list("section", false) {
		sections[str(s, "id")] = str(s, "name")
	}
	if len(sections) != 2 {
		t.Fatalf("sections = %v (want Backlog and Doing, no Done)", sections)
	}
	tasks := map[string]map[string]string{}
	for _, task := range h.list("task", false) {
		tasks[str(task, "title")] = map[string]string{"section": sections[str(task, "section_id")], "recurrence": str(task, "recurrence"),
			"project": str(task, "project_id"), "priority": string(task["priority"]), "description": str(task, "description"),
			"completed": string(task["completed_at"]), "id": str(task, "id")}
	}
	if got := tasks["Outline the report"]; got["section"] != "Doing" || got["priority"] != "1" || got["description"] != "Draft it.\n\n- Revenue" {
		t.Fatalf("board task = %v", got)
	}
	if got := tasks["Water the plants"]; got["section"] != "Backlog" || got["recurrence"] != "every 7 days" || got["priority"] != "2" {
		t.Fatalf("weekly task = %v", got)
	}
	if got := tasks["Ship notes"]; got["section"] != "" || got["completed"] != "1793617200000" {
		t.Fatalf("done task = %v", got)
	}
	if got := tasks["Call mum"]; got["project"] != "" {
		t.Fatalf("inbox task = %v", got)
	}
	atts := h.list("attachment", false)
	if len(atts) != 1 || str(atts[0], "name") != "notes.txt" || str(atts[0], "mime") != "text/plain" ||
		str(atts[0], "author_id") != h.uid || str(atts[0], "task_id") != tasks["Outline the report"]["id"] {
		t.Fatalf("attachments = %v", atts)
	}
	f, _, err := store.Open(str(atts[0], "id"))
	if err != nil {
		t.Fatal(err)
	}
	b, _ := io.ReadAll(f)
	f.Close()
	if string(b) != "hello" {
		t.Fatalf("file bytes = %q", b)
	}
	rems := h.list("reminder", false)
	if len(rems) != 1 || string(rems[0]["offset_minutes"]) != "-60" {
		t.Fatalf("reminders = %v", rems)
	}
}

// A bare data.json is read too; its attachments are named, not imported.
func TestVikunjaDataJSONAlone(t *testing.T) {
	z := vikunjaZip(t)
	entries, err := readArchive(z, DefaultMaxBytes)
	if err != nil {
		t.Fatal(err)
	}
	var data []byte
	for _, e := range entries {
		if e.name == "data.json" {
			data = e.data
		}
	}
	p, err := parseWith(t, data, nil)
	if err != nil || p.Format != vikunjaFormat {
		t.Fatalf("%v %v", p, err)
	}
	found := false
	for _, r := range p.Rows {
		found = found || strings.Contains(strings.Join(r.Warnings, "|"), `attachment "notes.txt" dropped (upload the whole export ZIP`)
	}
	if !found {
		t.Fatalf("rows = %+v", p.Rows)
	}
	// A forced format that is not Vikunja's is refused for the archive.
	if _, err := parseWith(t, z, func(o *Options) { o.Format = "trello-json" }); err == nil || !strings.Contains(err.Error(), "Vikunja export") {
		t.Fatalf("forced format: %v", err)
	}
}
