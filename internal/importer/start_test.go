package importer

import (
	"context"
	"strings"
	"testing"
	"time"
)

// OpenSpec change someday-and-evening, design D9.

func TestCSVStartEveningColumns(t *testing.T) {
	p, err := parseWith(t, []byte("title,start,evening,due_date\nSail,someday,,\nPassport,2026-11-03,true,\nTrip,someday,,2026-11-03\nBad,later,,\n"), nil)
	if err != nil {
		t.Fatal(err)
	}
	rec := strings.Join(p.Recognised, ",")
	if !strings.Contains(rec, "start") || !strings.Contains(rec, "evening") {
		t.Fatalf("recognised = %v", p.Recognised)
	}
	if r := p.Rows[0]; r.Start != "someday" || r.Evening {
		t.Fatalf("parked row = %+v", r)
	}
	if r := p.Rows[1]; r.Start != "2026-11-03" || !r.Evening {
		t.Fatalf("deferred evening row = %+v", r)
	}
	if r := p.Rows[2]; r.Start != "" || r.Due == nil || r.Due.Date != "2026-11-03" || len(r.Warnings) != 1 || !strings.Contains(r.Warnings[0], "Someday dropped") {
		t.Fatalf("parked and dated row = %+v", r)
	}
	if r := p.Rows[3]; !strings.Contains(r.Err, `"later"`) {
		t.Fatalf("bad start row = %+v", r)
	}
}

func TestStartEveningImportAndOwnRoundTrip(t *testing.T) {
	h := newHarness(t)
	h.fixedNow(time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC))
	if job := h.run("title,start,evening\nSail,someday,\nRead,,yes\n", Options{TimeZone: "UTC"}); job.Status != StatusDone {
		t.Fatalf("job = %+v", job)
	}
	got := map[string][2]string{}
	for _, task := range h.list("task", false) {
		got[str(task, "title")] = [2]string{str(task, "start"), string(task["evening"])}
	}
	if got["Sail"][0] != "someday" || got["Read"][1] != "true" {
		t.Fatalf("tasks = %v", got)
	}
	own := `{"format":"opentodo-export","version":2,"projects":[],"labels":[],"tasks":[{"id":"t-own","title":"Own","priority":4,"labels":[],"position":1,"created_at":1,"completed_at":null,"deleted_at":null,"due":null,"start":"2026-12-01","evening":true,"project_id":null,"parent_id":null,"description":""}]}`
	if job := h.run(own, Options{}); job.Status != StatusDone {
		t.Fatalf("own job = %+v", job)
	}
	e, err := h.sync.Get(context.Background(), h.uid, "task", "t-own")
	if err != nil || e == nil || str(e, "start") != "2026-12-01" || string(e["evening"]) != "true" {
		t.Fatalf("own export task = %v %v", e, err)
	}
}
