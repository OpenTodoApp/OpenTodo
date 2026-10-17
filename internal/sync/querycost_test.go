package sync

import (
	"context"
	"fmt"
	"slices"
	"testing"
	"time"
)

// Query costs (OpenSpec change `server-query-costs`): each test counts the
// statements one call sends, so a cost that grows with the data shows up as a
// failure rather than as a slow server.

func newCountingSharing(t testing.TB) (*sharingFixture, *queryLog) {
	t.Helper()
	s, log := newCountingService(t)
	tt, _ := t.(*testing.T)
	f := &sharingFixture{t: tt, ctx: context.Background(), s: s, ts: 1000}
	for _, u := range []string{"alice", "bob", "carol"} {
		if _, err := s.db.Exec(`INSERT INTO users(id,email,name,password_hash,created_at) VALUES(?,?,?,'h',1)`, u, u+"@example.com", u); err != nil {
			t.Fatal(err)
		}
	}
	return f, log
}

func TestMembershipsCostDoesNotGrowWithProjects(t *testing.T) {
	f, log := newCountingSharing(t)
	const n = 20
	for i := range n {
		pid := fmt.Sprintf("p%02d", i)
		f.apply("alice", "A", f.op("project", pid, "name", `"P"`))
		if _, err := f.s.AddMember(f.ctx, "alice", pid, "bob", RoleEditor); err != nil {
			t.Fatal(err)
		}
	}
	log.reset()
	ms, err := f.s.Memberships(f.ctx, "bob")
	if err != nil {
		t.Fatal(err)
	}
	if len(ms) != n {
		t.Fatalf("memberships = %d", len(ms))
	}
	for i, m := range ms {
		if m.ProjectID != fmt.Sprintf("p%02d", i) || len(m.Members) != 2 || m.Members[0].UserID != "alice" || m.Members[0].Role != RoleOwner ||
			m.Members[1].UserID != "bob" || m.Members[1].Email != "bob@example.com" {
			t.Fatalf("membership %d = %+v", i, m)
		}
	}
	q := log.count("")
	t.Logf("Memberships, %d projects: %d statements", n, q)
	if q > 2 {
		t.Fatalf("Memberships for %d projects ran %d statements, want at most 2", n, q)
	}
}

func TestPublicProjectCostDoesNotGrowWithTasks(t *testing.T) {
	f, log := newCountingSharing(t)
	const n = 200
	ops := []Op{f.op("project", "p", "name", `"Home"`)}
	for i := range 5 {
		id := fmt.Sprintf("s%d", i)
		ops = append(ops, f.op("section", id, "name", `"S"`), f.op("section", id, "project_id", `"p"`))
	}
	ops = append(ops, f.op("section", "s0", "deleted_at", `7`))
	now := time.UnixMilli(10_000_000_000)
	for i := range n {
		id := fmt.Sprintf("t%03d", i)
		ops = append(ops, f.op("task", id, "title", `"T"`), f.op("task", id, "project_id", `"p"`))
		switch i % 10 {
		case 1:
			ops = append(ops, f.op("task", id, "deleted_at", `5`))
		case 2:
			ops = append(ops, f.op("task", id, "completed_at", "1"))
		case 3:
			ops = append(ops, f.op("task", id, "completed_at", fmt.Sprint(now.UnixMilli()-1000)))
		}
	}
	f.apply("alice", "A", ops...)
	log.reset()
	pp, ok, err := f.s.PublicProject(f.ctx, "alice", "p", now)
	if err != nil || !ok {
		t.Fatalf("public project = %v %v", ok, err)
	}
	if len(pp.Sections) != 4 || len(pp.Tasks) != n-2*n/10 {
		t.Fatalf("sections %d tasks %d", len(pp.Sections), len(pp.Tasks))
	}
	var ids []string
	for _, e := range pp.Tasks {
		ids = append(ids, string(e["id"]))
	}
	if !slices.IsSorted(ids) || string(pp.Tasks[0]["title"]) != `"T"` {
		t.Fatalf("tasks out of order or incomplete: %v", pp.Tasks[0])
	}
	q := log.count("")
	t.Logf("PublicProject, %d tasks: %d statements", n, q)
	if q > 6 {
		t.Fatalf("PublicProject with %d tasks ran %d statements, want at most 6", n, q)
	}
}

