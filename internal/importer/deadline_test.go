package importer

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

// OpenSpec change deadlines, design D9: every importer writes the task's
// deadline field, and the preview counts tasks with one.

func TestCSVDeadlineColumn(t *testing.T) {
	p, err := parseWith(t, []byte("title,due_date,deadline\nReport,,2026-11-06\nBad,,next friday\nTimed,,2026-11-06T17:00\n"), nil)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(strings.Join(p.Recognised, ","), "deadline") {
		t.Fatalf("deadline not recognised: %v", p.Recognised)
	}
	if r := p.Rows[0]; r.Due != nil || r.Deadline != "2026-11-06" || r.Err != "" {
		t.Fatalf("row = %+v", r)
	}
	if r := p.Rows[1]; !strings.Contains(r.Err, `"next friday"`) {
		t.Fatalf("invalid deadline row = %+v", r)
	}
	if r := p.Rows[2]; r.Deadline != "2026-11-06" || len(r.Warnings) != 1 || !strings.Contains(r.Warnings[0], "deadline time dropped") {
		t.Fatalf("timed row = %+v", r)
	}
}

func TestGenericJSONDeadline(t *testing.T) {
	p, err := parseWith(t, []byte(`[{"title":"Report","due":"2026-11-02","deadline":"2026-11-06T17:00:00Z"}]`), nil)
	if err != nil {
		t.Fatal(err)
	}
	r := p.Rows[0]
	if r.Due == nil || r.Due.Date != "2026-11-02" || r.Deadline != "2026-11-06" {
		t.Fatalf("row = %+v due=%+v", r, r.Due)
	}
	if len(r.Warnings) != 1 || !strings.Contains(r.Warnings[0], "deadline time dropped") {
		t.Fatalf("warnings = %v", r.Warnings)
	}
	// A deadline alone is no longer read as the due date.
	p, _ = parseWith(t, []byte(`[{"title":"Only","deadline":"2026-11-06"}]`), nil)
	if r := p.Rows[0]; r.Due != nil || r.Deadline != "2026-11-06" {
		t.Fatalf("deadline only = %+v", r)
	}
}

func TestTodoistItemsDeadlineObject(t *testing.T) {
	p, err := parseWith(t, []byte(`{"items":[{"id":"1","content":"Report","deadline":{"date":"2026-11-06","lang":"en"}}],"projects":[]}`), nil)
	if err != nil {
		t.Fatal(err)
	}
	if r := p.Rows[0]; r.Deadline != "2026-11-06" || len(r.Warnings) != 0 {
		t.Fatalf("row = %+v", r)
	}
}

func TestTodoistBackupDeadline(t *testing.T) {
	csv := "TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE,DEADLINE,DEADLINE_LANG\n" +
		"task,Bericht,,1,1,,,,de,Europe/Berlin,21 Okt.,de\n" +
		"task,Unklar,,1,1,,,,en,Europe/Berlin,whenever,en\n"
	p, err := parseWith(t, zipOf(t, map[string]string{"Home [1].csv": csv}), func(o *Options) { o.exportedAt = time.Date(2026, 9, 19, 0, 0, 0, 0, time.UTC) })
	if err != nil {
		t.Fatal(err)
	}
	var got, unclear Row
	for _, r := range p.Rows {
		switch r.Title {
		case "Bericht":
			got = r
		case "Unklar":
			unclear = r
		}
	}
	if got.Deadline != "2026-10-21" || len(got.Warnings) != 0 || strings.Contains(got.Description, "Deadline") {
		t.Fatalf("todoist deadline row = %+v", got)
	}
	if unclear.Deadline != "" || !strings.Contains(unclear.Description, "Deadline: whenever") || len(unclear.Warnings) != 1 {
		t.Fatalf("unclear deadline row = %+v", unclear)
	}
}

func TestDeadlineImportAndOwnRoundTrip(t *testing.T) {
	h := newHarness(t)
	h.fixedNow(time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC))
	data := "title,deadline\nReport,2026-11-06\nPlain,\n"
	plan, err := h.svc.Preview(context.Background(), h.uid, []byte(data), Options{TimeZone: "UTC"})
	if err != nil {
		t.Fatal(err)
	}
	if plan.Totals.Deadlines != 1 {
		t.Fatalf("totals = %+v", plan.Totals)
	}
	if b, _ := json.Marshal(plan); !strings.Contains(string(b), `"deadlines":1`) {
		t.Fatalf("preview JSON lacks deadlines: %s", b)
	}
	if job := h.run(data, Options{TimeZone: "UTC"}); job.Status != StatusDone {
		t.Fatalf("job = %+v", job)
	}
	var withDeadline string
	for _, task := range h.list("task", false) {
		if str(task, "title") == "Report" {
			withDeadline = str(task, "deadline")
		} else if !isNull(task["deadline"]) {
			t.Fatalf("plain task got a deadline: %v", task)
		}
	}
	if withDeadline != "2026-11-06" {
		t.Fatalf("deadline = %q", withDeadline)
	}

	// The own export carries the field through the schema path.
	own := `{"format":"opentodo-export","version":2,"projects":[],"labels":[],"tasks":[{"id":"t-own","title":"Own","priority":4,"labels":[],"position":1,"created_at":1,"completed_at":null,"deleted_at":null,"due":null,"deadline":"2026-12-01","project_id":null,"parent_id":null,"description":""}]}`
	if job := h.run(own, Options{}); job.Status != StatusDone {
		t.Fatalf("own job = %+v", job)
	}
	e, err := h.sync.Get(context.Background(), h.uid, "task", "t-own")
	if err != nil || e == nil || str(e, "deadline") != "2026-12-01" {
		t.Fatalf("own export task = %v %v", e, err)
	}
}
