package importer

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"
)

// Scenario tests of the iCalendar profile (OpenSpec change ics-import); the
// golden previews of testdata/ics pin every row.

func icsFixture(t *testing.T, name string) []byte {
	t.Helper()
	data, err := os.ReadFile("testdata/ics/" + name)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

// A Nextcloud list imports as one project whose subtasks find their parent
// wherever it is in the file, and a second import skips every task.
func TestICSNextcloudSubtasks(t *testing.T) {
	h := newHarness(t)
	data := string(icsFixture(t, "nextcloud.ics"))
	job := h.run(data, Options{})
	if job.Status != StatusDone {
		t.Fatalf("job %+v", job)
	}
	tasks := byTitle(h.list("task", false))
	projects := byTitle(h.list("project", false))
	groceries, ok := projects["Groceries"]
	if !ok {
		t.Fatalf("no project named after X-WR-CALNAME: %v", projects)
	}
	cake := tasks["Bake a cake"]
	for _, title := range []string{"Buy flour", "Buy eggs"} {
		if str(tasks[title], "parent_id") != str(cake, "id") {
			t.Errorf("%s: parent %q, want the cake %q", title, str(tasks[title], "parent_id"), str(cake, "id"))
		}
	}
	if str(tasks["Grandchild step"], "parent_id") != str(tasks["Buy eggs"], "id") {
		t.Errorf("grandchild not under Buy eggs")
	}
	for title, task := range tasks {
		if str(task, "project_id") != str(groceries, "id") {
			t.Errorf("%s: project %q", title, str(task, "project_id"))
		}
	}
	if string(tasks["Return the bottles"]["completed_at"]) != "1793527200000" {
		t.Errorf("completed_at %s", tasks["Return the bottles"]["completed_at"])
	}
	if !strings.Contains(string(cake["origin"]), `"provider":"ics"`) {
		t.Errorf("origin %s", cake["origin"])
	}
	plan, err := h.svc.Preview(context.Background(), h.uid, []byte(data), Options{})
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range plan.Rows {
		if r.Kind == KindTask && (r.Outcome != OutcomeSkip || r.Reason != ReasonAlreadyImported) {
			t.Errorf("re-preview row %+v", r)
		}
	}
}

// Zoned times become wall times in the import's time zone, and a reminder
// relative to the due time keeps its offset.
func TestICSRecurringInTimeZone(t *testing.T) {
	p, err := parseWith(t, icsFixture(t, "recurring.ics"), func(o *Options) {
		o.TimeZone = "Europe/Berlin"
		if err := o.Normalize(); err != nil {
			t.Fatal(err)
		}
	})
	if err != nil {
		t.Fatal(err)
	}
	r := p.Rows[0]
	if r.Title != "Weekly review" || r.Due == nil || r.Due.Date != "2026-11-20" || r.Due.Time != "09:00" {
		t.Fatalf("row %+v due %+v", r, r.Due)
	}
	if r.Recurrence != "every friday" {
		t.Errorf("recurrence %q", r.Recurrence)
	}
	if len(r.Reminders) != 1 || r.Reminders[0].Absolute || r.Reminders[0].Offset != -15 {
		t.Errorf("reminders %+v", r.Reminders)
	}
}

// A component the mapping cannot read is one row in error; the others import.
func TestICSMalformedComponentSkipped(t *testing.T) {
	h := newHarness(t)
	job := h.run(string(icsFixture(t, "malformed.ics")), Options{})
	if job.Status != StatusDone {
		t.Fatalf("job %+v", job)
	}
	tasks := byTitle(h.list("task", false))
	if len(tasks) != 2 || tasks["Read a book"] == nil || tasks["Call the plumber"] == nil {
		t.Fatalf("tasks %v", tasks)
	}
	if str(tasks["Read a book"], "start") != "2026-12-01" {
		t.Errorf("DTSTART alone: start %q", str(tasks["Read a book"], "start"))
	}
	if job.Totals.Error != 4 {
		t.Errorf("errors %d, want 4", job.Totals.Error)
	}
}

// RELATED-TO without RELTYPE is a parent (RFC 5545 3.2.15).
func TestICSRelatedToDefaultsToParent(t *testing.T) {
	data := "BEGIN:VCALENDAR\r\nBEGIN:VTODO\r\nUID:child\r\nSUMMARY:Child\r\nRELATED-TO:parent\r\nEND:VTODO\r\n" +
		"BEGIN:VTODO\r\nUID:parent\r\nSUMMARY:Parent\r\nEND:VTODO\r\nEND:VCALENDAR\r\n"
	p, err := parseWith(t, []byte(data), nil)
	if err != nil {
		t.Fatal(err)
	}
	if p.Format != icsFormat || len(p.Rows) != 2 || p.Rows[0].ParentSourceID != "ics:parent" {
		t.Fatalf("parsed %+v", p)
	}
	if p.Rows[0].ProjectSourceID != "" {
		t.Errorf("a file without X-WR-CALNAME goes to the target, got %q", p.Rows[0].ProjectSourceID)
	}
}

// A file forced to ics that is not a calendar is refused as a whole.
func TestICSNotACalendar(t *testing.T) {
	_, err := parseWith(t, []byte("title\nBuy milk\n"), func(o *Options) { o.Format = icsFormat })
	var fe *FileError
	if !errors.As(err, &fe) || !strings.Contains(fe.Msg, "BEGIN:VCALENDAR") {
		t.Fatalf("err %v", err)
	}
}
