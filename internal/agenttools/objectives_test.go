package agenttools

import (
	"encoding/json"
	"strings"
	"testing"
)

// plan-objectives 2.3 (mcp-server "Objectives in reads", e2ee "Encrypted
// objectives"): list_objectives reads the current quarter and week by default,
// a period on request, refuses a month, excludes deleted ones, marks titles as
// untrusted, and degrades encrypted titles to null unless a device answers.
func TestListObjectives(t *testing.T) {
	f := newFixture(t) // 2026-10-12 10:00 UTC: Q4 2026, week 42
	f.put("u1", "objective", "q", map[string]any{"title": "Ship 1.0", "period": "2026-Q4", "position": 1, "done_at": 0})
	f.put("u1", "objective", "w", map[string]any{"title": "Draft the talk", "period": "2026-W42", "position": 1, "done_at": 1760263200000})
	f.put("u1", "objective", "n", map[string]any{"title": "Next week", "period": "2026-W43", "position": 1, "done_at": 0})
	f.put("u1", "objective", "x", map[string]any{"title": "Dropped", "period": "2026-W42", "position": 2, "done_at": 0, "deleted_at": 5})
	f.put("u2", "objective", "o", map[string]any{"title": "Not mine", "period": "2026-Q4", "position": 1, "done_at": 0})

	read := Caller{UserID: "u1", Scope: "read"}
	out := f.mustCall(read, "list_objectives", map[string]any{"timezone": "Europe/Rome"})
	list := out["objectives"].([]objectiveOut)
	if len(list) != 2 || list[0].ID != "q" || list[1].ID != "w" || !list[1].Done || list[1].DoneAt == nil || list[0].Done {
		raw, _ := json.Marshal(out)
		t.Fatalf("default = %s", raw)
	}
	raw, _ := json.Marshal(out)
	if !strings.Contains(string(raw), `"untrusted_text":{"title":"Ship 1.0"}`) {
		t.Fatalf("title not in untrusted_text: %s", raw)
	}
	out = f.mustCall(read, "list_objectives", map[string]any{"period": "2026-W43"})
	if list := out["objectives"].([]objectiveOut); len(list) != 1 || list[0].ID != "n" {
		t.Fatalf("W43 = %v", list)
	}
	for _, bad := range []string{"Q4", "2026-11", "next week"} {
		if _, err := f.call(read, "list_objectives", map[string]any{"period": bad}); !isArgErr(err) || !strings.Contains(err.Error(), "period") {
			t.Fatalf("period %q: %v", bad, err)
		}
	}

	// Encrypted, no device: title null, encrypted true, period and done kept.
	f.put("u1", "objective", "q", map[string]any{"title": fakeSeal("objective", "q", "title", "Finish the grant")})
	enc := Caller{UserID: "u1", Scope: "read", Encrypted: true}
	out = f.mustCall(enc, "list_objectives", map[string]any{})
	raw, _ = json.Marshal(out)
	if !strings.Contains(string(raw), `"untrusted_text":{"title":null},"period":"2026-Q4"`) || !strings.Contains(string(raw), `"encrypted":true`) || strings.Contains(string(raw), "enc:v1") {
		t.Fatalf("encrypted = %s", raw)
	}
	// With an opted-in device the title is decrypted.
	enc.Relay = &fakeRelay{}
	out = f.mustCall(enc, "list_objectives", map[string]any{})
	raw, _ = json.Marshal(out)
	if !strings.Contains(string(raw), "Finish the grant") {
		t.Fatalf("relayed = %s", raw)
	}

	// The resource is the same read.
	res, err := f.reg.ObjectivesResource(t.Context(), "u1")
	if err != nil || len(res["objectives"].([]objectiveOut)) != 2 {
		t.Fatalf("resource = %v, %v", res, err)
	}
}
