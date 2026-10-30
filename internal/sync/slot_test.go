package sync

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
)

// calendar-slots "Slot entity": a slot is personal, its task list converges as
// one whole value (never a merge), and other fields per field.
func TestSlotIsPersonalAndListConvergesWhole(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	mustApply(t, s, "u1",
		op("s1", "slot", "sl1", "title", `"Admin"`, 100, "A"),
		op("s2", "slot", "sl1", "date", `"2026-11-04"`, 100, "A"),
		op("s3", "slot", "sl1", "start", `"16:00"`, 100, "A"),
		op("s4", "slot", "sl1", "minutes", `45`, 100, "A"),
		op("s5", "slot", "sl1", "task_ids", `[]`, 100, "A"),
	)
	// "Concurrent task lists": the laptop writes [A, B], the phone [A, C]; the later wins whole.
	mustApply(t, s, "u1", op("a1", "slot", "sl1", "task_ids", `["A","B"]`, 300, "laptop"))
	mustApply(t, s, "u1", op("b1", "slot", "sl1", "task_ids", `["A","C"]`, 250, "phone"))
	mustApply(t, s, "u1", op("b2", "slot", "sl1", "minutes", `60`, 260, "phone"))
	e, err := s.Get(ctx, "u1", "slot", "sl1")
	if err != nil {
		t.Fatal(err)
	}
	if string(e["task_ids"]) != `["A","B"]` || string(e["minutes"]) != "60" || string(e["title"]) != `"Admin"` {
		t.Fatalf("slot = %s %s %s", e["task_ids"], e["minutes"], e["title"])
	}
	if other, err := s.List(ctx, "u2", "slot", true); err != nil || len(other) != 0 {
		t.Fatalf("u2 sees %d slots, %v", len(other), err)
	}
}

// "Invalid value": 21 task ids, a start of 25:00 or a length over a day are refused.
func TestSlotValidationRefuses(t *testing.T) {
	ids := make([]string, MaxSlotTasks+1)
	for i := range ids {
		ids[i] = fmt.Sprintf("t%d", i)
	}
	many, _ := json.Marshal(ids)
	bad := []struct{ field, value string }{
		{"task_ids", string(many)},
		{"task_ids", `["a","a"]`},
		{"start", `"25:00"`},
		{"minutes", `null`},
		{"minutes", `0`},
		{"minutes", `1441`},
		{"date", `"2026-13-01"`},
	}
	for _, b := range bad {
		if err := Validate(op("x", "slot", "sl1", b.field, b.value, 100, "A")); err == nil {
			t.Errorf("%s %s was accepted", b.field, b.value)
		}
	}
	ok := []struct{ field, value string }{
		{"task_ids", string(must(json.Marshal(ids[:MaxSlotTasks])))},
		{"minutes", `480`},
		{"minutes", `1440`},
		{"start", `"23:45"`},
		{"date", `null`},
	}
	for _, g := range ok {
		if err := Validate(op("x", "slot", "sl1", g.field, g.value, 100, "A")); err != nil {
			t.Errorf("%s %s: %v", g.field, g.value, err)
		}
	}
}

func must(b []byte, err error) []byte {
	if err != nil {
		panic(err)
	}
	return b
}

// "Personal on a shared project": Ana's slot listing a task of a shared project
// never reaches Ben, a member.
func TestSlotNeverReachesProjectMembers(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", "editor")
	f.apply("alice", "A", f.op("slot", "sl1", "title", `"Admin"`), f.op("slot", "sl1", "task_ids", `["t1"]`))
	ops, _ := f.pullAll("bob", "B", 0)
	for _, o := range ops {
		if o.Entity == "slot" {
			t.Fatalf("bob received a slot op: %+v", o)
		}
	}
	if got := f.field("alice", "slot", "sl1", "task_ids"); got != `["t1"]` {
		t.Fatalf("alice's slot = %s", got)
	}
}
