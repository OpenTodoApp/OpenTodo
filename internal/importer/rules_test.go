package importer

import (
	"context"
	"testing"
)

// automation-rules "Export and re-import": an own export's rules come back
// with their ids, triggers, conditions and actions.
func TestRulesRoundTrip(t *testing.T) {
	h := newHarness(t)
	file := `{"format":"opentodo-export","version":1,"userId":"exporter",
		"labels":[{"id":"lw","name":"waiting","color":"#000000","position":1,"created_at":1,"deleted_at":null}],
		"rules":[{"id":"r1","name":"Waiting","enabled":true,"trigger":{"kind":"label.added","label_id":"lw"},"condition":null,
			"actions":{"priority":3,"webhook":{"webhook_id":"gone"}},"position":1,"created_at":1,"deleted_at":null}]}`
	if job := h.run(file, Options{}); job.Status != StatusDone {
		t.Fatalf("job = %+v", job)
	}
	r, err := h.sync.Get(context.Background(), h.uid, "rule", "r1")
	if err != nil || r == nil {
		t.Fatalf("rule = %v, %v", r, err)
	}
	if string(r["trigger"]) != `{"kind":"label.added","label_id":"lw"}` || string(r["enabled"]) != "true" {
		t.Fatalf("rule = %v", r)
	}
}
