package webhook

import (
	"context"
	"encoding/json"
	"testing"

	opsync "github.com/pixari/opentodo/internal/sync"
)

// automation-rules webhooks delta: "Rule sends to one webhook" and "Unknown
// webhook on the rule"; other webhooks see the rule's batch with source "rule".
func TestRuleFired(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	home := h.create("u1", "http://127.0.0.1:1/home", []string{"task.created"}, nil)
	other := h.create("u1", "http://127.0.0.1:1/other", []string{EventRuleFired, "task.updated"}, nil)
	h.apply("u1", setOp("task", "t1", "title", `"Water plants"`), setOp("task", "t1", "created_at", "1"))
	changes := map[string]opsync.FieldChange{"priority": {From: json.RawMessage("4"), To: json.RawMessage("1")}}
	if err := h.hooks.QueueRuleFired(ctx, "u1", home.ID, RuleRef{ID: "r1", Name: "Water"}, "t1", changes); err != nil {
		t.Fatal(err)
	}
	var fired []Delivery
	for _, d := range h.deliveries(home.ID) {
		if d.Event == EventRuleFired {
			fired = append(fired, d)
		}
	}
	if len(fired) != 1 {
		t.Fatalf("home deliveries %+v", fired)
	}
	for _, d := range h.deliveries(other.ID) {
		if d.Event == EventRuleFired {
			t.Fatal("rule.fired queued for a webhook the rule does not name")
		}
	}
	var body string
	if err := h.db.QueryRow(`SELECT payload FROM webhook_deliveries WHERE webhook_id = ? AND event = ?`, home.ID, EventRuleFired).Scan(&body); err != nil {
		t.Fatal(err)
	}
	var p struct {
		Source  string                     `json:"source"`
		Data    map[string]json.RawMessage `json:"data"`
		Changes map[string]opsync.FieldChange
	}
	if err := json.Unmarshal([]byte(body), &p); err != nil {
		t.Fatal(err)
	}
	if p.Source != "rule" || string(p.Data["rule"]) != `{"id":"r1","name":"Water"}` || p.Data["task"] == nil || string(p.Changes["priority"].To) != "1" {
		t.Fatalf("payload %s", body)
	}
	if err := h.hooks.QueueRuleFired(ctx, "u1", "gone", RuleRef{ID: "r1"}, "t1", nil); err != ErrNoWebhook {
		t.Fatalf("missing webhook: %v", err)
	}
	if err := h.hooks.QueueRuleFired(ctx, "u2", home.ID, RuleRef{ID: "r1"}, "t1", nil); err != ErrNoWebhook {
		t.Fatalf("another user's webhook: %v", err)
	}
	if SourceFor("rule:r1") != "rule" {
		t.Fatal("source")
	}
}
