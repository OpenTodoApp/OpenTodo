package sync

import (
	"context"
	"encoding/json"
	"errors"
	"slices"
	"strings"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/notify"
)

// Rotating assignees (OpenSpec change chore-rotation).

// house shares "p" with bob and carol as editors and makes t1 a weekly
// series assigned to alice that rotates alice → bob → carol.
func house(t *testing.T) *sharingFixture {
	t.Helper()
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	f.add("alice", "carol", RoleEditor)
	res := f.apply("alice", "A",
		f.op("task", "t1", "recurrence", `"every monday"`),
		f.op("task", "t1", "due", `{"date":"2026-11-09"}`),
		f.op("task", "t1", "assignee_id", `"alice"`),
		f.op("task", "t1", "rotation", `["alice","bob","carol"]`),
	)
	if len(res.Rejected) != 0 {
		t.Fatalf("setup rejected %v", rejectedIDs(res))
	}
	return f
}

func TestRotationIsCheckedAtReceipt(t *testing.T) {
	f := house(t)
	for _, u := range []string{"alice", "bob", "carol"} {
		if got := f.field(u, "task", "t1", "rotation"); got != `["alice","bob","carol"]` {
			t.Fatalf("%s sees rotation %s", u, got)
		}
	}
	// A non-member is refused whole, and the device gets the old value back.
	bad := f.op("task", "t1", "rotation", `["alice","mallory"]`)
	res := f.apply("bob", "B", bad)
	if !slices.Equal(rejectedIDs(res), []string{bad.ID + ":" + ReasonNotAMember}) {
		t.Fatalf("rejected = %v", rejectedIDs(res))
	}
	if len(res.Restore) != 1 || string(res.Restore[0].Value) != `["alice","bob","carol"]` {
		t.Fatalf("restore = %+v", res.Restore)
	}
	// Duplicates and more than MaxRotation people are invalid ops.
	if err := Validate(op("d", "task", "t1", "rotation", `["alice","alice"]`, 1, "A")); !errors.Is(err, ErrInvalidOp) {
		t.Fatalf("duplicates: %v", err)
	}
	many := make([]string, MaxRotation+1)
	for i := range many {
		many[i] = strings.Repeat("u", i+1)
	}
	if err := Validate(op("d", "task", "t1", "rotation", string(JSONOf(many)), 1, "A")); !errors.Is(err, ErrInvalidOp) {
		t.Fatalf("21 people: %v", err)
	}
	// A rotation on a task without a rule is kept (inert).
	if res := f.apply("alice", "A", f.op("task", "t2", "rotation", `["bob","carol"]`)); len(res.Rejected) != 0 {
		t.Fatalf("inert rotation refused: %v", rejectedIDs(res))
	}
	// In a personal scope only the author may take turns.
	if res := f.apply("alice", "A", f.op("task", "inbox", "rotation", `["alice","bob"]`)); len(res.Rejected) != 1 {
		t.Fatalf("personal rotation with bob = %v", rejectedIDs(res))
	}
	// A viewer may not write it.
	if _, err := f.s.SetMemberRole(f.ctx, "alice", "p", "carol", RoleViewer); err != nil {
		t.Fatal(err)
	}
	v := f.op("task", "t1", "rotation", `[]`)
	if res := f.apply("carol", "C", v); !slices.Equal(rejectedIDs(res), []string{v.ID + ":" + ReasonForbidden}) {
		t.Fatalf("viewer = %v", rejectedIDs(res))
	}
}

func complete(t *testing.T, f *sharingFixture, user, today string) (map[string]json.RawMessage, map[string]json.RawMessage) {
	t.Helper()
	existing, err := f.s.Get(f.ctx, user, "task", "t1")
	if err != nil {
		t.Fatal(err)
	}
	body := map[string]json.RawMessage{"completed_at": json.RawMessage("5000")}
	_, record, ok, err := f.s.RecurringCompletion(f.ctx, user, "t1", body, existing, today)
	if err != nil || !ok {
		t.Fatalf("completion ok=%v err=%v", ok, err)
	}
	return body, record
}

