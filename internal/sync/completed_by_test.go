package sync

import (
	"encoding/json"
	"testing"
)

// OpenSpec change completed-date-filters, design D5.
func TestStampCompletedBy(t *testing.T) {
	op := func(id, entity, entityID, field, value string) Op {
		return Op{ID: id, Entity: entity, EntityID: entityID, Field: field, Value: json.RawMessage(value), TS: 42, Device: "server"}
	}
	in := []Op{
		op("a1", "task", "done", "completed_at", "1000"),
		op("b1", "task", "reopened", "completed_at", "null"),
		op("c1", "task", "new-open", "created_at", "5"),
		op("c2", "task", "new-open", "completed_at", "null"),
		op("d1", "task", "explicit", "completed_at", "1000"),
		op("d2", "task", "explicit", "completed_by", "null"),
		op("e1", "task", "new-done", "created_at", "5"),
		op("e2", "task", "new-done", "completed_at", "7"),
		op("f1", "review", "me", "completed_at", "9"),
		op("g1", "task", "title-only", "title", `"x"`),
	}
	out := StampCompletedBy("u1", in)
	if len(in) != 10 {
		t.Fatal("input modified")
	}
	got := map[string]string{}
	for _, o := range out[len(in):] {
		if o.Field != "completed_by" || o.TS != 42 || o.Device != "server" {
			t.Fatalf("stamped op = %+v", o)
		}
		got[o.EntityID] = string(o.Value)
	}
	want := map[string]string{"done": `"u1"`, "reopened": "null", "new-done": `"u1"`}
	if len(got) != len(want) {
		t.Fatalf("stamped = %v, want %v", got, want)
	}
	for k, v := range want {
		if got[k] != v {
			t.Fatalf("stamped = %v, want %v", got, want)
		}
	}
	// Deterministic ids: a retried batch is a duplicate.
	again := StampCompletedBy("u1", in)
	if again[len(in)].ID != out[len(in)].ID {
		t.Fatal("stamped op id is not stable")
	}
	// Nothing to add: the same slice back.
	plain := []Op{op("x", "task", "t", "title", `"y"`)}
	if res := StampCompletedBy("u1", plain); len(res) != 1 {
		t.Fatalf("plain batch = %v", res)
	}
}
