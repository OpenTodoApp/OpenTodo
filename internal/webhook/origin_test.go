package webhook

import (
	"encoding/json"
	"testing"

	opsync "github.com/pixari/opentodo/internal/sync"
)

// A task created from a shared issue page (OpenSpec change task-origin,
// "Captured task delivered") is delivered with its origin in the entity and in
// changes, so a receiver can link it back without a second request.
func TestCreatedTaskCarriesOrigin(t *testing.T) {
	origin := `{"kind":"issue","provider":"github","id":"o/r#7","url":"https://github.com/o/r/issues/7"}`
	c := opsync.Change{Entity: "task", EntityID: "t1", Fields: map[string]opsync.FieldChange{
		"created_at": fc("", "1"), "title": fc("", `"Fix the login timeout"`), "origin": fc("", origin)}}
	if ev := EventFor(withoutDocFields(c)); ev != "task.created" {
		t.Fatalf("event = %s", ev)
	}
	entity := opsync.Entity{"id": json.RawMessage(`"t1"`), "title": json.RawMessage(`"Fix the login timeout"`), "origin": json.RawMessage(origin)}
	body, err := BuildPayload("d1", "w1", "task.created", 1, "dev-a", "task", entity, c.Fields)
	if err != nil {
		t.Fatal(err)
	}
	var p struct {
		Data    map[string]map[string]json.RawMessage `json:"data"`
		Changes map[string]struct {
			From json.RawMessage `json:"from"`
			To   json.RawMessage `json:"to"`
		} `json:"changes"`
	}
	if err := json.Unmarshal(body, &p); err != nil {
		t.Fatal(err)
	}
	if !opsync.SameJSON(p.Data["task"]["origin"], json.RawMessage(origin)) {
		t.Fatalf("entity origin = %s", p.Data["task"]["origin"])
	}
	ch, ok := p.Changes["origin"]
	if !ok || string(ch.From) != "null" || !opsync.SameJSON(ch.To, json.RawMessage(origin)) {
		t.Fatalf("changes.origin = %+v", ch)
	}

	// A task without one carries origin: null.
	body, _ = BuildPayload("d2", "w1", "task.updated", 1, "dev-a", "task", opsync.Entity{"id": json.RawMessage(`"t2"`)}, nil)
	_ = json.Unmarshal(body, &p)
	if raw, has := p.Data["task"]["origin"]; !has || string(raw) != "null" {
		t.Fatalf("unset origin = %s (present %v)", raw, has)
	}
}