func TestBlockedByGraphReadOncePerBatch(t *testing.T) {
	f, log := newCountingSharing(t)
	const n = 100
	var ops []Op
	for i := range n {
		ops = append(ops, f.op("task", fmt.Sprintf("t%03d", i), "title", `"T"`))
	}
	f.apply("alice", "A", ops...)
	ops = nil
	for i := 1; i < n; i++ {
		ops = append(ops, f.op("task", fmt.Sprintf("t%03d", i), "blocked_by", fmt.Sprintf(`["t%03d"]`, i-1)))
	}
	// Closing the chain is a cycle through every edge written in this batch.
	bad := f.op("task", "t000", "blocked_by", fmt.Sprintf(`["t%03d"]`, n-1))
	ops = append(ops, bad)
	log.reset()
	res := f.apply("alice", "A", ops...)
	if res.Applied != n-1 || !slices.Equal(rejectedIDs(res), []string{bad.ID + ":" + ReasonCycle}) {
		t.Fatalf("applied %d rejected %v", res.Applied, rejectedIDs(res))
	}
	q := log.count("field = 'blocked_by'")
	t.Logf("%d blocked_by ops: %d graph reads", n, q)
	if q > 1 {
		t.Fatalf("a batch of %d blocked_by ops read the dependency graph %d times, want once", n, q)
	}
}

// The in-memory graph follows last-writer-wins: an op that loses to the stored
// value leaves the stored edge in place, one that wins replaces it.
func TestBlockedByBatchGraphFollowsLastWriterWins(t *testing.T) {
	f := newSharing(t)
	f.apply("alice", "A", f.op("task", "t1", "blocked_by", `["t2"]`))
	stale := f.op("task", "t1", "blocked_by", `[]`)
	stale.TS = 1
	bad := f.op("task", "t2", "blocked_by", `["t1"]`)
	if res := f.apply("alice", "A", stale, bad); !slices.Equal(rejectedIDs(res), []string{bad.ID + ":" + ReasonCycle}) {
		t.Fatalf("losing op cleared the edge: rejected %v", rejectedIDs(res))
	}
	clear := f.op("task", "t1", "blocked_by", `[]`)
	good := f.op("task", "t2", "blocked_by", `["t1"]`)
	if res := f.apply("alice", "A", clear, good); res.Applied != 2 || len(res.Rejected) != 0 {
		t.Fatalf("winning op kept the edge: %+v", res)
	}
}

// BenchmarkBlockedByBatch saves 1,000 dependencies in one batch on a scope of
// 10,000 tasks (CORE-3). Run with -benchtime=1x.
func BenchmarkBlockedByBatch(b *testing.B) {
	f, _ := newCountingSharing(b)
	const tasks, deps = 10_000, 1_000 // deps: one full batch (MaxOpsPerRequest)
	for start := 0; start < tasks; start += 200 {
		var ops []Op
		for i := start; i < start+200; i++ {
			id := fmt.Sprintf("t%05d", i)
			ops = append(ops, f.op("task", id, "title", `"T"`), f.op("task", id, "created_at", "1"), f.op("task", id, "priority", "4"),
				f.op("task", id, "labels", "[]"), f.op("task", id, "description", `"x"`))
		}
		for i := range ops {
			ops[i].Device = "A"
		}
		if _, err := f.s.Apply(f.ctx, "alice", ops); err != nil {
			b.Fatal(err)
		}
	}
	b.ResetTimer()
	for range b.N {
		b.StopTimer()
		var ops []Op
		for i := 1; i <= deps; i++ {
			o := f.op("task", fmt.Sprintf("t%05d", i), "blocked_by", fmt.Sprintf(`["t%05d"]`, i-1))
			o.Device = "A"
			ops = append(ops, o)
		}
		b.StartTimer()
		res, err := f.s.Apply(f.ctx, "alice", ops)
		if err != nil || res.Applied != deps {
			b.Fatalf("%+v %v", res, err)
		}
	}
}

// BenchmarkScopeBlockedGraph reads the dependency graph of a 10,000-task scope
// with 100 dependencies (what every batch that completes a task does after it
// commits, to find the tasks it unblocked).
func BenchmarkScopeBlockedGraph(b *testing.B) {
	f, _ := newCountingSharing(b)
	for start := 0; start < 10_000; start += 100 {
		var ops []Op
		for i := start; i < start+100; i++ {
			id := fmt.Sprintf("t%05d", i)
			ops = append(ops, f.op("task", id, "title", `"T"`), f.op("task", id, "created_at", "1"), f.op("task", id, "priority", "4"),
				f.op("task", id, "labels", "[]"), f.op("task", id, "description", `"x"`))
			if i%100 == 1 {
				ops = append(ops, f.op("task", id, "blocked_by", fmt.Sprintf(`["t%05d"]`, i-1)))
			}
		}
		for i := range ops {
			ops[i].Device = "A"
		}
		if _, err := f.s.Apply(f.ctx, "alice", ops); err != nil {
			b.Fatal(err)
		}
	}
	b.ResetTimer()
	for range b.N {
		g, err := f.s.scopeBlockedGraph(f.ctx, PersonalScope("alice"))
		if err != nil || len(g) != 100 {
			b.Fatalf("%d %v", len(g), err)
		}
	}
}
