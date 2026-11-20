package httpapi

import (
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/ids"
)

// sync-invalid-op-alone D1: a client that sends the feature invalid_ops gets an op
// the server cannot accept refused alone, and the rest of its batch is applied;
// other clients keep the whole-batch 400.
func TestSyncRefusesAnInvalidOpAlone(t *testing.T) {
	e := ownerEnv(t)
	now := time.Now().UnixMilli()
	good := map[string]any{"id": ids.New(), "entity": "task", "entityId": "t1", "field": "title", "value": "Kept", "ts": now, "device": "laptop"}
	unknown := map[string]any{"id": ids.New(), "entity": "task", "entityId": "t1", "field": "no_such_field", "value": 1, "ts": now, "device": "laptop"}
	reserved := map[string]any{"id": ids.New(), "entity": "task", "entityId": "t1", "field": "priority", "value": 2, "ts": now, "device": "server"}
	batch := []any{good, unknown, reserved}

	resp, out := e.do("POST", "/api/v1/sync", map[string]any{"device": "laptop", "cursor": 0, "ops": batch})
	if resp.StatusCode != http.StatusBadRequest || errCode(out) != "invalid_op" {
		t.Fatalf("without the feature: %d %v", resp.StatusCode, out)
	}
	if n := countOps(t, e); n != 0 {
		t.Fatalf("ops applied without the feature: %d", n)
	}

	resp, out = e.do("POST", "/api/v1/sync", map[string]any{"device": "laptop", "cursor": 0, "ops": batch, "features": []string{"invalid_ops"}})
	e.mustStatus(resp, http.StatusOK, out)
	rejected, _ := out["rejected"].([]any)
	got := map[string]string{}
	for _, r := range rejected {
		m := r.(map[string]any)
		got[m["id"].(string)] = m["reason"].(string)
	}
	// invalid-op-ends D1: an unknown field may be accepted by a later server; anything
	// else is a verdict.
	if len(got) != 2 || got[unknown["id"].(string)] != "unknown_field" || got[reserved["id"].(string)] != "invalid" {
		t.Fatalf("rejected = %v, want the unknown field as unknown_field and the reserved device as invalid", rejected)
	}
	if n := countOps(t, e); n != 1 {
		t.Fatalf("ops applied with the feature: %d, want the good one", n)
	}
}

// invalid-op-ends D1: a value the server will never accept is refused as invalid,
// and the answer carries the field's server value, as for any refused change.
func TestSyncInvalidValueComesBackWithTheServersValue(t *testing.T) {
	e := ownerEnv(t)
	now := time.Now().UnixMilli()
	create := map[string]any{"id": ids.New(), "entity": "task", "entityId": "t1", "field": "due", "value": map[string]string{"date": "2026-05-01"}, "ts": now, "device": "laptop"}
	resp, out := e.do("POST", "/api/v1/sync", map[string]any{"device": "laptop", "cursor": 0, "ops": []any{create}, "features": []string{"invalid_ops"}})
	e.mustStatus(resp, http.StatusOK, out)
	cursor := out["cursor"]
	bad := map[string]any{"id": ids.New(), "entity": "task", "entityId": "t1", "field": "due", "value": map[string]string{"date": "2026-02-31"}, "ts": now + 1, "device": "laptop"}
	resp, out = e.do("POST", "/api/v1/sync", map[string]any{"device": "laptop", "cursor": cursor, "ops": []any{bad}, "features": []string{"invalid_ops"}})
	e.mustStatus(resp, http.StatusOK, out)
	rejected, _ := out["rejected"].([]any)
	if len(rejected) != 1 || rejected[0].(map[string]any)["reason"] != "invalid" {
		t.Fatalf("rejected = %v, want the impossible date as invalid", rejected)
	}
	restored := false
	for _, o := range out["ops"].([]any) {
		m := o.(map[string]any)
		if m["entityId"] == "t1" && m["field"] == "due" {
			restored = fmt.Sprint(m["value"]) == "map[date:2026-05-01]"
		}
	}
	if !restored {
		t.Fatalf("the answer should carry the stored due back: %v", out["ops"])
	}
}
