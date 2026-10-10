package sync

import (
	"errors"
	"slices"
	"testing"
)

// TestValidateReminderOps covers the reminder entity (OpenSpec change reminders).
func TestValidateReminderOps(t *testing.T) {
	valid := []Op{
		op("r1", "reminder", "rm1", "task_id", `"t1"`, 1, "A"),
		op("r2", "reminder", "rm1", "kind", `"relative"`, 1, "A"),
		op("r3", "reminder", "rm1", "kind", `"absolute"`, 1, "A"),
		op("r4", "reminder", "rm1", "offset_minutes", `-30`, 1, "A"),
		op("r5", "reminder", "rm1", "offset_minutes", `null`, 1, "A"),
		op("r6", "reminder", "rm1", "fire_at", `1791000000000`, 1, "A"),
		op("r7", "reminder", "rm1", "fire_at", `null`, 1, "A"),
		op("r8", "reminder", "rm1", "delivered_at", `null`, 1, "A"),
		op("r9", "reminder", "rm1", "dismissed_at", `1791000000000`, 1, "A"),
		op("r10", "reminder", "rm1", "created_at", `1791000000000`, 1, "A"),
		op("r11", "reminder", "rm1", "deleted_at", `null`, 1, "A"),
	}
	for _, o := range valid {
		if err := Validate(o); err != nil {
			t.Errorf("%s=%s rejected: %v", o.Field, o.Value, err)
		}
	}
	invalid := []Op{
		op("x1", "reminder", "rm1", "kind", `"weekly"`, 1, "A"),
		op("x2", "reminder", "rm1", "kind", `null`, 1, "A"),
		op("x3", "reminder", "rm1", "fire_at", `"tomorrow"`, 1, "A"),
		op("x4", "reminder", "rm1", "fire_at", `0`, 1, "A"),
		op("x5", "reminder", "rm1", "fire_at", `-5`, 1, "A"),
		op("x6", "reminder", "rm1", "offset_minutes", `1.5`, 1, "A"),
		op("x7", "reminder", "rm1", "offset_minutes", `"30"`, 1, "A"),
		op("x8", "reminder", "rm1", "offset_minutes", `600000`, 1, "A"),
		op("x9", "reminder", "rm1", "task_id", `42`, 1, "A"),
		op("x10", "reminder", "rm1", "task_id", `""`, 1, "A"),
		op("x11", "reminder", "rm1", "task_id", `null`, 1, "A"),
		op("x12", "reminder", "rm1", "title", `"nope"`, 1, "A"),
	}
	for _, o := range invalid {
		if err := Validate(o); !errors.Is(err, ErrInvalidOp) {
			t.Errorf("%s=%s accepted, want ErrInvalidOp (got %v)", o.Field, o.Value, err)
		}
	}
	if Plural["reminders"] != "reminder" {
		t.Error(`Plural["reminders"] missing`)
	}
}

// Reminders are personal even on a task in a shared project: the op lands in its
// creator's personal scope, only the creator's devices receive it, and a viewer
// (who may not write the task) can still keep reminders on it.
func TestReminderOnSharedTaskIsPersonal(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleViewer)
	f.add("alice", "carol", RoleEditor)
	res := f.apply("bob", "B",
		f.op("reminder", "rb", "task_id", `"t1"`), f.op("reminder", "rb", "kind", `"absolute"`),
		f.op("reminder", "rb", "fire_at", `1791000000000`))
	if len(res.Rejected) != 0 || res.Applied != 3 {
		t.Fatalf("viewer's reminder: applied %d, rejected %v", res.Applied, res.Rejected)
	}
	if !slices.Equal(res.Audience, []string{"bob"}) {
		t.Fatalf("audience = %v, want only bob", res.Audience)
	}
	var scope string
	if err := f.s.db.QueryRow(`SELECT DISTINCT scope_id FROM scope_fields WHERE entity='reminder' AND entity_id='rb'`).Scan(&scope); err != nil || scope != PersonalScope("bob") {
		t.Fatalf("reminder scope = %q, %v", scope, err)
	}
	// Only bob's other device receives it; alice (owner) and carol (editor) do not.
	bob, _ := f.pullAll("bob", "B2", 0)
	if !slices.Contains(entityIDs(bob), "rb") {
		t.Fatalf("bob's other device does not get his reminder: %v", entityIDs(bob))
	}
	for _, u := range []string{"alice", "carol"} {
		ops, _ := f.pullAll(u, u+"-dev", 0)
		if slices.Contains(entityIDs(ops), "rb") {
			t.Fatalf("%s received bob's reminder", u)
		}
		if got := f.field(u, "reminder", "rb", "fire_at"); got != "<none>" {
			t.Fatalf("%s can read bob's reminder: %s", u, got)
		}
	}
	// A reminder with the same id written by another user stays separate.
	f.apply("carol", "C", f.op("reminder", "rb", "fire_at", `5`))
	if got := f.field("bob", "reminder", "rb", "fire_at"); got != "1791000000000" {
		t.Fatalf("carol overwrote bob's reminder: %s", got)
	}
}
