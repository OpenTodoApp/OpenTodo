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

// routines-engine 3.2: a three-step routine travels with its steps, and the
// read-only annotations of the export are not data.
func TestRoutineRoundTrip(t *testing.T) {
	h := newHarness(t)
	steps := `[{"id":"a","kind":"find_tasks","in":{"condition":{"literal":{"labels":{"any":["lw"]}}}}},{"id":"b","kind":"count","in":{"list":{"ref":"a"}}},{"id":"c","kind":"if","in":{"value":{"ref":"b"},"is":{"literal":{">":10}}},"then":[{"id":"d","kind":"notify","in":{"text":{"literal":"Too much waiting"}}}]}]`
	file := `{"format":"opentodo-export","version":1,"userId":"exporter",
		"labels":[{"id":"lw","name":"waiting","color":"#000000","position":1,"created_at":1,"deleted_at":null}],
		"rules":[{"id":"r2","name":"Waiting check","enabled":true,"trigger":{"kind":"manual"},"condition":null,"actions":null,
			"steps":` + steps + `,"paused_reason":null,"warnings":[],"position":1,"created_at":1,"deleted_at":null}]}`
	job := h.run(file, Options{})
	if job.Status != StatusDone {
		t.Fatalf("job = %+v", job)
	}
	r, err := h.sync.Get(context.Background(), h.uid, "rule", "r2")
	if err != nil || r == nil {
		t.Fatalf("rule = %v, %v", r, err)
	}
	if string(r["steps"]) != steps || string(r["actions"]) != "null" {
		t.Fatalf("steps = %s actions = %s", r["steps"], r["actions"])
	}
	if _, has := r["paused_reason"]; has {
		t.Fatal("an annotation was imported")
	}
}
