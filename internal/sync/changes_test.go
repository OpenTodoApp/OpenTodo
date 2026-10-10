package sync

import (
	"context"
	"testing"
)

func TestApplyReportsWinningChangesOnly(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	var got [][]Change
	s.SetObserver(func(_ context.Context, c []Change) { got = append(got, c) })

	// A new task: every field is a change from "absent" (nil) to its value.
	res, err := s.Apply(ctx, "u", []Op{
		op("1", "task", "t1", "title", `"draft"`, 100, "A"),
		op("2", "task", "t1", "created_at", `100`, 100, "A"),
		op("3", "task", "t1", "title", `"final"`, 150, "A"), // coalesced: from absent, to "final"
		op("4", "task", "t1", "completed_at", `null`, 100, "A"),
	})
	if err != nil {
		t.Fatal(err)
	}
	// The realtime cursor is still reported alongside the observer.
	if res.Seq != 4 || res.Applied != 4 {
		t.Fatalf("result = %+v", res)
	}
	if len(got) != 1 || len(got[0]) != 1 {
		t.Fatalf("changes = %+v", got)
	}
	c := got[0][0]
	if c.UserID != "u" || c.Entity != "task" || c.EntityID != "t1" || c.Origin != "A" {
		t.Fatalf("change = %+v", c)
	}
	if fc := c.Fields["title"]; fc.From != nil || string(fc.To) != `"final"` {
		t.Fatalf("title change = %s -> %s", fc.From, fc.To)
	}
	if _, ok := c.Fields["completed_at"]; ok {
		t.Fatal("absent -> null is not a change")
	}

	// A stale op (older than the stored title) emits nothing; a duplicate neither.
	got = nil
	if _, err := s.Apply(ctx, "u", []Op{op("5", "task", "t1", "title", `"stale"`, 120, "B")}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Apply(ctx, "u", []Op{op("3", "task", "t1", "title", `"final"`, 150, "A")}); err != nil {
		t.Fatal(err)
	}
	// A newer op that writes the same value is a LWW winner but not a change.
	if _, err := s.Apply(ctx, "u", []Op{op("6", "task", "t1", "title", `"final"`, 300, "C")}); err != nil {
		t.Fatal(err)
	}
	if len(got) != 0 {
		t.Fatalf("stale/duplicate/same-value ops produced changes: %+v", got)
	}
	// The stale op is still recorded in the log and convergence is unaffected.
	e, _ := s.Get(ctx, "u", "task", "t1")
	if string(e["title"]) != `"final"` {
		t.Fatalf("title = %s", e["title"])
	}

	// A winning update reports the previous value; the losing op in the same batch is ignored.
	if _, err := s.Apply(ctx, "u", []Op{op("7", "task", "t1", "priority", `4`, 200, "A")}); err != nil {
		t.Fatal(err)
	}
	got = nil
	if _, err := s.Apply(ctx, "u", []Op{
		op("8", "task", "t1", "priority", `1`, 400, "phone"),
		op("9", "task", "t1", "priority", `2`, 350, "laptop"),
	}); err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || len(got[0]) != 1 {
		t.Fatalf("changes = %+v", got)
	}
	fc := got[0][0].Fields["priority"]
	if string(fc.From) != `4` || string(fc.To) != `1` || got[0][0].Origin != "phone" {
		t.Fatalf("priority change = %s -> %s origin %s", fc.From, fc.To, got[0][0].Origin)
	}

	// Two entities in one batch give two changes, in first-seen order.
	got = nil
	if _, err := s.Apply(ctx, "u", []Op{
		op("10", "project", "p1", "name", `"Home"`, 500, "A"),
		op("11", "task", "t1", "project_id", `"p1"`, 500, "A"),
	}); err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || len(got[0]) != 2 || got[0][0].Entity != "project" || got[0][1].Entity != "task" {
		t.Fatalf("changes = %+v", got)
	}
}

func TestObserverNotCalledOnFailedBatch(t *testing.T) {
	s := newTestService(t)
	called := false
	s.SetObserver(func(context.Context, []Change) { called = true })
	_, err := s.Apply(context.Background(), "u", []Op{op("1", "task", "t1", "nope", `1`, 1, "A")})
	if err == nil || called {
		t.Fatalf("err = %v, called = %v", err, called)
	}
}

func TestSameJSON(t *testing.T) {
	cases := []struct {
		a, b string
		want bool
	}{
		{`{"date":"2026-10-10"}`, `{ "date": "2026-10-10" }`, true},
		{``, `null`, true},
		{`1`, `2`, false},
		{`["a"]`, `["a","b"]`, false},
	}
	for _, c := range cases {
		if got := SameJSON([]byte(c.a), []byte(c.b)); got != c.want {
			t.Errorf("SameJSON(%q,%q) = %v", c.a, c.b, got)
		}
	}
}
