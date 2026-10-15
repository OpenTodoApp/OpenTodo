package sync

import (
	"fmt"
	"slices"
	"strings"
	"testing"
)

// Task dependencies (OpenSpec change task-dependencies, tasks 1.1 and 1.2).

func TestValidateBlockedBy(t *testing.T) {
	many := make([]string, MaxBlockedBy+1)
	for i := range many {
		many[i] = fmt.Sprintf(`"t%d"`, i)
	}
	for i, g := range []Op{
		op("1", "task", "t1", "blocked_by", `["t2","t3"]`, 1, "A"),
		op("2", "task", "t1", "blocked_by", `[]`, 1, "A"),
	} {
		if err := Validate(g); err != nil {
			t.Errorf("case %d should pass: %v", i, err)
		}
	}
	for i, b := range []Op{
		op("1", "task", "t1", "blocked_by", `["t2","t2"]`, 1, "A"),
		op("2", "task", "t1", "blocked_by", `[""]`, 1, "A"),
		op("3", "task", "t1", "blocked_by", `["t1"]`, 1, "A"),
		op("4", "task", "t1", "blocked_by", "["+strings.Join(many, ",")+"]", 1, "A"),
		op("5", "task", "t1", "blocked_by", `"t2"`, 1, "A"),
		op("6", "task", "t1", "blocked_by", `null`, 1, "A"),
		op("7", "task", "t1", "blocked_by", `["`+strings.Repeat("x", MaxIDLen+1)+`"]`, 1, "A"),
	} {
		if err := Validate(b); err == nil {
			t.Errorf("case %d should fail", i)
		}
	}
}

func TestBlockedByCycleAcrossBatchesIsRefused(t *testing.T) {
	f := newSharing(t)
	if res := f.apply("alice", "A", f.op("task", "t1", "blocked_by", `["t2"]`)); res.Applied != 1 {
		t.Fatalf("first edge = %+v", res)
	}
	bad := f.op("task", "t2", "blocked_by", `["t1"]`)
	res := f.apply("alice", "B", bad)
	if !slices.Equal(rejectedIDs(res), []string{bad.ID + ":" + ReasonCycle}) {
		t.Fatalf("rejected = %v", rejectedIDs(res))
	}
	// t2 had no list yet: nothing to restore for it, and t1 keeps its edge.
	if got := f.field("alice", "task", "t1", "blocked_by"); got != `["t2"]` {
		t.Fatalf("t1 = %s", got)
	}
	// With a stored value, the restore carries it back.
	f.apply("alice", "A", f.op("task", "t2", "blocked_by", `["inbox-x"]`))
	again := f.op("task", "t2", "blocked_by", `["t1","inbox-x"]`)
	res = f.apply("alice", "B", again)
	if len(res.Rejected) != 1 || len(res.Restore) != 1 || string(res.Restore[0].Value) != `["inbox-x"]` {
		t.Fatalf("restore = %+v rejected %v", res.Restore, rejectedIDs(res))
	}
}

func TestBlockedByCycleInsideOneBatch(t *testing.T) {
	f := newSharing(t)
	a, b := f.op("task", "t1", "blocked_by", `["t2"]`), f.op("task", "t2", "blocked_by", `["t1"]`)
	res := f.apply("alice", "A", a, b)
	if res.Applied != 1 || !slices.Equal(rejectedIDs(res), []string{b.ID + ":" + ReasonCycle}) {
		t.Fatalf("batch = applied %d rejected %v", res.Applied, rejectedIDs(res))
	}
}

func TestBlockedByCycleThroughCompletedTask(t *testing.T) {
	f := newSharing(t)
	f.apply("alice", "A", f.op("task", "t3", "title", `"Done"`), f.op("task", "t3", "project_id", `"p"`), f.op("task", "t3", "completed_at", `5`))
	f.apply("alice", "A", f.op("task", "t1", "blocked_by", `["t3"]`), f.op("task", "t3", "blocked_by", `["t2"]`))
	bad := f.op("task", "t2", "blocked_by", `["t1"]`)
	if res := f.apply("alice", "A", bad); !slices.Equal(rejectedIDs(res), []string{bad.ID + ":" + ReasonCycle}) {
		t.Fatalf("rejected = %v", rejectedIDs(res))
	}
}

func TestBlockedByOtherScopeIsRefusedUnknownAccepted(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	// The Inbox task lives in Alice's personal scope; t1 in the shared project.
	bad := f.op("task", "t1", "blocked_by", `["inbox"]`)
	if res := f.apply("alice", "A", bad); !slices.Equal(rejectedIDs(res), []string{bad.ID + ":" + ReasonNotInScope}) {
		t.Fatalf("rejected = %v", rejectedIDs(res))
	}
	// An id the server has never seen is accepted (it may arrive later).
	if res := f.apply("bob", "B", f.op("task", "t1", "blocked_by", `["later"]`)); res.Applied != 1 || len(res.Rejected) != 0 {
		t.Fatalf("unknown = %+v", res)
	}
	// A task created in the same batch in the same project counts as in scope.
	if res := f.apply("bob", "B", f.op("task", "n1", "title", `"New"`), f.op("task", "n1", "project_id", `"p"`), f.op("task", "t2", "blocked_by", `["n1"]`)); len(res.Rejected) != 0 {
		t.Fatalf("new in batch = %v", rejectedIDs(res))
	}
}
