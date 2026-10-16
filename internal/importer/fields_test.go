package importer

import (
	"context"
	"encoding/json"
	"testing"
)

// Custom fields (OpenSpec change custom-fields): an own export restores the
// definitions with their ids and deletion state and every task's values.
const fieldsOwnExport = `{
  "format": "opentodo-export", "version": 1,
  "projects": [{"id": "p1", "name": "Kitchen", "color": "#ef4444", "position": 1, "archived": false, "parent_id": null, "created_at": 1, "deleted_at": null}],
  "fields": [
    {"id": "f-cost", "name": "Cost", "project_id": "p1", "type": "number", "options": "", "position": 1, "created_at": 2, "deleted_at": null},
    {"id": "f-old", "name": "Client", "project_id": "p1", "type": "choice", "options": "Acme\nGlobex", "position": 2, "created_at": 2, "deleted_at": 5}
  ],
  "tasks": [
    {"id": "t1", "title": "Tiles", "project_id": "p1", "priority": 4, "labels": [], "position": 1, "created_at": 3, "completed_at": null, "deleted_at": null,
     "fields": {"f-cost": 120, "f-old": "Acme", "f-gone": null}},
    {"id": "t2", "title": "Paint", "project_id": "p1", "priority": 4, "labels": [], "position": 2, "created_at": 3, "completed_at": null, "deleted_at": null,
     "fields": {}}
  ]
}`

func TestOwnExportRoundTripKeepsFields(t *testing.T) {
	h := newHarness(t)
	p := parse(t, []byte(fieldsOwnExport), Options{})
	var kinds []string
	for _, r := range p.Rows {
		kinds = append(kinds, r.Kind)
	}
	if len(kinds) != 5 || kinds[1] != KindField || kinds[2] != KindField || kinds[3] != KindTask {
		t.Fatalf("kinds = %v", kinds)
	}
	plan, err := h.svc.Preview(context.Background(), h.uid, []byte(fieldsOwnExport), Options{})
	if err != nil {
		t.Fatal(err)
	}
	// The preview counts the live definitions as fields; no row warns about
	// the unfolded values.
	if plan.Totals.Fields != 1 || plan.Totals.Create != 5 || plan.Totals.Warnings != 0 {
		t.Fatalf("totals = %+v rows = %+v", plan.Totals, plan.Rows)
	}
	job := h.run(fieldsOwnExport, Options{})
	if job.Status != StatusDone {
		t.Fatalf("job = %+v", job)
	}
	get := func(entity, id string) map[string]json.RawMessage {
		e, err := h.sync.Get(context.Background(), h.uid, entity, id)
		if err != nil || e == nil {
			t.Fatalf("%s %s: %v %v", entity, id, e, err)
		}
		return e
	}
	if f := get("field", "f-cost"); str(f, "name") != "Cost" || str(f, "type") != "number" || !isNull(f["deleted_at"]) {
		t.Fatalf("cost = %v", f)
	}
	if f := get("field", "f-old"); isNull(f["deleted_at"]) || str(f, "options") != "Acme\nGlobex" {
		t.Fatalf("deleted definition = %v", f)
	}
	t1 := get("task", "t1")
	if string(t1["fields.f-cost"]) != "120" || string(t1["fields.f-old"]) != `"Acme"` || string(t1["fields.f-gone"]) != "null" {
		t.Fatalf("t1 = %v", t1)
	}
	if _, has := t1["fields"]; has {
		t.Fatalf("folded object stored: %v", t1)
	}
	// Undo removes the definitions with the rest.
	if _, err := h.svc.Undo(context.Background(), h.uid, job.ID); err != nil {
		t.Fatal(err)
	}
	if f := get("field", "f-cost"); isNull(f["deleted_at"]) {
		t.Fatalf("undo kept field %v", f)
	}
}
