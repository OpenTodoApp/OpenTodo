package webhook

import (
	"context"
	"encoding/json"
	"testing"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
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

// routines-engine "Routine webhook step": one delivery to the named webhook
// with the routine object, the task's state only when exactly one task was given.
func TestQueueRoutine(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	home := h.create("u1", "http://127.0.0.1:1/home", []string{"task.created"}, nil)
	other := h.create("u1", "http://127.0.0.1:1/other", []string{EventRuleFired}, nil)
	h.apply("u1", setOp("task", "t1", "title", `"Water plants"`), setOp("task", "t1", "created_at", "1"))
	text := "3 tasks today"
	if err := h.hooks.QueueRoutine(ctx, "u1", home.ID, RuleRef{ID: "r1", Name: "Morning"}, RoutineRef{RunID: "run", StepID: "c", Text: &text, TaskIDs: []string{"t1", "t2", "t3"}}); err != nil {
		t.Fatal(err)
	}
	if err := h.hooks.QueueRoutine(ctx, "u1", home.ID, RuleRef{ID: "r1", Name: "Morning"}, RoutineRef{RunID: "run2", StepID: "c", TaskIDs: []string{"t1"}}); err != nil {
		t.Fatal(err)
	}
	for _, d := range h.deliveries(other.ID) {
		if d.Event == EventRuleFired {
			t.Fatal("queued for a webhook the step does not name")
		}
	}
	rows, err := h.db.Query(`SELECT payload FROM webhook_deliveries WHERE webhook_id = ? AND event = ? ORDER BY rowid`, home.ID, EventRuleFired)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var bodies []string
	for rows.Next() {
		var b string
		if err := rows.Scan(&b); err != nil {
			t.Fatal(err)
		}
		bodies = append(bodies, b)
	}
	if err := rows.Err(); err != nil || len(bodies) != 2 {
		t.Fatalf("%d deliveries %v", len(bodies), err)
	}
	var many, one struct {
		Source string                     `json:"source"`
		Data   map[string]json.RawMessage `json:"data"`
	}
	_ = json.Unmarshal([]byte(bodies[0]), &many)
	_ = json.Unmarshal([]byte(bodies[1]), &one)
	if many.Source != "rule" || string(many.Data["routine"]) != `{"run_id":"run","step_id":"c","text":"3 tasks today","task_ids":["t1","t2","t3"]}` || many.Data["task"] != nil {
		t.Fatalf("three tasks: %s", bodies[0])
	}
	if one.Data["task"] == nil || string(one.Data["rule"]) != `{"id":"r1","name":"Morning"}` {
		t.Fatalf("one task: %s", bodies[1])
	}
	if err := h.hooks.QueueRoutine(ctx, "u1", "gone", RuleRef{ID: "r1"}, RoutineRef{}); err != ErrNoWebhook {
		t.Fatalf("missing webhook: %v", err)
	}
}