func TestServerCompletionPassesTheTurn(t *testing.T) {
	f := house(t)
	body, record := complete(t, f, "alice", "2026-11-09")
	if string(body["assignee_id"]) != `"bob"` || string(record["assignee_id"]) != `"alice"` {
		t.Fatalf("series assignee %s, record assignee %s", body["assignee_id"], record["assignee_id"])
	}
	// Carol's turn wraps around to alice.
	f.apply("alice", "A", f.op("task", "t1", "assignee_id", `"carol"`))
	if body, _ := complete(t, f, "carol", "2026-11-09"); string(body["assignee_id"]) != `"alice"` {
		t.Fatalf("wrap = %s", body["assignee_id"])
	}
	// A write that sets the assignee itself keeps it.
	existing, _ := f.s.Get(f.ctx, "alice", "task", "t1")
	body = map[string]json.RawMessage{"completed_at": json.RawMessage("5000"), "assignee_id": json.RawMessage(`"carol"`)}
	if _, _, ok, _ := f.s.RecurringCompletion(f.ctx, "alice", "t1", body, existing, "2026-11-09"); !ok || string(body["assignee_id"]) != `"carol"` {
		t.Fatalf("explicit assignee = %s", body["assignee_id"])
	}
	// A subtask's rotation and a series in a project with one member are inert.
	f.apply("alice", "A", f.op("task", "t1", "parent_id", `"t2"`))
	if body, _ := complete(t, f, "alice", "2026-11-09"); body["assignee_id"] != nil {
		t.Fatalf("subtask rotated to %s", body["assignee_id"])
	}
	f.apply("alice", "A", f.op("task", "t1", "parent_id", `null`))
	if _, err := f.s.RemoveMember(f.ctx, "alice", "p", "bob"); err != nil {
		t.Fatal(err)
	}
	if _, err := f.s.RemoveMember(f.ctx, "alice", "p", "carol"); err != nil {
		t.Fatal(err)
	}
	if body, _ := complete(t, f, "alice", "2026-11-09"); body["assignee_id"] != nil {
		t.Fatalf("single-member project rotated to %s", body["assignee_id"])
	}
}

func TestServerCompletionKeepsAssigneeWhenTheSeriesEnds(t *testing.T) {
	f := house(t)
	f.apply("alice", "A", f.op("task", "t1", "recurrence", `"every monday for 1 times"`))
	existing, _ := f.s.Get(f.ctx, "alice", "task", "t1")
	body := map[string]json.RawMessage{"completed_at": json.RawMessage("5000")}
	_, _, ok, err := f.s.RecurringCompletion(f.ctx, "alice", "t1", body, existing, "2026-11-09")
	if err != nil || ok || body["assignee_id"] != nil {
		t.Fatalf("ending series ok=%v assignee=%s err=%v", ok, body["assignee_id"], err)
	}
}

// completionBatch is what a device sends to complete t1's 2026-11-09
// occurrence and pass the turn to next.
func completionBatch(f *sharingFixture, next string) []Op {
	rec := OccurrenceID("t1", "2026-11-09")
	return []Op{
		f.op("task", rec, "title", `"Milk"`), f.op("task", rec, "project_id", `"p"`),
		f.op("task", rec, "series_id", `"t1"`), f.op("task", rec, "occurrence_date", `"2026-11-09"`),
		f.op("task", rec, "assignee_id", `"alice"`), f.op("task", rec, "completed_at", `5000`),
		f.op("task", "t1", "due", `{"date":"2026-11-16"}`),
		f.op("task", "t1", "assignee_id", string(JSONOf(next))),
	}
}

func TestTurnNotification(t *testing.T) {
	f := house(t)
	rec := &recordingSink{s: f.s}
	f.s.AddSink(rec)
	f.apply("alice", "A", completionBatch(f, "bob")...)
	if len(rec.events) != 1 || rec.events[0].AssigneeID != "bob" || !rec.events[0].Turn || rec.events[0].TaskID != "t1" {
		t.Fatalf("events = %+v", rec.events)
	}
	// A plain reassignment is not a turn.
	f.apply("bob", "B", f.op("task", "t1", "assignee_id", `"carol"`))
	if len(rec.events) != 2 || rec.events[1].Turn {
		t.Fatalf("events = %+v", rec.events)
	}
	var _ notify.Assigned = rec.events[0]
}

