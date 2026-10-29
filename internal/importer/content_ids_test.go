package importer

import (
	"context"
	"testing"
)

// data-import "Rows without ids get content ids" (issue #520): a custom JSON
// file without ids is not taken for an earlier one, and the same file imported
// again is still recognised.
func TestRowsWithoutIDsAreNotTakenForAnEarlierFile(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	first := `[{"title":"Buy milk"},{"title":"Call the bank"}]`
	second := `[{"title":"Water the plants"},{"title":"Book the dentist"},{"title":"Water the plants"}]`
	if job := h.run(first, Options{}); job.Status != StatusDone {
		t.Fatalf("first import: %+v", job)
	}
	plan, err := h.svc.Preview(ctx, h.uid, []byte(second), Options{})
	if err != nil {
		t.Fatal(err)
	}
	creates := 0
	for _, r := range plan.Rows {
		if r.Outcome == OutcomeCreate {
			creates++
		}
		if r.Reason == ReasonAlreadyImported {
			t.Fatalf("a row of a different file was taken for the first import: %+v", r)
		}
	}
	if creates != 3 {
		t.Fatalf("creates = %d, want 3 (two equal rows stay two tasks); rows = %+v", creates, plan.Rows)
	}
	again, err := h.svc.Preview(ctx, h.uid, []byte(first), Options{})
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range again.Rows {
		if r.Outcome != OutcomeSkip || r.Reason != ReasonAlreadyImported {
			t.Fatalf("the same file again: %+v", r)
		}
	}
}

func TestListsWithoutIDsKeepTheirOwnProjects(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	first := `{"lists":[{"title":"Work","tasks":[{"title":"Report"}]}]}`
	second := `{"lists":[{"title":"Personal","tasks":[{"title":"Groceries"}]}]}`
	if job := h.run(first, Options{}); job.Status != StatusDone {
		t.Fatalf("first import: %+v", job)
	}
	plan, err := h.svc.Preview(ctx, h.uid, []byte(second), Options{})
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range plan.Rows {
		if r.Outcome != OutcomeCreate {
			t.Fatalf("second file's row %+v should be created", r)
		}
	}
}
