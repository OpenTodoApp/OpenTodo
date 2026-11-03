package sync

import (
	"context"
	"testing"
)

// A departure that hands a rotating task on tells the next person it is their
// turn (OpenSpec change rotation-handoff-notice).

func TestDepartureAnnouncesTheTurn(t *testing.T) {
	f := house(t)
	f.apply("alice", "A",
		f.op("task", "t1", "assignee_id", `"bob"`),
		f.op("task", "t2", "title", `"Dishes"`), f.op("task", "t2", "assignee_id", `"bob"`),
	)
	rec := &recordingSink{s: f.s}
	f.s.AddSink(rec)
	if _, err := f.s.RemoveMember(f.ctx, "bob", "p", "bob"); err != nil {
		t.Fatal(err)
	}
	// t1 goes to carol as her turn; t2 is only unassigned: nobody is told.
	if len(rec.events) != 1 {
		t.Fatalf("events = %+v", rec.events)
	}
	e := rec.events[0]
	if e.AssigneeID != "carol" || e.TaskID != "t1" || !e.Turn || e.ActorID != "bob" || e.ProjectID != "p" {
		t.Fatalf("event = %+v", e)
	}
}

func TestDepartureTurnNotToTheActor(t *testing.T) {
	f := house(t)
	f.apply("alice", "A", f.op("task", "t1", "assignee_id", `"carol"`))
	rec := &recordingSink{s: f.s}
	f.s.AddSink(rec)
	// alice removes carol; the turn after carol is alice's own.
	if _, err := f.s.RemoveMember(f.ctx, "alice", "p", "carol"); err != nil {
		t.Fatal(err)
	}
	if got := f.field("alice", "task", "t1", "assignee_id"); got != `"alice"` {
		t.Fatalf("assignee = %s", got)
	}
	if len(rec.events) != 0 {
		t.Fatalf("events = %+v", rec.events)
	}
}

func TestAccountDeletionAnnouncesTheTurn(t *testing.T) {
	f := house(t)
	f.apply("alice", "A", f.op("task", "t1", "assignee_id", `"bob"`))
	rec := &recordingSink{s: f.s}
	f.s.AddSink(rec)
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
	if len(rec.events) != 0 {
		t.Fatalf("told before the commit was observed: %+v", rec.events)
	}
	f.s.ObserveAccountDeletion(context.Background(), deletion)
	if len(rec.events) != 1 || rec.events[0].AssigneeID != "carol" || !rec.events[0].Turn || rec.events[0].ActorID != "alice" {
		t.Fatalf("events = %+v", rec.events)
	}
}
