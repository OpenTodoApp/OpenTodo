package importer

import (
	"context"
	"path/filepath"
	"strings"
	"testing"
)

// Standalone notes in an own export (notes-overview D9): recreated through the
// op log with their project, labels and tombstones; pending appends of tasks
// and notes come back as `appends.<id>` ops; undo removes the notes.
func TestOwnExportNotes(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	file := `{"format":"opentodo-export","version":1,
	"labels":[{"id":"l1","name":"ideas","color":"#64748b","position":1,"created_at":1}],
	"projects":[{"id":"p1","name":"Trip","position":1,"created_at":1,"role":"owner"}],
	"tasks":[{"id":"t1","title":"Pack","project_id":"p1","created_at":1,"appends":[{"id":"a1","text":"- socks"},{"id":"a2","text":""}]}],
	"notes":[
		{"id":"n1","title":"Packing list","description":"- passport","notes_doc":"","project_id":"p1","labels":["l1"],"position":5,"created_at":2,"deleted_at":null,"appends":[{"id":"b1","text":"- charger"}]},
		{"id":"n2","title":"Old","description":"gone","project_id":null,"labels":[],"position":6,"created_at":3,"deleted_at":9,"appends":[]}
	]}`
	plan, err := h.svc.Preview(ctx, h.uid, []byte(file), Options{})
	if err != nil {
		t.Fatal(err)
	}
	if plan.Totals.Notes != 1 || plan.Totals.Warnings != 0 {
		t.Fatalf("totals = %+v rows = %+v", plan.Totals, plan.Rows)
	}
	job := h.run(file, Options{})
	if job.Status != StatusDone {
		t.Fatalf("job = %+v", job)
	}
	n1, _ := h.sync.Get(ctx, h.uid, "note", "n1")
	if str(n1, "title") != "Packing list" || str(n1, "description") != "- passport" || str(n1, "project_id") != "p1" ||
		string(n1["labels"]) != `["l1"]` || string(n1["position"]) != "5" || str(n1, "appends.b1") != "- charger" {
		t.Fatalf("n1 = %v", n1)
	}
	n2, _ := h.sync.Get(ctx, h.uid, "note", "n2")
	if n2 == nil || !n2.Deleted() || str(n2, "title") != "Old" {
		t.Fatalf("n2 = %v", n2)
	}
	task, _ := h.sync.Get(ctx, h.uid, "task", "t1")
	if str(task, "appends.a1") != "- socks" {
		t.Fatalf("task = %v", task)
	}
	if _, has := task["appends.a2"]; has {
		t.Fatalf("an empty append was written: %v", task)
	}
	if _, err := h.svc.Undo(ctx, h.uid, job.ID); err != nil {
		t.Fatal(err)
	}
	if n1, _ = h.sync.Get(ctx, h.uid, "note", "n1"); !n1.Deleted() {
		t.Fatalf("undo left the note: %v", n1)
	}
}

// Importers of other apps never create notes (standalone-notes "Notes in the
// export and import").
func TestForeignImportsCreateNoNotes(t *testing.T) {
	for _, f := range []string{"todoist-backup/rich.zip", "ticktick-csv/rich.csv", "things-db/rich.sqlite", "trello-json/rich.json"} {
		p := previewFixture(t, filepath.Join("testdata", f))
		if p.Totals.Create == 0 || p.Totals.Notes != 0 {
			t.Fatalf("%s: totals %+v", f, p.Totals)
		}
		for _, r := range p.Rows {
			if r.Kind == KindNote {
				t.Fatalf("%s: note row %+v", f, r)
			}
		}
		for _, line := range p.Fields {
			if strings.HasPrefix(line, KindNote+" ") {
				t.Fatalf("%s: plans a note: %s", f, line)
			}
		}
	}
}
