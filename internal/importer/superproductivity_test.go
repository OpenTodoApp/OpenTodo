package importer

import (
	"strings"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/timetrack"
)

// spBackup is a Super Productivity 19 backup: one project, a task with time
// tracked on two days, a weekly repeat on Monday and Thursday, and an Inbox task.
const spBackup = `{"timestamp":1793661869130,"lastUpdate":1793661869130,"crossModelVersion":4.5,"data":{
 "task":{"ids":["t1","t2","t3"],"entities":{
  "t1":{"id":"t1","title":"Write report","projectId":"p1","isDone":false,"tagIds":["g1"],"subTaskIds":[],
   "timeSpentOnDay":{"2026-10-01":1800000,"2026-10-02":3600000},"timeEstimate":5400001,"created":1793661181128,"attachments":[]},
  "t2":{"id":"t2","title":"Weekly sync","projectId":"p1","isDone":false,"tagIds":[],"subTaskIds":[],"timeSpentOnDay":{},
   "dueDay":"2026-11-05","repeatCfgId":"r1","created":1793661181128,"attachments":[]},
  "t3":{"id":"t3","title":"Call the plumber","projectId":"INBOX_PROJECT","isDone":false,"tagIds":[],"subTaskIds":[],"timeSpentOnDay":{},"attachments":[]}}},
 "project":{"ids":["INBOX_PROJECT","p1"],"entities":{
  "INBOX_PROJECT":{"id":"INBOX_PROJECT","title":"Inbox","taskIds":["t3"]},
  "p1":{"id":"p1","title":"Work","isArchived":false,"isDone":false,"taskIds":["t1","t2"]}}},
 "tag":{"ids":["TODAY","g1"],"entities":{"TODAY":{"id":"TODAY","title":"Today"},"g1":{"id":"g1","title":"writing"}}},
 "taskRepeatCfg":{"ids":["r1"],"entities":{"r1":{"id":"r1","repeatCycle":"WEEKLY","repeatEvery":1,"monday":true,"tuesday":false,
  "wednesday":false,"thursday":true,"friday":false,"saturday":false,"sunday":false,"startDate":"2026-11-05","isPaused":false}}},
 "archiveYoung":{"task":{"ids":[],"entities":{}}},"archiveOld":{"task":{"ids":[],"entities":{}}}}}`

func TestSuperProductivityBackup(t *testing.T) {
	h := newHarness(t)
	job := h.run(spBackup, Options{TimeZone: "UTC"})
	if job.Status != StatusDone || job.Format != superProductivityFormat {
		t.Fatalf("job = %+v", job)
	}
	tasks := map[string]map[string]string{}
	for _, task := range h.list("task", false) {
		tasks[str(task, "title")] = map[string]string{"id": str(task, "id"), "recurrence": str(task, "recurrence"),
			"project": str(task, "project_id"), "estimate": string(task["estimate_minutes"])}
	}
	if got := tasks["Weekly sync"]; got["recurrence"] != "every monday, thursday" {
		t.Fatalf("weekly = %v", got)
	}
	if got := tasks["Write report"]; got["estimate"] != "91" || got["project"] == "" {
		t.Fatalf("report = %v", got)
	}
	if got := tasks["Call the plumber"]; got["project"] != "" {
		t.Fatalf("inbox task = %v", got)
	}
	entries := h.list("time_entry", false)
	if len(entries) != 2 {
		t.Fatalf("entries = %v", entries)
	}
	total := 0
	for _, e := range entries {
		te := timetrack.FromRow(e)
		if te.TaskID != tasks["Write report"]["id"] || te.UserID != h.uid {
			t.Fatalf("entry = %+v", te)
		}
		total += timetrack.MinutesOf(te, 0)
	}
	if total != 90 {
		t.Fatalf("tracked = %d minutes, want 90 (1 h 30 min)", total)
	}
}

// A backup older than version 14 has its slices at the top level, the Today
// tag on the task and the archive in taskArchive.
func TestSuperProductivityLegacy(t *testing.T) {
	legacy := `{"task":{"ids":["a"],"entities":{"a":{"id":"a","title":"Today thing","projectId":null,"tagIds":["TODAY"],"subTaskIds":[],"isDone":false}}},
		"project":{"ids":[],"entities":{}},"tag":{"ids":["TODAY"],"entities":{"TODAY":{"id":"TODAY","title":"Today"}}},
		"taskArchive":{"ids":["b"],"entities":{"b":{"id":"b","title":"Old thing","tagIds":[],"subTaskIds":[],"isDone":true,"doneOn":1700000000000}}}}`
	p, err := parseWith(t, []byte(legacy), nil)
	if err != nil || p.Format != superProductivityFormat || len(p.Rows) != 2 {
		t.Fatalf("%+v %v", p, err)
	}
	if r := p.Rows[0]; r.Due == nil || r.Due.Date != "2026-09-19" || len(r.Labels) != 0 || !strings.Contains(strings.Join(r.Warnings, "|"), "Today") {
		t.Fatalf("today row = %+v", r)
	}
	if r := p.Rows[1]; !r.Completed || r.CompletedAt != 1700000000000 {
		t.Fatalf("archived row = %+v", r)
	}
}
