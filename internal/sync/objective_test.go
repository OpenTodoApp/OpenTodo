package sync

import (
	"context"
	"slices"
	"strings"
	"testing"
)

// plan-objectives 1.1 ("Objective entity", Invalid period): a quarter or a week
// is accepted, a month, "" or words are refused; a title is one line of 1 to
// 140 characters, or ciphertext.
func TestObjectiveValidation(t *testing.T) {
	ok := map[string][2]string{
		"quarter":    {"period", `"2026-Q4"`},
		"week":       {"period", `"2026-W44"`},
		"title":      {"title", `"Ship the 1.0 release"`},
		"140 chars":  {"title", `"` + strings.Repeat("é", 140) + `"`},
		"ciphertext": {"title", `"enc:v1:` + strings.Repeat("A", 400) + `"`},
	}
	for name, fv := range ok {
		if err := Validate(op("x", "objective", "o1", fv[0], fv[1], 100, "A")); err != nil {
			t.Errorf("%s refused: %v", name, err)
		}
	}
	bad := map[string][2]string{
		"month":       {"period", `"2026-11"`},
		"empty":       {"period", `""`},
		"words":       {"period", `"this week"`},
		"null period": {"period", `null`},
		"empty title": {"title", `"   "`},
		"141 chars":   {"title", `"` + strings.Repeat("x", 141) + `"`},
		"two lines":   {"title", `"one\ntwo"`},
		"null title":  {"title", `null`},
		"number":      {"title", `1`},
	}
	for name, fv := range bad {
		if err := Validate(op("x", "objective", "o1", fv[0], fv[1], 100, "A")); err == nil {
			t.Errorf("%s accepted", name)
		}
	}
}

// "Objective entity": personal (another member never receives it, nor writes
// its id) and each field converges by its own last write (Concurrent edits).
func TestObjectiveIsPersonalAndConverges(t *testing.T) {
	ctx := context.Background()
	f := newSharing(t)
	f.add("alice", "bob", "editor")
	f.apply("alice", "A", f.op("objective", "ob-a", "title", `"Finish the grant"`), f.op("objective", "ob-a", "period", `"2026-W44"`))
	ops, _ := f.pullAll("bob", "B", 0)
	for _, o := range ops {
		if o.Entity == "objective" {
			t.Fatalf("bob received an objective op: %+v", o)
		}
	}
	if res := f.apply("bob", "B", f.op("objective", "ob-a", "title", `"Mine"`)); res.Applied != 0 {
		t.Fatalf("bob wrote alice's objective id: %+v", res)
	}
	if got := f.scopesOf("objective", "ob-a"); !slices.Equal(got, []string{"user:alice"}) {
		t.Fatalf("objective lives in %v", got)
	}

	s := newTestService(t)
	mustApply(t, s, "u1", op("c1", "objective", "o1", "title", `"Draft the talk"`, 100, "phone"))
	mustApply(t, s, "u1", op("c2", "objective", "o1", "period", `"2026-Q4"`, 100, "phone"))
	// The phone marks it done; the laptop, offline, renames it earlier and syncs later.
	mustApply(t, s, "u1", op("p1", "objective", "o1", "done_at", `1700000000000`, 300, "phone"))
	mustApply(t, s, "u1", op("l1", "objective", "o1", "title", `"Give the talk"`, 250, "laptop"))
	e, err := s.Get(ctx, "u1", "objective", "o1")
	if err != nil || e == nil {
		t.Fatal(e, err)
	}
	if string(e["title"]) != `"Give the talk"` || string(e["done_at"]) != `1700000000000` {
		t.Fatalf("objective = %v", e)
	}
}
