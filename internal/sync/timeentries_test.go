package sync

import (
	"errors"
	"testing"
)

// entryOps builds the ops of a new time entry in one batch (time-tracking D1).
func (f *sharingFixture) entryOps(id, task, user string, started, ended int64) []Op {
	end := "null"
	if ended > 0 {
		end = mustJSON(ended)
	}
	return []Op{
		f.op("time_entry", id, "task_id", `"`+task+`"`),
		f.op("time_entry", id, "user_id", `"`+user+`"`),
		f.op("time_entry", id, "started_at", mustJSON(started)),
		f.op("time_entry", id, "ended_at", end),
		f.op("time_entry", id, "device_id", `"dev"`),
		f.op("time_entry", id, "note", `""`),
		f.op("time_entry", id, "created_at", mustJSON(started)),
	}
}

func TestValidateTimeEntryOps(t *testing.T) {
	t.Parallel()
	ok := []Op{
		{Entity: "time_entry", Field: "task_id", Value: []byte(`"t1"`)},
		{Entity: "time_entry", Field: "user_id", Value: []byte(`"alice"`)},
		{Entity: "time_entry", Field: "started_at", Value: []byte(`1760950800000`)},
		{Entity: "time_entry", Field: "ended_at", Value: []byte(`null`)},
		{Entity: "time_entry", Field: "ended_at", Value: []byte(`1760954400000`)},
		{Entity: "time_entry", Field: "device_id", Value: []byte(`"d1"`)},
		{Entity: "time_entry", Field: "note", Value: []byte(`"review"`)},
		{Entity: "time_entry", Field: "created_at", Value: []byte(`1`)},
		{Entity: "time_entry", Field: "deleted_at", Value: []byte(`null`)},
	}
	// "Invalid values": a string start, a negative end, a task_id that is not an id.
	bad := []Op{
		{Entity: "time_entry", Field: "started_at", Value: []byte(`"09:00"`)},
		{Entity: "time_entry", Field: "ended_at", Value: []byte(`-5`)},
		{Entity: "time_entry", Field: "task_id", Value: []byte(`42`)},
		{Entity: "time_entry", Field: "task_id", Value: []byte(`""`)},
		{Entity: "time_entry", Field: "minutes", Value: []byte(`5`)},
	}
	for i, op := range ok {
		op.ID, op.EntityID, op.Device, op.TS = "o", "e", "d", 1
		if err := Validate(op); err != nil {
			t.Errorf("ok[%d] %s: %v", i, op.Field, err)
		}
	}
	for i, op := range bad {
		op.ID, op.EntityID, op.Device, op.TS = "o", "e", "d", 1
		if err := Validate(op); !errors.Is(err, ErrInvalidOp) {
			t.Errorf("bad[%d] %s accepted", i, op.Field)
		}
	}
}

func TestTimeEntryScopeAndTwoDevices(t *testing.T) {
	t.Parallel()
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	// "Two devices track the same task": two rows, both kept.
	if res := f.apply("alice", "A", f.entryOps("e1", "t1", "alice", 1000, 1000+20*60000)...); len(res.Rejected) != 0 {
		t.Fatalf("e1 rejected: %v", res.Rejected)
	}
	if res := f.apply("bob", "B", f.entryOps("e2", "t1", "bob", 2000, 2000+30*60000)...); len(res.Rejected) != 0 {
		t.Fatalf("e2 rejected: %v", res.Rejected)
	}
	list, err := f.s.List(f.ctx, "alice", "time_entry", false)
	if err != nil || len(list) != 2 {
		t.Fatalf("entries = %v, %v", list, err)
	}
	var sc string
	f.s.db.QueryRow(`SELECT DISTINCT scope_id FROM scope_fields WHERE entity='time_entry' AND entity_id='e2'`).Scan(&sc)
	if sc != ProjectScope("p") {
		t.Fatalf("e2 scope = %s", sc)
	}
	// An Inbox task's entry is personal.
	f.apply("alice", "A", f.entryOps("e3", "inbox", "alice", 3000, 4000)...)
	if f.field("bob", "time_entry", "e3", "started_at") != "<none>" {
		t.Fatal("bob sees alice's personal entry")
	}
	// A forged user_id and an unknown task are refused.
	if res := f.apply("bob", "B", f.entryOps("e4", "t1", "alice", 5000, 6000)...); res.Applied != 0 {
		t.Fatalf("forged = %+v", res)
	}
	if res := f.apply("bob", "B", f.entryOps("e5", "nope", "bob", 5000, 6000)...); res.Applied != 0 {
		t.Fatalf("unknown task = %+v", res)
	}
	// Sharing a project later carries its tasks' entries into the new scope.
	f.apply("alice", "A", f.op("project", "q", "name", `"Later"`), f.op("task", "tq", "title", `"Q"`), f.op("task", "tq", "project_id", `"q"`))
	f.apply("alice", "A", f.entryOps("eq", "tq", "alice", 7000, 8000)...)
	if _, err := f.s.AddMember(f.ctx, "alice", "q", "bob", RoleViewer); err != nil {
		t.Fatal(err)
	}
	if f.field("bob", "time_entry", "eq", "started_at") != "7000" {
		t.Fatal("entry not relabelled on first share")
	}
}

