package importer

import (
	"context"
	"testing"
)

// assistant-memory 1.1: an own export's memory items come back through ops with
// their ids, order and tombstones; an invalid one is refused.
func TestMemoryRoundTrip(t *testing.T) {
	h := newHarness(t)
	file := `{"format":"opentodo-export","version":1,"userId":"exporter",
		"memory":[{"id":"me1","text":"Does not work on Fridays","position":1,"created_at":1,"deleted_at":null},
			{"id":"me2","text":"Anna is my manager","position":2,"created_at":1,"deleted_at":1761638400000},
			{"id":"me3","text":"two\nlines","position":3,"created_at":1,"deleted_at":null}]}`
	job := h.run(file, Options{})
	if job.Status != StatusDone {
		t.Fatalf("job = %+v", job)
	}
	ctx := context.Background()
	me1, err := h.sync.Get(ctx, h.uid, "memory", "me1")
	if err != nil || me1 == nil || str(me1, "text") != "Does not work on Fridays" {
		t.Fatalf("me1 = %v, %v", me1, err)
	}
	if me2, _ := h.sync.Get(ctx, h.uid, "memory", "me2"); me2 == nil || !me2.Deleted() {
		t.Fatalf("me2 tombstone = %v", me2)
	}
	if me3, _ := h.sync.Get(ctx, h.uid, "memory", "me3"); me3 != nil {
		t.Fatalf("invalid memory imported: %v", me3)
	}
}
