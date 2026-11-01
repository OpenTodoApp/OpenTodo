package sync

import (
	"context"
	"testing"
)

// automation-rules "Rule entity": a rule is personal, its trigger, condition and
// actions converge whole, and other fields per field.
func TestRuleIsPersonalAndConvergesWhole(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	mustApply(t, s, "u1",
		op("r1", "rule", "rl1", "name", `"Waiting"`, 100, "A"),
		op("r2", "rule", "rl1", "enabled", `true`, 100, "A"),
		op("r3", "rule", "rl1", "trigger", `{"kind":"label.added","label_id":"waiting"}`, 100, "A"),
		op("r4", "rule", "rl1", "condition", `null`, 100, "A"),
		op("r5", "rule", "rl1", "actions", `{"priority":3}`, 100, "A"),
		op("r6", "rule", "rl1", "created_at", `100`, 100, "A"),
	)
	// "Concurrent edits to different fields": a rename and a switch both survive.
	mustApply(t, s, "u1", op("a1", "rule", "rl1", "name", `"Waiting room"`, 200, "A"))
	mustApply(t, s, "u1", op("b1", "rule", "rl1", "enabled", `false`, 210, "B"))
	// "Concurrent edits to the actions": the later set wins whole.
	mustApply(t, s, "u1", op("a2", "rule", "rl1", "actions", `{"priority":1}`, 300, "A"))
	mustApply(t, s, "u1", op("b2", "rule", "rl1", "actions", `{"add_labels":["errand"]}`, 250, "B"))
	e, err := s.Get(ctx, "u1", "rule", "rl1")
	if err != nil {
		t.Fatal(err)
	}
	if string(e["name"]) != `"Waiting room"` || string(e["enabled"]) != "false" || string(e["actions"]) != `{"priority":1}` {
		t.Fatalf("rule = %s %s %s", e["name"], e["enabled"], e["actions"])
	}
	if other, err := s.List(ctx, "u2", "rule", true); err != nil || len(other) != 0 {
		t.Fatalf("u2 sees %d rules, %v", len(other), err)
	}
}

// "Rule validation": invalid triggers, conditions and actions are refused.
func TestRuleValidationRefuses(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	bad := []struct{ field, value string }{
		{"trigger", `{"kind":"task.starred"}`},
		{"trigger", `{"kind":"schedule","at":"18:00","weekdays":[]}`},
		{"trigger", `{"kind":"schedule","at":"6pm","weekdays":[1]}`},
		{"actions", `{}`},
		{"actions", `{"colour":"red"}`},
		{"condition", `{"title":"x"}`},
		{"trigger", `null`},
	}
	for i, b := range bad {
		res, err := s.Apply(ctx, "u1", []Op{op("bad"+string(rune('a'+i)), "rule", "rl1", b.field, b.value, int64(100+i), "A")})
		if err == nil && len(res.Rejected) == 0 {
			t.Fatalf("%s %s was accepted", b.field, b.value)
		}
	}
	// A null condition is fine.
	mustApply(t, s, "u1", op("ok", "rule", "rl1", "condition", `null`, 500, "A"))
}

// routines-engine "Routine steps": valid steps apply; a reference to a later
// step, a 21st step and an unknown kind are refused; an older value of steps
// loses by last-writer-wins and the value converges whole. actions may be null
// on the sync path (a routine of more than one step stores its card in steps).
func TestRoutineStepsShapeAndLWW(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	steps := `[{"id":"a","kind":"find_tasks","in":{"condition":{"literal":{"due":"today"}}}},{"id":"b","kind":"count","in":{"list":{"ref":"a"}}}]`
	mustApply(t, s, "u1",
		op("s1", "rule", "rl1", "trigger", `{"kind":"manual"}`, 100, "A"),
		op("s2", "rule", "rl1", "actions", `null`, 100, "A"),
		op("s3", "rule", "rl1", "steps", steps, 100, "A"),
	)
	many := "["
	for i := 0; i < 21; i++ {
		if i > 0 {
			many += ","
		}
		many += `{"id":"s` + string(rune('a'+i)) + `","kind":"stop_timer"}`
	}
	many += "]"
	for i, bad := range []string{
		`[{"id":"b","kind":"count","in":{"list":{"ref":"c"}}},{"id":"c","kind":"find_tasks","in":{"condition":{"literal":{"due":"today"}}}}]`,
		many,
		`[{"id":"a","kind":"fetch_url"}]`,
		`{"id":"a"}`,
	} {
		res, err := s.Apply(ctx, "u1", []Op{op("bad"+string(rune('a'+i)), "rule", "rl1", "steps", bad, int64(200+i), "A")})
		if err == nil && len(res.Rejected) == 0 {
			t.Fatalf("steps %d was accepted", i)
		}
	}
	// Device A adds a step at 300, device B's older list (250) loses whole.
	later := `[{"id":"a","kind":"find_tasks","in":{"condition":{"literal":{"due":"today"}}}},{"id":"b","kind":"count","in":{"list":{"ref":"a"}}},{"id":"c","kind":"stop"}]`
	mustApply(t, s, "u1", op("a3", "rule", "rl1", "steps", later, 300, "A"))
	mustApply(t, s, "u1", op("b3", "rule", "rl1", "steps", `[{"id":"z","kind":"stop"}]`, 250, "B"))
	e, err := s.Get(ctx, "u1", "rule", "rl1")
	if err != nil {
		t.Fatal(err)
	}
	if string(e["steps"]) != later {
		t.Fatalf("steps = %s", e["steps"])
	}
}
