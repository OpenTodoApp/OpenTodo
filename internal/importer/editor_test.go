package importer

import (
	"context"
	"testing"
)

// An own export carries note_mentions on tasks and the folded reactions on its
// comments (OpenSpec editor-everywhere, task 1.6): note_mentions is a task field
// and comes back through the import (filtered to members at receipt, so a
// personal task keeps none); comments, reactions with them, are not imported.
func TestOwnExportNoteMentions(t *testing.T) {
	h := newHarness(t)
	const file = `{
  "format": "opentodo-export", "version": 1, "exportedAt": "2026-10-10T10:00:00Z",
  "tasks": [{"id": "t1", "title": "Plan", "description": "Ask @Bob", "priority": 4, "position": 1, "created_at": 5, "labels": [], "note_mentions": ["u-bob"]}],
  "comments": [{"id": "c1", "task_id": "t1", "body": "ok", "author_id": "u-bob", "reactions": {"thumbs_up": ["u-bob"]}, "my_reactions": []}]
}`
	plan, err := h.svc.Preview(context.Background(), h.uid, []byte(file), Options{})
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range plan.Rows {
		if r.SourceID == "t1" && len(r.Warnings) != 0 {
			t.Fatalf("note_mentions warned: %v", r.Warnings)
		}
	}
	if len(plan.Notes) != 1 {
		t.Fatalf("notes = %v", plan.Notes)
	}
	job := h.run(file, Options{})
	if job.Status != StatusDone || job.Totals.Written != 1 {
		t.Fatalf("job = %+v", job)
	}
	task, err := h.sync.Get(context.Background(), h.uid, "task", "t1")
	if err != nil || task == nil {
		t.Fatalf("task: %v %v", task, err)
	}
	if got := string(task["note_mentions"]); got != "[]" {
		t.Fatalf("note_mentions on a personal task = %s", got)
	}
}
