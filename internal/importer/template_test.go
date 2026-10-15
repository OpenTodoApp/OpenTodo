package importer

import (
	"context"
	"os"
	"strings"
	"testing"
)

// A template file written by the web app (web/src/lib/templates.ts, fixture kept
// in step by templates.test.ts) previews as an own export with the template hint
// (OpenSpec change project-templates, tasks 2.2 and 3.1).
func TestTemplateFilePreviewAndImportOnce(t *testing.T) {
	data, err := os.ReadFile("testdata/template/trip.json")
	if err != nil {
		t.Fatal(err)
	}
	h := newHarness(t)
	plan, err := h.svc.Preview(context.Background(), h.uid, data, Options{TimeZone: "UTC"})
	if err != nil {
		t.Fatal(err)
	}
	if plan.Format != "opentodo" || plan.Template == nil || plan.Template.Day != "2026-10-14" {
		t.Fatalf("plan = %s %+v", plan.Format, plan.Template)
	}
	if !strings.Contains(strings.Join(plan.Notes, " "), "This file is a template") {
		t.Fatalf("notes = %v", plan.Notes)
	}
	if plan.Totals.Error != 0 || plan.Totals.Create != 5 || len(plan.Errors()) != 0 {
		t.Fatalf("totals = %+v errors %v", plan.Totals, plan.Errors())
	}
	if job := h.run(string(data), Options{TimeZone: "UTC"}); job.Status != StatusDone {
		t.Fatalf("job = %+v", job)
	}
	// A second import skips every row as existing: import keeps the file's ids.
	again, err := h.svc.Preview(context.Background(), h.uid, data, Options{TimeZone: "UTC"})
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range again.Rows {
		if r.Outcome != OutcomeSkip || r.Reason != ReasonExists {
			t.Fatalf("second preview row = %+v", r)
		}
	}
}
