package importer

import (
	"context"
	"testing"
)

// plan-objectives 2.2: an own export's objectives come back through ops with
// their ids, periods, done times and tombstones; an invalid one is refused.
func TestObjectivesRoundTrip(t *testing.T) {
	h := newHarness(t)
	file := `{"format":"opentodo-export","version":1,"userId":"exporter",
		"objectives":[{"id":"ob1","title":"Ship 1.0","period":"2026-Q4","position":1,"done_at":0,"created_at":1,"deleted_at":null},
			{"id":"ob2","title":"Draft the talk","period":"2026-W44","position":2,"done_at":1761638400000,"created_at":1,"deleted_at":null},
			{"id":"ob3","title":"Dropped","period":"2026-W44","position":3,"done_at":0,"created_at":1,"deleted_at":1761638400000},
			{"id":"ob4","title":"Monthly","period":"2026-11","position":4,"done_at":0,"created_at":1,"deleted_at":null}]}`
	job := h.run(file, Options{})
	if job.Status != StatusDone {
		t.Fatalf("job = %+v", job)
	}
	ctx := context.Background()
	ob1, err := h.sync.Get(ctx, h.uid, "objective", "ob1")
	if err != nil || ob1 == nil || str(ob1, "title") != "Ship 1.0" || str(ob1, "period") != "2026-Q4" {
		t.Fatalf("ob1 = %v, %v", ob1, err)
	}
	ob2, _ := h.sync.Get(ctx, h.uid, "objective", "ob2")
	if ob2 == nil || string(ob2["done_at"]) != "1761638400000" {
		t.Fatalf("ob2 = %v", ob2)
	}
	if ob3, _ := h.sync.Get(ctx, h.uid, "objective", "ob3"); ob3 == nil || !ob3.Deleted() {
		t.Fatalf("ob3 tombstone = %v", ob3)
	}
	if ob4, _ := h.sync.Get(ctx, h.uid, "objective", "ob4"); ob4 != nil {
		t.Fatalf("monthly objective imported: %v", ob4)
	}
}
