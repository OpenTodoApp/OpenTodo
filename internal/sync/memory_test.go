package sync

import (
	"context"
	"slices"
	"strings"
	"testing"
)

// assistant-memory 1.1 ("Memory items"): a text is one line of 1 to 200
// characters, or ciphertext.
func TestMemoryValidation(t *testing.T) {
	ok := map[string]string{
		"fact":       `"Does not work on Fridays"`,
		"200 chars":  `"` + strings.Repeat("é", 200) + `"`,
		"ciphertext": `"enc:v1:` + strings.Repeat("A", 600) + `"`,
	}
	for name, v := range ok {
		if err := Validate(op("x", "memory", "m1", "text", v, 100, "A")); err != nil {
			t.Errorf("%s refused: %v", name, err)
		}
	}
	bad := map[string]string{
		"empty":     `"   "`,
		"201 chars": `"` + strings.Repeat("x", 201) + `"`,
		"two lines": `"one\ntwo"`,
		"null":      `null`,
		"number":    `1`,
	}
	for name, v := range bad {
		if err := Validate(op("x", "memory", "m1", "text", v, 100, "A")); err == nil {
			t.Errorf("%s accepted", name)
		}
	}
}

// "Memory items": personal (another member never receives one, nor writes its
// id), and two devices editing different items both keep their edits; one item
// converges by its last write per field, and deletion is a tombstone.
func TestMemoryIsPersonalAndConverges(t *testing.T) {
	ctx := context.Background()
	f := newSharing(t)
	f.add("alice", "bob", "editor")
	f.apply("alice", "A", f.op("memory", "mem-a", "text", `"Anna is my manager"`))
	ops, _ := f.pullAll("bob", "B", 0)
	for _, o := range ops {
		if o.Entity == "memory" {
			t.Fatalf("bob received a memory op: %+v", o)
		}
	}
	if res := f.apply("bob", "B", f.op("memory", "mem-a", "text", `"Mine"`)); res.Applied != 0 {
		t.Fatalf("bob wrote alice's memory id: %+v", res)
	}
	if got := f.scopesOf("memory", "mem-a"); !slices.Equal(got, []string{"user:alice"}) {
		t.Fatalf("memory lives in %v", got)
	}

	s := newTestService(t)
	mustApply(t, s, "u1", op("a1", "memory", "m1", "text", `"Works Monday to Thursday"`, 100, "phone"))
	mustApply(t, s, "u1", op("a2", "memory", "m2", "text", `"Mornings are for deep work"`, 100, "phone"))
	// Offline, the laptop edits m1 and the phone edits m2; both sync later.
	mustApply(t, s, "u1", op("l1", "memory", "m1", "text", `"Works Monday to Wednesday"`, 200, "laptop"))
	mustApply(t, s, "u1", op("p1", "memory", "m2", "text", `"Mornings are for writing"`, 210, "phone"))
	mustApply(t, s, "u1", op("p2", "memory", "m1", "position", `5`, 220, "phone"))
	m1, _ := s.Get(ctx, "u1", "memory", "m1")
	m2, _ := s.Get(ctx, "u1", "memory", "m2")
	if string(m1["text"]) != `"Works Monday to Wednesday"` || string(m1["position"]) != `5` || string(m2["text"]) != `"Mornings are for writing"` {
		t.Fatalf("m1 = %v, m2 = %v", m1, m2)
	}
	mustApply(t, s, "u1", op("d1", "memory", "m2", "deleted_at", `1700000000000`, 300, "laptop"))
	live, err := s.List(ctx, "u1", "memory", false)
	if err != nil || len(live) != 1 || string(live[0]["id"]) != `"m1"` {
		t.Fatalf("live = %v, %v", live, err)
	}
	all, _ := s.List(ctx, "u1", "memory", true)
	if len(all) != 2 {
		t.Fatalf("tombstone gone: %v", all)
	}
}
