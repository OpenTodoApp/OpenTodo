package webhook

import (
	"encoding/json"
	"testing"

	opsync "github.com/pixari/opentodo/internal/sync"
)

// A custom field value change (custom-fields) is a task.updated event whose
// change names `fields.<id>`, and the delivered task carries its values as one
// `fields` object like the REST API.
func TestFieldValueChangeDelivery(t *testing.T) {
	c := opsync.Change{Entity: "task", EntityID: "t1", Fields: map[string]opsync.FieldChange{"fields.f1": fc(`120`, `150`)}}
	if ev := EventFor(withoutDocFields(c)); ev != "task.updated" {
		t.Fatalf("event = %s", ev)
	}
	entity := opsync.Entity{"id": json.RawMessage(`"t1"`), "title": json.RawMessage(`"Tiles"`), "fields.f1": json.RawMessage(`150`)}
	body, err := BuildPayload("d1", "w1", "task.updated", 1, "server", "task", entity, c.Fields)
	if err != nil {
		t.Fatal(err)
	}
	var p struct {
		Data    map[string]map[string]any `json:"data"`
		Changes map[string]any            `json:"changes"`
	}
	if err := json.Unmarshal(body, &p); err != nil {
		t.Fatal(err)
	}
	task := p.Data["task"]
	if _, has := task["fields.f1"]; has {
		t.Fatalf("raw value key delivered: %v", task)
	}
	if f, _ := task["fields"].(map[string]any); f["f1"] != float64(150) {
		t.Fatalf("fields = %v", task["fields"])
	}
	if _, has := p.Changes["fields.f1"]; !has {
		t.Fatalf("changes = %v", p.Changes)
	}
}