func TestTimeEntryOfAnotherMemberIsReadOnly(t *testing.T) {
	t.Parallel()
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	f.add("alice", "carol", RoleAdmin)
	f.apply("bob", "B", f.entryOps("e1", "t1", "bob", 1000, 61000)...)
	for _, who := range []string{"alice", "carol"} {
		res := f.apply(who, "X", f.op("time_entry", "e1", "ended_at", `99000`))
		if len(res.Rejected) != 1 || res.Rejected[0].Reason != ReasonForbidden {
			t.Fatalf("%s edit = %+v", who, res)
		}
		if len(res.Restore) != 1 || string(res.Restore[0].Value) != `61000` {
			t.Fatalf("restore = %+v", res.Restore)
		}
	}
	// user_id and task_id are fixed, even for the author.
	if res := f.apply("bob", "B", f.op("time_entry", "e1", "user_id", `"carol"`)); len(res.Rejected) != 1 {
		t.Fatalf("user change = %+v", res)
	}
	if res := f.apply("bob", "B", f.op("time_entry", "e1", "task_id", `"t2"`)); len(res.Rejected) != 1 {
		t.Fatalf("task change = %+v", res)
	}
	// The author edits; the admin may delete.
	if res := f.apply("bob", "B", f.op("time_entry", "e1", "note", `"review"`)); len(res.Rejected) != 0 {
		t.Fatalf("author edit = %+v", res)
	}
	if res := f.apply("carol", "C", f.op("time_entry", "e1", "deleted_at", `5000`)); len(res.Rejected) != 0 {
		t.Fatalf("admin delete = %+v", res)
	}
}

func TestViewerCannotTrack(t *testing.T) {
	t.Parallel()
	f := newSharing(t)
	f.add("alice", "bob", RoleViewer)
	res := f.apply("bob", "B", f.entryOps("e1", "t1", "bob", 1000, 2000)...)
	if res.Applied != 0 || len(res.Rejected) != 7 || res.Rejected[0].Reason != ReasonForbidden {
		t.Fatalf("viewer entry = %+v", res)
	}
	if f.field("alice", "time_entry", "e1", "started_at") != "<none>" {
		t.Fatal("viewer entry stored")
	}
	_, err := f.s.ApplyStrict(f.ctx, "bob", withDevice(f.entryOps("e2", "t1", "bob", 1000, 2000)))
	var rej *RejectedError
	if !errors.As(err, &rej) || rej.Reason != ReasonForbidden {
		t.Fatalf("strict = %v", err)
	}
}

func TestTimeEntriesGoWithTheTask(t *testing.T) {
	t.Parallel()
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	for i, who := range []string{"alice", "alice", "alice", "bob"} {
		id := []string{"e1", "e2", "e3", "e4"}[i]
		if res := f.apply(who, "D"+who, f.entryOps(id, "t1", who, int64(1000*(i+1)), int64(1000*(i+2)))...); len(res.Rejected) != 0 {
			t.Fatalf("%s: %v", id, res.Rejected)
		}
	}
	f.apply("alice", "A", f.op("task", "t1", "deleted_at", `9000`))
	pr, err := f.s.Purge(f.ctx, "alice", "task", []string{"t1"})
	if err != nil || pr.TimeEntries != 4 {
		t.Fatalf("purge = %+v, %v", pr, err)
	}
	list, _ := f.s.List(f.ctx, "alice", "time_entry", true)
	if len(list) != 0 {
		t.Fatalf("entries left: %v", list)
	}
	var markers int
	f.s.db.QueryRow(`SELECT COUNT(*) FROM purges WHERE entity='time_entry'`).Scan(&markers)
	if markers != 4 {
		t.Fatalf("markers = %d", markers)
	}
	// Late entry ops for the purged task are discarded.
	res := f.apply("bob", "B", f.entryOps("e5", "t1", "bob", 1000, 2000)...)
	if res.Applied != 0 || len(res.Rejected) != 0 || res.Duplicates != 7 {
		t.Fatalf("late entry = %+v", res)
	}
}
