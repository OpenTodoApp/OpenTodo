package sync

import (
	"context"
	"errors"
	"slices"
	"testing"
)

// OpenSpec change series-split, task 1.1: "Pieces of one lineage" (the shape,
// the rejections) and two devices making the same piece offline.

func TestSplitFromShape(t *testing.T) {
	for i, v := range []string{`null`, `{"series":"s","date":"2026-10-14"}`} {
		if err := Validate(op("k", "task", "p", "split_from", v, 1, "A")); err != nil {
			t.Errorf("case %d should pass: %v", i, err)
		}
	}
	for i, v := range []string{`"s"`, `{"series":"s"}`, `{"series":"","date":"2026-10-14"}`, `{"series":"s","date":"2026-02-30"}`,
		`{"series":"s","date":"2026-10-14T09:00"}`, `{"series":"s","date":"2026-10-14","by":"x"}`, `{"series":"s","date":null}`} {
		if err := Validate(op("k", "task", "p", "split_from", v, 1, "A")); !errors.Is(err, ErrInvalidOp) {
			t.Errorf("case %d (%s) should fail: %v", i, v, err)
		}
	}
}

func TestSplitFromRejections(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	// On a task without a rule: refused, the task is unchanged.
	res, err := s.Apply(ctx, "u1", []Op{
		op("a1", "task", "plain", "title", `"Plain"`, 100, "A"),
		op("a2", "task", "plain", "split_from", `{"series":"s","date":"2026-10-14"}`, 100, "A"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Rejected) != 1 || res.Rejected[0].Reason != ReasonInvalidSplit {
		t.Fatalf("rejected = %+v, want the split", res.Rejected)
	}
	if e, _ := s.Get(ctx, "u1", "task", "plain"); !IsNull(e["split_from"]) {
		t.Fatalf("split_from = %s on a plain task", e["split_from"])
	}
	// Created with its rule in the same batch (in any order): accepted.
	res, err = s.Apply(ctx, "u1", []Op{
		op("b1", "task", "p", "split_from", `{"series":"s","date":"2026-10-14"}`, 100, "A"),
		op("b2", "task", "p", "recurrence", `"every day"`, 100, "A"),
	})
	if err != nil || len(res.Rejected) != 0 {
		t.Fatalf("piece = %+v, %v", res, err)
	}
	// The same value again is fine; another value or null is refused.
	if res, _ := s.Apply(ctx, "u1", []Op{op("c1", "task", "p", "split_from", `{"date":"2026-10-14","series":"s"}`, 200, "B")}); len(res.Rejected) != 0 {
		t.Fatalf("same value refused: %+v", res.Rejected)
	}
	for i, v := range []string{`{"series":"s","date":"2026-10-15"}`, `{"series":"other","date":"2026-10-14"}`, `null`} {
		res, _ := s.Apply(ctx, "u1", []Op{op("d"+string(rune('0'+i)), "task", "p", "split_from", v, 300, "B")})
		if len(res.Rejected) != 1 || res.Rejected[0].Reason != ReasonInvalidSplit {
			t.Fatalf("change to %s = %+v", v, res.Rejected)
		}
	}
}

func TestSplitFromOtherScopeIsRefused(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	// t1 lives in the shared project; "inbox" in Alice's personal scope.
	f.apply("alice", "A", f.op("task", "t1", "recurrence", `"every day"`))
	bad := f.op("task", "t1", "split_from", `{"series":"inbox","date":"2026-10-14"}`)
	if res := f.apply("alice", "A", bad); !slices.Equal(rejectedIDs(res), []string{bad.ID + ":" + ReasonInvalidSplit}) {
		t.Fatalf("rejected = %v", rejectedIDs(res))
	}
	// A series in the same project is fine.
	f.apply("alice", "A", f.op("task", "t2", "recurrence", `"every day"`))
	if res := f.apply("bob", "B", f.op("task", "t2", "split_from", `{"series":"t1","date":"2026-10-14"}`)); res.Applied != 1 || len(res.Rejected) != 0 {
		t.Fatalf("same scope = %+v", res)
	}
}

// Two devices split the same series at the same date offline, one changing the
// time and the other the title: they write the same piece id, and per-field
// last-writer-wins keeps both changes.
func TestSameSplitOnTwoDevicesConverges(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	id := PieceID("s", "2026-10-14")
	piece := func(dev string, ts int64, title, due string) []Op {
		p := string(rune(dev[0]))
		return []Op{
			op(p+"1", "task", "s", "recurrence", `"every weekday until 2026-10-13"`, ts, dev),
			op(p+"2", "task", id, "recurrence", `"every weekday"`, ts, dev),
			op(p+"3", "task", id, "split_from", `{"series":"s","date":"2026-10-14"}`, ts, dev),
			op(p+"4", "task", id, "title", title, ts, dev),
			op(p+"5", "task", id, "due", due, ts, dev),
		}
	}
	if _, err := s.Apply(ctx, "u1", []Op{op("s0", "task", "s", "title", `"Study"`, 10, "A"), op("s1", "task", "s", "recurrence", `"every weekday"`, 10, "A")}); err != nil {
		t.Fatal(err)
	}
	a := piece("A", 100, `"Study"`, `{"date":"2026-10-14","time":"19:00"}`)
	b := piece("B", 200, `"Spanish"`, `{"date":"2026-10-14","time":"18:00"}`)
	a[4].TS, b[3].TS = 300, 300 // A changed the time last, B the title
	for _, batch := range [][]Op{b, a} {
		if res, err := s.Apply(ctx, "u1", batch); err != nil || len(res.Rejected) != 0 {
			t.Fatalf("apply = %+v, %v", res, err)
		}
	}
	e, _ := s.Get(ctx, "u1", "task", id)
	if string(e["title"]) != `"Spanish"` || string(e["due"]) != `{"date":"2026-10-14","time":"19:00"}` {
		t.Fatalf("piece = title %s due %s, want both changes", e["title"], e["due"])
	}
	tasks, _ := s.List(ctx, "u1", "task", false)
	if n := len(tasks); n != 2 {
		t.Fatalf("%d tasks, want the series and one piece", n)
	}
}
