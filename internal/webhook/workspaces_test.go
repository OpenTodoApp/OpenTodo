package webhook

import (
	"encoding/json"
	"testing"

	opsync "github.com/pixari/opentodo/internal/sync"
)

// Project and task payloads carry workspace_id, null for the default
// workspace (OpenSpec change workspaces, task 4.2), without touching the
// caller's record.
func TestPayloadCarriesWorkspace(t *testing.T) {
	for _, c := range []struct {
		kind string
		e    opsync.Entity
		want string
	}{
		{"project", opsync.Entity{"id": json.RawMessage(`"p1"`), "name": json.RawMessage(`"Site"`)}, "null"},
		{"project", opsync.Entity{"id": json.RawMessage(`"p1"`), "workspace_id": json.RawMessage(`"w-work"`)}, `"w-work"`},
		{"task", opsync.Entity{"id": json.RawMessage(`"t1"`), "title": json.RawMessage(`"x"`)}, "null"},
	} {
		body, err := BuildPayload("d1", "w1", c.kind+".updated", 1, "dev", c.kind, c.e, nil)
		if err != nil {
			t.Fatal(err)
		}
		var p struct {
			Data map[string]map[string]json.RawMessage `json:"data"`
		}
		if err := json.Unmarshal(body, &p); err != nil {
			t.Fatal(err)
		}
		if got := string(p.Data[c.kind]["workspace_id"]); got != c.want {
			t.Fatalf("%s workspace_id = %s, want %s", c.kind, got, c.want)
		}
		if c.want == "null" {
			if _, mutated := c.e["workspace_id"]; mutated {
				t.Fatal("the caller's record was changed")
			}
		}
	}
}
