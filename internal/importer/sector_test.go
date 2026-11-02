package importer

import (
	"context"
	"testing"
)

// The own export carries the time sector (OpenSpec change time-sectors, D9),
// and its null for none imports as none.
func TestOwnExportCarriesSector(t *testing.T) {
	h := newHarness(t)
	own := `{"format":"opentodo-export","version":2,"projects":[],"labels":[],"tasks":[` +
		`{"id":"t-week","title":"Book the venue","priority":4,"labels":[],"position":1,"created_at":1,"completed_at":null,"deleted_at":null,"due":null,"sector":"2026-W45","project_id":null,"parent_id":null,"description":""},` +
		`{"id":"t-none","title":"Plain","priority":4,"labels":[],"position":2,"created_at":1,"completed_at":null,"deleted_at":null,"due":null,"sector":null,"project_id":null,"parent_id":null,"description":""}]}`
	if job := h.run(own, Options{}); job.Status != StatusDone {
		t.Fatalf("own job = %+v", job)
	}
	for id, want := range map[string]string{"t-week": "2026-W45", "t-none": ""} {
		e, err := h.sync.Get(context.Background(), h.uid, "task", id)
		if err != nil || e == nil || str(e, "sector") != want {
			t.Fatalf("%s = %v %v", id, e, err)
		}
	}
}
