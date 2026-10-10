package sync

import (
	"context"
	"errors"
	"slices"
	"testing"
)

// Task assignment (OpenSpec change `task-assignment`).

func TestValidateAcceptsAssigneeId(t *testing.T) {
	for i, g := range []Op{
		op("1", "task", "t1", "assignee_id", `"bob"`, 1, "A"),
		op("2", "task", "t1", "assignee_id", `null`, 1, "A"),
	} {
		if err := Validate(g); err != nil {
			t.Errorf("case %d should pass: %v", i, err)
		}
	}
	for i, b := range []Op{
		op("1", "task", "t1", "assignee_id", `42`, 1, "A"),
		op("2", "task", "t1", "assignee_id", `["bob"]`, 1, "A"),
		op("3", "project", "p", "assignee_id", `"bob"`, 1, "A"),
	} {
		if err := Validate(b); err == nil {
			t.Errorf("case %d should fail", i)
		}
	}
}

func TestAssignToNonMemberIsRejected(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	f.apply("alice", "A", f.op("task", "t1", "assignee_id", `"bob"`))
	bad := f.op("task", "t1", "assignee_id", `"carol"`)
	res := f.apply("bob", "B", bad, f.op("task", "t2", "assignee_id", `"alice"`))
	if !slices.Equal(rejectedIDs(res), []string{bad.ID + ":" + ReasonNotAMember}) || res.Applied != 1 {
		t.Fatalf("rejected = %v applied %d", rejectedIDs(res), res.Applied)
	}
	if len(res.Restore) != 1 || string(res.Restore[0].Value) != `"bob"` || res.Restore[0].Field != "assignee_id" {
		t.Fatalf("restore = %+v", res.Restore)
	}
	for _, u := range []string{"alice", "bob"} {
		if got := f.field(u, "task", "t1", "assignee_id"); got != `"bob"` {
			t.Fatalf("%s sees assignee %s", u, got)
		}
		if got := f.field(u, "task", "t2", "assignee_id"); got != `"alice"` {
			t.Fatalf("%s sees t2 assignee %s", u, got)
		}
	}
	// Unassigning is always allowed for writers; a new task created with an
	// assignee in the same batch is validated against its destination scope.
	if res := f.apply("bob", "B", f.op("task", "t1", "assignee_id", `null`),
		f.op("task", "n1", "title", `"New"`), f.op("task", "n1", "project_id", `"p"`), f.op("task", "n1", "assignee_id", `"bob"`)); len(res.Rejected) != 0 {
		t.Fatalf("unassign/new = %v", rejectedIDs(res))
	}
	// Strict (REST) batches refuse as a whole with the same reason.
	_, err := f.s.ApplyStrict(f.ctx, "alice", []Op{{ID: "strict-1", Entity: "task", EntityID: "t1", Field: "assignee_id", Value: []byte(`"mallory"`), TS: 5000, Device: ServerDevice}})
	var rej *RejectedError
	if !errors.As(err, &rej) || rej.Reason != ReasonNotAMember {
		t.Fatalf("strict err = %v", err)
	}
}

func TestPersonalTaskAssigneeMustBeOwner(t *testing.T) {
	f := newSharing(t)
	bad := f.op("task", "inbox", "assignee_id", `"bob"`)
	ok := f.op("task", "inbox", "assignee_id", `"alice"`)
	res := f.apply("alice", "A", bad)
	if !slices.Equal(rejectedIDs(res), []string{bad.ID + ":" + ReasonNotAMember}) {
		t.Fatalf("rejected = %v", rejectedIDs(res))
	}
	if res := f.apply("alice", "A", ok); res.Applied != 1 {
		t.Fatalf("self-assign = %+v", res)
	}
	// An unshared project is personal too.
	if res := f.apply("alice", "A", f.op("task", "t9", "project_id", `"secret"`), f.op("task", "t9", "assignee_id", `"carol"`)); len(res.Rejected) != 1 {
		t.Fatalf("unshared project = %v", rejectedIDs(res))
	}
}

