package sync

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func TestValidateRecurrenceField(t *testing.T) {
	long, _ := json.Marshal("every day" + strings.Repeat(" ", 200))
	cases := []struct {
		value string
		ok    bool
	}{
		{`"every weekday"`, true},
		{`"Every  2nd  Tuesday"`, true}, // any parseable spelling; clients store the canonical form
		{`"every 3 days after completion for 5 times"`, true},
		{`null`, true},
		{`"every blursday"`, false},
		{`""`, false},
		{string(long), false},
		{`42`, false},
		{`{"freq":"daily"}`, false},
	}
	for _, c := range cases {
		err := Validate(op("o1", "task", "t1", "recurrence", c.value, 1, "A"))
		if c.ok && err != nil {
			t.Errorf("recurrence %s rejected: %v", c.value, err)
		}
		if !c.ok && !errors.Is(err, ErrInvalidOp) {
			t.Errorf("recurrence %s accepted, want ErrInvalidOp (got %v)", c.value, err)
		}
	}
	for _, v := range []string{`null`, `"0d3c4bd8-6a3e-8c1f-9a52-7b3c2d1e0f00"`} {
		if err := Validate(op("o2", "task", "t1", "series_id", v, 1, "A")); err != nil {
			t.Errorf("series_id %s rejected: %v", v, err)
		}
	}
	if err := Validate(op("o3", "task", "t1", "series_id", `7`, 1, "A")); !errors.Is(err, ErrInvalidOp) {
		t.Errorf("numeric series_id accepted: %v", err)
	}
}

func TestInvalidRecurrenceKeepsPreviousRule(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	if _, err := s.Apply(ctx, "u1", []Op{op("a", "task", "t1", "recurrence", `"every day"`, 100, "A")}); err != nil {
		t.Fatal(err)
	}
	_, err := s.Apply(ctx, "u1", []Op{op("b", "task", "t1", "recurrence", `"every blursday"`, 200, "A")})
	if !errors.Is(err, ErrInvalidOp) {
		t.Fatalf("invalid rule: err = %v, want ErrInvalidOp", err)
	}
	e, _ := s.Get(ctx, "u1", "task", "t1")
	if string(e["recurrence"]) != `"every day"` {
		t.Fatalf("recurrence = %s, want the previous rule", e["recurrence"])
	}
}
