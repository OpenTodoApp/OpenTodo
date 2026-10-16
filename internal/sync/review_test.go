package sync

import "testing"

// TestReviewIsPersonalAndConverges (stats-and-review D4): the `review` entity
// with the entityId "me" stays in its author's personal scope, reaches only the
// author's other devices, and two finishes converge on the greater (ts, device).
func TestReviewIsPersonalAndConverges(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor) // sharing a project does not share the review

	if res := f.apply("alice", "A", f.op("review", "me", "completed_at", `1000`)); res.Applied != 1 || len(res.Rejected) != 0 {
		t.Fatalf("alice write = %+v", res)
	}
	if got := f.field("alice", "review", "me", "completed_at"); got != `1000` {
		t.Fatalf("alice reads %s", got)
	}
	if got := f.field("bob", "review", "me", "completed_at"); got != "<none>" {
		t.Fatalf("bob sees alice's review: %s", got)
	}
	ops, _ := f.pullAll("bob", "B2", 0)
	for _, o := range ops {
		if o.Entity == "review" {
			t.Fatalf("bob's device received %+v", o)
		}
	}
	got := 0
	all, _ := f.pullAll("alice", "A2", 0)
	for _, o := range all {
		if o.Entity == "review" {
			got++
		}
	}
	if got != 1 {
		t.Fatalf("alice's other device got %d review ops", got)
	}

	// Two devices finish offline; the later op wins in either arrival order.
	early := f.op("review", "me", "completed_at", `2000`)
	late := f.op("review", "me", "completed_at", `3000`)
	f.apply("alice", "A2", late)
	f.apply("alice", "A", early)
	if got := f.field("alice", "review", "me", "completed_at"); got != `3000` {
		t.Fatalf("after concurrent finishes alice reads %s, want 3000", got)
	}
	// Equal timestamps: the device id breaks the tie.
	a := f.op("review", "me", "completed_at", `4000`)
	b := a
	b.ID, b.Value = a.ID+"-b", []byte(`5000`)
	f.apply("alice", "Z", b)
	f.apply("alice", "A", a)
	if got := f.field("alice", "review", "me", "completed_at"); got != `5000` {
		t.Fatalf("tie on ts: alice reads %s, want the greater device's 5000", got)
	}
	// A non-number is refused like any invalid op.
	if err := Validate(f.op("review", "me", "completed_at", `"yesterday"`)); err == nil {
		t.Fatal("a string completed_at validated")
	}
}