func TestViewerAssignmentIsForbidden(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleViewer)
	a := f.op("task", "t1", "assignee_id", `"bob"`)
	res := f.apply("bob", "B", a)
	if !slices.Equal(rejectedIDs(res), []string{a.ID + ":" + ReasonForbidden}) {
		t.Fatalf("rejected = %v", rejectedIDs(res))
	}
	if got := f.field("alice", "task", "t1", "assignee_id"); got != "" {
		t.Fatalf("assignee = %s", got)
	}
}

func TestRemovingMemberUnassignsTheirTasks(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	f.add("alice", "carol", RoleEditor)
	var observed []Change
	f.s.SetObserver(func(_ context.Context, ch []Change) { observed = append(observed, ch...) })
	f.apply("alice", "A",
		f.op("task", "t1", "assignee_id", `"bob"`),
		f.op("task", "t2", "assignee_id", `"carol"`),
		f.op("task", "t3", "title", `"Eggs"`), f.op("task", "t3", "project_id", `"p"`), f.op("task", "t3", "assignee_id", `"bob"`),
	)
	_, carolCursor := f.pullAll("carol", "C", 0)
	observed = nil
	ch, err := f.s.RemoveMember(f.ctx, "alice", "p", "bob")
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(ch.Unassigned, []string{"t1", "t3"}) {
		t.Fatalf("unassigned = %v", ch.Unassigned)
	}
	for _, id := range []string{"t1", "t3"} {
		if got := f.field("alice", "task", id, "assignee_id"); got != "null" {
			t.Fatalf("%s assignee = %s", id, got)
		}
	}
	if got := f.field("alice", "task", "t2", "assignee_id"); got != `"carol"` {
		t.Fatalf("t2 assignee = %s", got)
	}
	// Other members receive server-authored unassign ops on their next pull.
	ops, _ := f.pullAll("carol", "C", carolCursor)
	if len(ops) != 2 {
		t.Fatalf("carol pulled %d ops: %+v", len(ops), ops)
	}
	for _, o := range ops {
		if o.Field != "assignee_id" || string(o.Value) != "null" || o.Device != ServerDevice {
			t.Fatalf("pulled %+v", o)
		}
	}
	if len(observed) != 2 {
		t.Fatalf("observer saw %d changes", len(observed))
	}
	// Leaving does the same.
	f.apply("alice", "A", f.op("task", "t2", "title", `"Rye"`))
	ch, err = f.s.RemoveMember(f.ctx, "carol", "p", "carol")
	if err != nil || !slices.Equal(ch.Unassigned, []string{"t2"}) {
		t.Fatalf("leave = %+v, %v", ch, err)
	}
}

func TestOfflineAssignmentToDepartedMemberConverges(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	f.add("alice", "carol", RoleEditor)
	f.apply("alice", "A", f.op("task", "t1", "assignee_id", `"bob"`))
	// Carol assigns t2 to bob while offline; meanwhile bob leaves.
	queued := f.op("task", "t2", "assignee_id", `"bob"`)
	if _, err := f.s.RemoveMember(f.ctx, "bob", "p", "bob"); err != nil {
		t.Fatal(err)
	}
	res := f.apply("carol", "C", queued)
	if !slices.Equal(rejectedIDs(res), []string{queued.ID + ":" + ReasonNotAMember}) {
		t.Fatalf("rejected = %v", rejectedIDs(res))
	}
	// An offline device with an older assignment to bob on t1 loses to the server op.
	stale := f.op("task", "t1", "assignee_id", `"carol"`)
	stale.TS = 1 // older than the server's unassignment
	f.apply("carol", "C2", stale)
	for _, u := range []string{"alice", "carol"} {
		if got := f.field(u, "task", "t1", "assignee_id"); got != "null" {
			t.Fatalf("%s sees t1 assignee %s", u, got)
		}
		if got := f.field(u, "task", "t2", "assignee_id"); got != "" && got != "null" {
			t.Fatalf("%s sees t2 assignee %s", u, got)
		}
	}
}
