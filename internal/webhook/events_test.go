package webhook

import (
	"encoding/json"
	"testing"

	opsync "github.com/pixari/opentodo/internal/sync"
)

func fc(from, to string) opsync.FieldChange {
	var f, t json.RawMessage
	if from != "" {
		f = json.RawMessage(from)
	}
	if to != "" {
		t = json.RawMessage(to)
	}
	return opsync.FieldChange{From: f, To: t}
}

func TestEventPrecedence(t *testing.T) {
	cases := []struct {
		name   string
		entity string
		fields map[string]opsync.FieldChange
		want   string
	}{
		{"created wins over everything", "task", map[string]opsync.FieldChange{
			"created_at": fc("", "1"), "completed_at": fc("", "2"), "deleted_at": fc("", "3"), "title": fc("", `"x"`)}, "task.created"},
		{"deleted wins over completed", "task", map[string]opsync.FieldChange{
			"deleted_at": fc("null", "3"), "completed_at": fc("null", "2")}, "task.deleted"},
		{"completed", "task", map[string]opsync.FieldChange{"completed_at": fc("null", "5"), "title": fc(`"a"`, `"b"`)}, "task.completed"},
		{"completed from absent", "task", map[string]opsync.FieldChange{"completed_at": fc("", "5")}, "task.completed"},
		{"reopened", "task", map[string]opsync.FieldChange{"completed_at": fc("5", "null")}, "task.reopened"},
		{"recompleted at another time is an update", "task", map[string]opsync.FieldChange{"completed_at": fc("5", "6")}, "task.updated"},
		{"undelete is an update", "task", map[string]opsync.FieldChange{"deleted_at": fc("5", "null")}, "task.updated"},
		{"plain update", "task", map[string]opsync.FieldChange{"priority": fc("4", "1")}, "task.updated"},
		{"project created", "project", map[string]opsync.FieldChange{"created_at": fc("", "1"), "archived": fc("", "true")}, "project.created"},
		{"project archived", "project", map[string]opsync.FieldChange{"archived": fc("false", "true"), "name": fc(`"a"`, `"b"`)}, "project.archived"},
		{"project archived from absent", "project", map[string]opsync.FieldChange{"archived": fc("", "true")}, "project.archived"},
		{"project unarchived is an update", "project", map[string]opsync.FieldChange{"archived": fc("true", "false")}, "project.updated"},
		{"project deleted", "project", map[string]opsync.FieldChange{"deleted_at": fc("null", "9"), "archived": fc("false", "true")}, "project.deleted"},
		{"completed_at is not an event for projects", "project", map[string]opsync.FieldChange{"name": fc(`"a"`, `"b"`)}, "project.updated"},
	}
	for _, c := range cases {
		got := EventFor(opsync.Change{Entity: c.entity, Fields: c.fields})
		if got != c.want {
			t.Errorf("%s: got %s, want %s", c.name, got, c.want)
		}
		if !KnownEvent(got) {
			t.Errorf("%s: %s is not a known event", c.name, got)
		}
	}
	if KnownEvent("ping") || KnownEvent("task.exploded") {
		t.Error("ping and unknown names are not subscribable")
	}
}

func TestPayloadChangesFromTo(t *testing.T) {
	task := opsync.Entity{"id": json.RawMessage(`"t1"`), "title": json.RawMessage(`"Water plants"`), "priority": json.RawMessage(`1`)}
	body, err := BuildPayload("d1", "w1", "task.updated", 1760060001000, "server", "task", task,
		map[string]opsync.FieldChange{"priority": fc("4", "1"), "labels": fc("", `["home"]`)})
	if err != nil {
		t.Fatal(err)
	}
	var got struct {
		Version   int    `json:"version"`
		ID        string `json:"id"`
		Event     string `json:"event"`
		Time      int64  `json:"time"`
		WebhookID string `json:"webhook_id"`
		Source    string `json:"source"`
		Device    string `json:"device"`
		Data      struct {
			Task map[string]any `json:"task"`
		} `json:"data"`
		Changes map[string]struct {
			From any `json:"from"`
			To   any `json:"to"`
		} `json:"changes"`
	}
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatal(err)
	}
	if got.Version != 1 || got.ID != "d1" || got.Event != "task.updated" || got.Time != 1760060001000 || got.WebhookID != "w1" || got.Source != "server" || got.Device != "" {
		t.Fatalf("envelope = %+v", got)
	}
	if got.Data.Task["priority"] != float64(1) || got.Data.Task["title"] != "Water plants" {
		t.Fatalf("data = %v", got.Data.Task)
	}
	p := got.Changes["priority"]
	if p.From != float64(4) || p.To != float64(1) {
		t.Fatalf("priority change = %+v", p)
	}
	if l := got.Changes["labels"]; l.From != nil {
		t.Fatalf("unknown previous value must be null: %+v", l)
	}

	// Device origins are reported as source "device" plus the device id.
	body, _ = BuildPayload("d2", "w1", "task.completed", 1, "phone-123", "task", task, nil)
	var dev map[string]any
	_ = json.Unmarshal(body, &dev)
	if dev["source"] != "device" || dev["device"] != "phone-123" {
		t.Fatalf("device payload = %v", dev)
	}
	if ch, ok := dev["changes"].(map[string]any); !ok || len(ch) != 0 {
		t.Fatalf("changes must be an object: %v", dev["changes"])
	}

	// Redelivery swaps only the id.
	again, err := WithDeliveryID(body, "d3")
	if err != nil {
		t.Fatal(err)
	}
	var re map[string]any
	_ = json.Unmarshal(again, &re)
	if re["id"] != "d3" || re["event"] != "task.completed" || re["device"] != "phone-123" {
		t.Fatalf("redelivered = %v", re)
	}
}

func TestPingPayloadHasEmptyData(t *testing.T) {
	body, err := BuildPayload("d", "w", EventPing, 1, "server", "", nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]json.RawMessage
	_ = json.Unmarshal(body, &m)
	if string(m["data"]) != `{}` || string(m["changes"]) != `{}` {
		t.Fatalf("ping body = %s", body)
	}
}
