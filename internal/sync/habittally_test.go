package sync

import (
	"strconv"
	"testing"
)

// tallyOps builds the ops of one device's tally on a record (habit-targets D2).
func (f *sharingFixture) tallyOps(id, series, device string, count int) []Op {
	return []Op{
		f.op("habit_tally", id, "series_id", `"`+series+`"`),
		f.op("habit_tally", id, "date", `"2026-11-14"`),
		f.op("habit_tally", id, "device", `"`+device+`"`),
		f.op("habit_tally", id, "count", strconv.Itoa(count)),
		f.op("habit_tally", id, "created_at", `1`),
	}
}

// "Two phones, offline": each device's row is kept in the record's scope, so
// every member reads both counts; a viewer may not add; the tallies go with a
// purged series, and late ops for it are discarded.
func TestHabitTallies(t *testing.T) {
	t.Parallel()
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	f.add("alice", "carol", RoleViewer)
	if res := f.apply("alice", "A", f.tallyOps("x1", "t1", "A", 2)...); len(res.Rejected) != 0 {
		t.Fatalf("A rejected: %v", res.Rejected)
	}
	if res := f.apply("bob", "B", f.tallyOps("x2", "t1", "B", 3)...); len(res.Rejected) != 0 {
		t.Fatalf("B rejected: %v", res.Rejected)
	}
	list, err := f.s.List(f.ctx, "carol", "habit_tally", false)
	if err != nil || len(list) != 2 {
		t.Fatalf("carol reads %v, %v", list, err)
	}
	var sc string
	f.s.db.QueryRow(`SELECT DISTINCT scope_id FROM scope_fields WHERE entity='habit_tally' AND entity_id='x2'`).Scan(&sc)
	if sc != ProjectScope("p") {
		t.Fatalf("x2 scope = %s", sc)
	}
	if res := f.apply("carol", "C", f.tallyOps("x3", "t1", "C", 1)...); res.Applied != 0 || len(res.Rejected) == 0 || res.Rejected[0].Reason != ReasonForbidden {
		t.Fatalf("viewer tally = %+v", res)
	}
	// The series, date and device of a tally never change.
	if res := f.apply("bob", "B", f.op("habit_tally", "x2", "series_id", `"t2"`), f.op("habit_tally", "x2", "date", `"2026-11-15"`)); len(res.Rejected) != 2 {
		t.Fatalf("moved tally = %+v", res)
	}
	if res := f.apply("bob", "B", f.op("habit_tally", "x2", "count", `4`)); len(res.Rejected) != 0 {
		t.Fatalf("count update = %+v", res)
	}
	f.apply("alice", "A", f.op("task", "t1", "deleted_at", `9000`))
	if _, err := f.s.Purge(f.ctx, "alice", "task", []string{"t1"}); err != nil {
		t.Fatal(err)
	}
	if left, _ := f.s.List(f.ctx, "alice", "habit_tally", true); len(left) != 0 {
		t.Fatalf("tallies left: %v", left)
	}
	if res := f.apply("bob", "B", f.tallyOps("x4", "t1", "B", 1)...); res.Applied != 0 || len(res.Rejected) != 0 {
		t.Fatalf("late tally = %+v", res)
	}
}
