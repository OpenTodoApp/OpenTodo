package webhook

import (
	"encoding/json"
	"testing"

	opsync "github.com/pixari/opentodo/internal/sync"
)

// Opaque note documents (collaborative-rich-text) never reach a delivery: the
// change and the entity carry the readable description instead, and a change
// that only touched the document is no event at all.
func TestDocFieldsLeftOutOfDeliveries(t *testing.T) {
	c := opsync.Change{Entity: "task", EntityID: "t1", Fields: map[string]opsync.FieldChange{
		"notes_doc": fc(`"ydoc:v1:AAAA"`, `"ydoc:v1:BBBB"`), "description": fc(`"a"`, `"b"`)}}
	got := withoutDocFields(c)
	if _, has := got.Fields["notes_doc"]; has || len(got.Fields) != 1 || len(c.Fields) != 2 {
		t.Fatalf("fields = %v (original %v)", got.Fields, c.Fields)
	}
	only := withoutDocFields(opsync.Change{Entity: "task", Fields: map[string]opsync.FieldChange{"notes_doc": fc(`""`, `"ydoc:v1:AAAA"`)}})
	if len(only.Fields) != 0 {
		t.Fatalf("doc-only change kept fields %v", only.Fields)
	}
	entity := opsync.Entity{"id": json.RawMessage(`"t1"`), "description": json.RawMessage(`"b"`), "notes_doc": json.RawMessage(`"ydoc:v1:BBBB"`)}
	body, err := BuildPayload("d1", "w1", "task.updated", 1, "server", "task", entity, got.Fields)
	if err != nil {
		t.Fatal(err)
	}
	var p struct {
		Data map[string]map[string]any `json:"data"`
	}
	if err := json.Unmarshal(body, &p); err != nil {
		t.Fatal(err)
	}
	if _, has := p.Data["task"]["notes_doc"]; has || p.Data["task"]["description"] != "b" {
		t.Fatalf("payload data = %v", p.Data)
	}
	if _, has := entity["notes_doc"]; !has {
		t.Fatal("the caller's entity was modified")
	}
}
