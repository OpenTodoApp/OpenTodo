package webhook

import (
	"encoding/json"
	"testing"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

func TestCommentPayloadCarriesTheTask(t *testing.T) {
	comment := opsync.Entity{
		"id": json.RawMessage(`"c1"`), "task_id": json.RawMessage(`"t1"`),
		"parent_id": json.RawMessage(`null`), "author_id": json.RawMessage(`"u1"`),
		"body": json.RawMessage(`"Need a decision"`), "mentions": json.RawMessage(`[]`),
		"created_at": json.RawMessage(`10`),
	}
	task := opsync.Entity{"id": json.RawMessage(`"t1"`), "title": json.RawMessage(`"Call the bank"`), "project_id": json.RawMessage(`"P"`)}
	body, err := BuildPayload("d1", "w1", "comment.updated", 20, "agent:tok", "comment", comment,
		map[string]opsync.FieldChange{"body": fc(`"Need a decision"`, `"Called, left a message"`), "edited_at": fc("null", "20")},
		map[string]opsync.Entity{"task": task})
	if err != nil {
		t.Fatal(err)
	}
	var got struct {
		Source string `json:"source"`
		Device string `json:"device"`
		Data   struct {
			Comment map[string]any `json:"comment"`
			Task    map[string]any `json:"task"`
		} `json:"data"`
		Changes map[string]struct {
			From any `json:"from"`
			To   any `json:"to"`
		} `json:"changes"`
	}
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatal(err)
	}
	if got.Source != "device" || got.Device != "agent:tok" {
		t.Fatalf("source = %s device = %s", got.Source, got.Device)
	}
	if got.Data.Comment["body"] != "Need a decision" || got.Data.Comment["task_id"] != "t1" || got.Data.Task["title"] != "Call the bank" {
		t.Fatalf("data = %+v", got.Data)
	}
	if b := got.Changes["body"]; b.From != "Need a decision" || b.To != "Called, left a message" {
		t.Fatalf("body change = %+v", b)
	}
}

func TestCommentEventsFollowTheTaskProject(t *testing.T) {
	h := newHarness(t)
	rcv := newReceiver(t, 200)
	p := "P"
	inP := h.create("u1", rcv.srv.URL, []string{"comment.created", "comment.updated", "comment.deleted"}, &p)
	q := "Q"
	inQ := h.create("u1", rcv.srv.URL, []string{"comment.created"}, &q)
	h.apply("u1", setOp("task", "t1", "created_at", `1`), setOp("task", "t1", "title", `"Call the bank"`), setOp("task", "t1", "project_id", `"P"`))
	ops := []opsync.Op{
		setOp("comment", "c1", "task_id", `"t1"`),
		setOp("comment", "c1", "author_id", `"u1"`),
		setOp("comment", "c1", "body", `"Need a decision"`),
		setOp("comment", "c1", "created_at", `10`),
	}
	for i := range ops {
		ops[i].Device = "agent:tok"
	}
	h.apply("u1", ops...)
	if n := len(h.deliveries(inQ.ID)); n != 0 {
		t.Fatalf("comment on a task in P reached the Q webhook: %d", n)
	}
	list := h.deliveries(inP.ID)
	if len(list) != 1 || list[0].Event != "comment.created" {
		t.Fatalf("created = %+v", list)
	}
	var payload string
	if err := h.db.QueryRow(`SELECT payload FROM webhook_deliveries WHERE id = ?`, list[0].ID).Scan(&payload); err != nil {
		t.Fatal(err)
	}
	var created struct {
		Device string `json:"device"`
		Data   struct {
			Comment map[string]any `json:"comment"`
			Task    map[string]any `json:"task"`
		} `json:"data"`
	}
	if err := json.Unmarshal([]byte(payload), &created); err != nil {
		t.Fatal(err)
	}
	if created.Device != "agent:tok" || created.Data.Comment["body"] != "Need a decision" || created.Data.Task["title"] != "Call the bank" || created.Data.Task["project_id"] != "P" {
		t.Fatalf("created payload = %+v", created)
	}

	h.apply("u1", setOp("comment", "c1", "body", `"Called, left a message"`), setOp("comment", "c1", "edited_at", `20`))
	h.apply("u1", setOp("comment", "c1", "deleted_at", `30`))
	got := map[string]int{}
	for _, d := range h.deliveries(inP.ID) {
		got[d.Event]++
	}
	if got["comment.created"] != 1 || got["comment.updated"] != 1 || got["comment.deleted"] != 1 || len(got) != 3 {
		t.Fatalf("events = %v", got)
	}
}
