package importer

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

// Task dependencies in imports (OpenSpec change task-dependencies, task 7.2).

func TestOwnExportCarriesBlockedBy(t *testing.T) {
	h := newHarness(t)
	own := `{"format":"opentodo-export","version":2,"projects":[],"labels":[],"tasks":[
{"id":"t-a","title":"Confirm dates","priority":4,"labels":[],"position":1,"created_at":1,"completed_at":null,"deleted_at":null,"due":null,"project_id":null,"parent_id":null,"description":"","blocked_by":[]},
{"id":"t-b","title":"Book flights","priority":4,"labels":[],"position":2,"created_at":1,"completed_at":null,"deleted_at":null,"due":null,"project_id":null,"parent_id":null,"description":"","blocked_by":["t-a"]}]}`
	if job := h.run(own, Options{TimeZone: "UTC"}); job.Status != StatusDone || job.Totals.Refused != 0 {
		t.Fatalf("job = %+v", job)
	}
	for _, e := range h.list("task", false) {
		if str(e, "id") == "t-b" && string(e["blocked_by"]) != `["t-a"]` {
			t.Fatalf("t-b blocked_by = %s", e["blocked_by"])
		}
	}
}

func TestCSVBlockedByRelations(t *testing.T) {
	h := newHarness(t)
	data := "id,title,blocked_by\n" +
		"1,Confirm dates,\n" +
		"2,Book flights,1\n" +
		"3,Pack,2;missing\n" +
		"4,Loop back,3\n" +
		"5,Close the loop,4\n"
	plan, err := h.svc.Preview(context.Background(), h.uid, []byte(data), Options{TimeZone: "UTC"})
	if err != nil {
		t.Fatal(err)
	}
	warned := strings.Join(plan.Rows[2].Warnings, " ")
	if !strings.Contains(warned, `"missing"`) {
		t.Fatalf("row 3 warnings = %v", plan.Rows[2].Warnings)
	}
	job := h.run(data, Options{TimeZone: "UTC"})
	if job.Status != StatusDone || job.Totals.Refused != 0 {
		t.Fatalf("job = %+v", job)
	}
	byTitle := map[string]map[string]json.RawMessage{}
	for _, e := range h.list("task", false) {
		byTitle[str(e, "title")] = e
	}
	id := func(title string) string { return str(byTitle[title], "id") }
	if got := string(byTitle["Book flights"]["blocked_by"]); got != `["`+id("Confirm dates")+`"]` {
		t.Fatalf("Book flights = %s", got)
	}
	if got := string(byTitle["Pack"]["blocked_by"]); got != `["`+id("Book flights")+`"]` {
		t.Fatalf("Pack = %s", got)
	}
	// Undo tombstones every created task, so nothing is left waiting.
	if _, err := h.svc.Undo(context.Background(), h.uid, job.ID); err != nil {
		t.Fatal(err)
	}
	h.svc.Wait()
	if live := h.list("task", false); len(live) != 0 {
		t.Fatalf("after undo = %d tasks", len(live))
	}
}

func TestCSVBlockedByCycleInFile(t *testing.T) {
	h := newHarness(t)
	data := "id,title,blocked_by\n1,A,2\n2,B,1\n"
	plan, err := h.svc.Preview(context.Background(), h.uid, []byte(data), Options{TimeZone: "UTC"})
	if err != nil {
		t.Fatal(err)
	}
	if w := strings.Join(plan.Rows[1].Warnings, " "); !strings.Contains(w, "wait for each other") {
		t.Fatalf("row 2 warnings = %v", plan.Rows[1].Warnings)
	}
	if job := h.run(data, Options{TimeZone: "UTC"}); job.Status != StatusDone || job.Totals.Refused != 0 {
		t.Fatalf("job = %+v", job)
	}
}

func TestLinearBlockedBy(t *testing.T) {
	h := newHarness(t)
	header := "ID,Team,Title,Description,Status,Estimate,Priority,Project ID,Project,Creator,Assignee,Labels,Cycle Number,Cycle Name,Cycle Start,Cycle End,Created,Updated,Started,Triaged,Completed,Canceled,Archived,Due Date,Parent issue,Initiatives,Project Milestone ID,Project Milestone,SLA Status,UUID,Time in status (minutes),Related to,Blocked by,Duplicate of\n"
	row := func(id, title, blocked string) string {
		return id + ",Team 1," + title + ",,Todo,,No priority,p1,Launch,owner@example.test,,,,,,,2025-12-29T20:30:04.405Z,2025-12-29T20:30:04.405Z,,,,,,,,,,,,u-" + id + ",1,,\"" + blocked + "\",\n"
	}
	data := header + row("ENG-1", "Design", "") + row("ENG-2", "Build", "ENG-1, ENG-9")
	job := h.run(data, Options{TimeZone: "UTC", Format: "linear-csv"})
	if job.Status != StatusDone {
		t.Fatalf("job = %+v", job)
	}
	var design, build map[string]json.RawMessage
	for _, e := range h.list("task", false) {
		switch str(e, "title") {
		case "Design":
			design = e
		case "Build":
			build = e
		}
	}
	if build == nil || string(build["blocked_by"]) != `["`+str(design, "id")+`"]` {
		t.Fatalf("Build blocked_by = %s", build["blocked_by"])
	}
}
