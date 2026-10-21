package sync

import (
	"errors"
	"slices"
	"testing"
)

// TestOpenLoopsFieldsValidate (open-loops-method D2, D4, D5): the method
// preference, the per-project review stamp and the rhythm fields accept their
// kind and refuse another.
func TestOpenLoopsFieldsValidate(t *testing.T) {
	cases := []struct {
		entity, field, ok, bad string
	}{
		{"user_prefs", "method_mode", `"first"`, `3`},
		{"project_prefs", "reviewed_at", `1700000000000`, `"yesterday"`},
		{"review", "daily_at", `1700000000000`, `"today"`},
		{"review", "monthly_at", `1700000000000`, `true`},
		{"review", "focus_date", `"2026-10-18"`, `20261018`},
		{"review", "focus", `"t1,t2,t3"`, `["t1"]`},
		// ux-feedback-2 D1: the latest carry-over as a JSON string.
		{"review", "carry_over", `"{\"date\":\"2026-10-21\",\"items\":[]}"`, `{"date":"2026-10-21"}`},
	}
	for _, c := range cases {
		op := Op{ID: "o", Entity: c.entity, EntityID: "me", Field: c.field, TS: 1, Device: "D"}
		op.Value = []byte(c.ok)
		if err := Validate(op); err != nil {
			t.Errorf("%s.%s = %s refused: %v", c.entity, c.field, c.ok, err)
		}
		op.Value = []byte(c.bad)
		if err := Validate(op); !errors.Is(err, ErrInvalidOp) {
			t.Errorf("%s.%s = %s accepted (err %v)", c.entity, c.field, c.bad, err)
		}
	}
}

// TestReviewStampIsPersonal (open-loops-method D4, weekly-review "Personal review
// stamp per project"): each member's stamp on a shared project stays in their
// own scope and reaches only their own devices.
func TestReviewStampIsPersonal(t *testing.T) {
	f := newSharing(t)
	f.add("alice", "bob", RoleEditor)
	if res := f.apply("alice", "A", f.op("project_prefs", "p", "reviewed_at", `1000`)); res.Applied != 1 || len(res.Rejected) != 0 {
		t.Fatalf("alice stamp = %+v", res)
	}
	if res := f.apply("bob", "B", f.op("project_prefs", "p", "reviewed_at", `4000`)); res.Applied != 1 || len(res.Rejected) != 0 {
		t.Fatalf("bob stamp = %+v", res)
	}
	stamps := func(user, device string) []string {
		ops, _ := f.pullAll(user, device, 0)
		var out []string
		for _, o := range ops {
			if o.Entity == "project_prefs" && o.Field == "reviewed_at" {
				out = append(out, string(o.Value))
			}
		}
		return out
	}
	if got := stamps("alice", "A2"); !slices.Equal(got, []string{"1000"}) {
		t.Fatalf("alice's other device got %v", got)
	}
	if got := stamps("bob", "B2"); !slices.Equal(got, []string{"4000"}) {
		t.Fatalf("bob's other device got %v", got)
	}
}

// TestCarryOverUnknownToOlderSchema (ux-feedback-2, weekly-review "Reopen the
// day", scenario "Older server"): a server whose schema lacks carry_over rejects
// that op as an unknown field, while the close stamp is still accepted.
func TestCarryOverUnknownToOlderSchema(t *testing.T) {
	saved := Schema["review"]["carry_over"]
	delete(Schema["review"], "carry_over")
	defer func() { Schema["review"]["carry_over"] = saved }()
	op := Op{ID: "o", Entity: "review", EntityID: "me", Field: "carry_over", Value: []byte(`""`), TS: 1, Device: "D"}
	if err := Validate(op); !errors.Is(err, ErrInvalidOp) {
		t.Fatalf("carry_over on an older schema: err %v, want ErrInvalidOp", err)
	}
	op.Field, op.Value = "closed_at", []byte(`0`)
	if err := Validate(op); err != nil {
		t.Fatalf("closed_at refused: %v", err)
	}
}
