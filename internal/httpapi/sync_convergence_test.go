package httpapi

import (
	"testing"
	"time"
)

// OpenSpec change sync-convergence: the sync route refuses far-future ops for
// devices that announce clock_skew and keeps clamping for the rest.
func TestSyncClockSkewFeature(t *testing.T) {
	e := newEnv(t, true)
	e.register("skew@example.com")
	far := time.Now().Add(time.Hour).UnixMilli()
	send := func(id string, features []string) map[string]any {
		t.Helper()
		body := map[string]any{"device": "devA", "cursor": 0, "ops": []any{map[string]any{
			"id": id, "entity": "task", "entityId": "t-" + id, "field": "title", "value": "fast", "ts": far, "device": "devA"}}}
		if features != nil {
			body["features"] = features
		}
		resp, out := e.do("POST", "/api/v1/sync", body)
		e.mustStatus(resp, 200, out)
		return out
	}
	out := send("new", []string{"clock_skew", "backfill_ack"})
	rej := out["rejected"].([]any)
	if out["applied"].(float64) != 0 || len(rej) != 1 {
		t.Fatalf("announcing client: %v", out)
	}
	r := rej[0].(map[string]any)
	if r["reason"] != "clock_skew" || r["serverTime"].(float64) < float64(time.Now().Add(-time.Minute).UnixMilli()) {
		t.Fatalf("rejection = %v", r)
	}
	out = send("old", nil)
	if out["applied"].(float64) != 1 || len(out["rejected"].([]any)) != 0 {
		t.Fatalf("older client: %v", out)
	}
	// The server's device, in either form, stays reserved.
	for _, d := range []string{"server", "server:abc"} {
		resp, out := e.do("POST", "/api/v1/sync", map[string]any{"device": d, "cursor": 0, "ops": []any{}})
		e.mustStatus(resp, 400, out)
	}
}
