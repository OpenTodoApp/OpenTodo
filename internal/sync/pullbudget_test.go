package sync

import (
	"context"
	"fmt"
	"slices"
	"testing"
)

// valueBytes sums the op values of a page, the quantity MaxPullBytes bounds.
func valueBytes(ops []Op) int {
	n := 0
	for _, o := range ops {
		n += len(o.Value)
	}
	return n
}

// A pull page stops at the byte budget with hasMore, and draining it delivers
// every op exactly once (harden-server-edges).
func TestPullRespectsByteBudget(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	doc := jsonString(docValue(t, MaxDocBytes))
	var ops []Op
	const tasks = 20 // 20 x 256 KB notes: more than one 4 MB page
	for i := 0; i < tasks; i++ {
		id := fmt.Sprintf("t%02d", i)
		ops = append(ops,
			op("title-"+id, "task", id, "title", `"Note"`, int64(100+i), "A"),
			Op{ID: "doc-" + id, Entity: "task", EntityID: id, Field: "notes_doc", Value: doc, TS: int64(100 + i), Device: "A"})
	}
	if _, err := s.Apply(ctx, "u1", ops); err != nil {
		t.Fatal(err)
	}
	first, cursor, more, err := s.Pull(ctx, "u1", 0, "B", MaxOpsPerRequest)
	if err != nil {
		t.Fatal(err)
	}
	if !more || len(first) == 0 || len(first) >= len(ops) {
		t.Fatalf("first page: %d ops, more=%v", len(first), more)
	}
	if n := valueBytes(first); n > MaxPullBytes {
		t.Fatalf("first page carries %d value bytes, budget %d", n, MaxPullBytes)
	}
	seen := map[string]int{}
	for _, o := range first {
		seen[o.ID]++
	}
	for i := 0; more; i++ {
		if i > 10 {
			t.Fatal("pull never finished")
		}
		var page []Op
		next := cursor
		page, next, more, err = s.Pull(ctx, "u1", cursor, "B", MaxOpsPerRequest)
		if err != nil {
			t.Fatal(err)
		}
		if next <= cursor {
			t.Fatalf("cursor did not advance: %d -> %d", cursor, next)
		}
		if n := valueBytes(page); n > MaxPullBytes {
			t.Fatalf("page carries %d value bytes", n)
		}
		for _, o := range page {
			seen[o.ID]++
		}
		cursor = next
	}
	if len(seen) != len(ops) {
		t.Fatalf("received %d distinct ops, want %d", len(seen), len(ops))
	}
	for id, n := range seen {
		if n != 1 {
			t.Fatalf("op %s delivered %d times", id, n)
		}
	}
}

// An op larger than the whole budget still travels, alone, so a device always
// makes progress; the device's own ops are skipped without counting.
func TestPullMakesProgressWithOversizedOp(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	s.pullBudget = 10
	if _, err := s.Apply(ctx, "u1", []Op{
		op("own", "task", "t0", "title", `"written by this device"`, 99, "B"),
		op("big1", "task", "t1", "title", `"a title far longer than ten bytes"`, 100, "A"),
		op("big2", "task", "t2", "title", `"another long title"`, 101, "A"),
		op("small", "task", "t3", "priority", `1`, 102, "A"),
	}); err != nil {
		t.Fatal(err)
	}
	var got [][]string
	cursor := int64(0)
	for more := true; more; {
		page, next, m, err := s.Pull(ctx, "u1", cursor, "B", MaxOpsPerRequest)
		if err != nil {
			t.Fatal(err)
		}
		if next <= cursor {
			t.Fatalf("no progress at cursor %d", cursor)
		}
		var ids []string
		for _, o := range page {
			ids = append(ids, o.ID)
		}
		got = append(got, ids)
		cursor, more = next, m
	}
	want := [][]string{{"big1"}, {"big2"}, {"small"}}
	if len(got) != len(want) {
		t.Fatalf("pages = %v, want %v", got, want)
	}
	for i := range want {
		if !slices.Equal(got[i], want[i]) {
			t.Fatalf("pages = %v, want %v", got, want)
		}
	}
}

// The history replay of a newly joined project is paged by the same budget.
func TestBackfillRespectsByteBudget(t *testing.T) {
	f := newSharing(t)
	// Bob's device is up to date with his own data, so its cursor is past the
	// project's history when he joins.
	for i := 0; i < 4; i++ {
		f.apply("bob", "B", f.op("task", fmt.Sprintf("b%d", i), "title", `"mine"`))
	}
	_, c1 := f.pullAll("bob", "B1", 0)
	f.add("alice", "bob", RoleEditor)
	f.s.pullBudget = 1 // every page carries exactly one op
	var history []Op
	for i := 0; i < 20; i++ {
		ops, next, more, err := f.s.Pull(f.ctx, "bob", c1, "B1", MaxOpsPerRequest)
		if err != nil {
			t.Fatal(err)
		}
		if !more {
			// Replay finished and the regular pull has nothing new.
			if len(ops) != 0 || next != c1 {
				t.Fatalf("after replay: %d ops, cursor %d -> %d", len(ops), c1, next)
			}
			break
		}
		if len(ops) != 1 || next != c1 {
			t.Fatalf("history page: %d ops, cursor %d -> %d", len(ops), c1, next)
		}
		history = append(history, ops...)
	}
	ids := entityIDs(history)
	if !slices.Equal(ids, []string{"p", "t1", "t2"}) {
		t.Fatalf("replayed %v", ids)
	}
}