// A device that missed bob's departure names him next: the record and the
// due date are accepted, the assignee op is refused, and the server's
// hand-over stands.
func TestStaleRotationAfterDeparture(t *testing.T) {
	f := house(t)
	if _, err := f.s.RemoveMember(f.ctx, "alice", "p", "bob"); err != nil {
		t.Fatal(err)
	}
	batch := completionBatch(f, "bob")
	res := f.apply("alice", "phone", batch...)
	last := batch[len(batch)-1]
	if !slices.Equal(rejectedIDs(res), []string{last.ID + ":" + ReasonNotAMember}) || res.Applied != len(batch)-1 {
		t.Fatalf("rejected = %v applied %d", rejectedIDs(res), res.Applied)
	}
	if got := f.field("carol", "task", "t1", "assignee_id"); got != `"alice"` {
		t.Fatalf("assignee = %s", got)
	}
	if got := f.field("carol", "task", "t1", "due"); got != `{"date":"2026-11-16"}` {
		t.Fatalf("due = %s", got)
	}
}

func TestDepartureHandsOnTheTurn(t *testing.T) {
	f := house(t)
	f.apply("alice", "A",
		f.op("task", "t1", "assignee_id", `"bob"`),
		// t2 rotates but has no rule: bob is unassigned, not handed on.
		f.op("task", "t2", "rotation", `["bob","carol"]`), f.op("task", "t2", "assignee_id", `"bob"`),
	)
	_, cursor := f.pullAll("carol", "C", 0)
	ch, err := f.s.RemoveMember(f.ctx, "alice", "p", "bob")
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(ch.Unassigned, []string{"t1", "t2"}) {
		t.Fatalf("held = %v", ch.Unassigned)
	}
	for field, want := range map[string]string{"assignee_id": `"carol"`, "rotation": `["alice","carol"]`} {
		if got := f.field("carol", "task", "t1", field); got != want {
			t.Fatalf("t1 %s = %s, want %s", field, got, want)
		}
	}
	if got := f.field("carol", "task", "t2", "assignee_id"); got != "null" {
		t.Fatalf("t2 assignee = %s", got)
	}
	if got := f.field("carol", "task", "t2", "rotation"); got != `["carol"]` {
		t.Fatalf("t2 rotation = %s", got)
	}
	ops, _ := f.pullAll("carol", "C", cursor)
	if len(ops) != 4 {
		t.Fatalf("pulled %d ops: %+v", len(ops), ops)
	}
	for _, o := range ops {
		if o.Device != ServerDevice {
			t.Fatalf("op not server-authored: %+v", o)
		}
	}
	// The last other member leaves: the turn goes back to alice.
	f.apply("alice", "A", f.op("task", "t1", "assignee_id", `"carol"`))
	if _, err := f.s.RemoveMember(f.ctx, "carol", "p", "carol"); err != nil {
		t.Fatal(err)
	}
	if got := f.field("alice", "task", "t1", "assignee_id"); got != `"alice"` {
		t.Fatalf("last leaver: assignee = %s", got)
	}
	if got := f.field("alice", "task", "t1", "rotation"); got != `["alice"]` {
		t.Fatalf("last leaver: rotation = %s", got)
	}
}

func TestAccountDeletionHandsOnTheTurn(t *testing.T) {
	f := house(t)
	f.apply("alice", "A", f.op("task", "t1", "assignee_id", `"bob"`))
	ctx, deletion := WithAccountDeletion(f.ctx)
	tx, err := f.s.db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.s.DeleteAccountData(ctx, tx, "bob"); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	f.s.ObserveAccountDeletion(context.Background(), deletion)
	if got := f.field("alice", "task", "t1", "assignee_id"); got != `"carol"` {
		t.Fatalf("assignee = %s", got)
	}
	if got := f.field("alice", "task", "t1", "rotation"); got != `["alice","carol"]` {
		t.Fatalf("rotation = %s", got)
	}
}
