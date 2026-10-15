package importer

import (
	"context"
	"testing"
)

// Custom fields in imports (OpenSpec change custom-fields, task 3.3).

func TestOwnExportCarriesFields(t *testing.T) {
	h := newHarness(t)
	own := `{"format":"opentodo-export","version":1,"labels":[],
"projects":[{"id":"p1","name":"Kitchen","position":1,"created_at":1,"deleted_at":null}],
"fields":[{"id":"f-cost","name":"Cost","project_id":"p1","type":"number","options":"","position":1,"created_at":1,"deleted_at":null},
{"id":"f-old","name":"Old","project_id":"p1","type":"text","options":"","position":2,"created_at":1,"deleted_at":5}],
"tasks":[{"id":"t1","title":"Oven","priority":4,"labels":[],"position":1,"created_at":1,"completed_at":null,"deleted_at":null,"due":null,"project_id":"p1","parent_id":null,"description":"","fields":{"f-cost":120,"f-old":"kept","f-gone":null}}]}`
	job := h.run(own, Options{TimeZone: "UTC"})
	if job.Status != StatusDone || job.Totals.Refused != 0 {
		t.Fatalf("job = %+v", job)
	}
	fields := h.list("field", true)
	if len(fields) != 2 {
		t.Fatalf("fields = %v", fields)
	}
	tasks := h.list("task", false)
	if len(tasks) != 1 || string(tasks[0]["fields.f-cost"]) != "120" || string(tasks[0]["fields.f-old"]) != `"kept"` || string(tasks[0]["fields.f-gone"]) != "null" {
		t.Fatalf("task = %v", tasks)
	}
	if _, has := tasks[0]["fields"]; has {
		t.Fatalf("folded object stored as a field: %v", tasks[0])
	}
	// A second run finds everything unchanged.
	plan, err := h.svc.Preview(context.Background(), h.uid, []byte(own), Options{TimeZone: "UTC", Existing: "overwrite"})
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range plan.Rows {
		if r.Outcome != OutcomeSkip {
			t.Fatalf("re-import row = %+v", r)
		}
	}
	// Undo removes the created definitions with the project.
	if _, err := h.svc.Undo(context.Background(), h.uid, job.ID); err != nil {
		t.Fatal(err)
	}
	h.svc.Wait()
	if live := h.list("field", false); len(live) != 0 {
		t.Fatalf("after undo = %d fields", len(live))
	}
}
