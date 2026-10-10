package sync

import (
	"context"
	"encoding/json"
	"testing"
)

// TestValidateEstimateMinutes pins the time-blocking contract for estimate_minutes:
// null or an integer 1–10080. The field and its kind (kPositiveInt) came with
// nlp-quick-add; time-blocking reuses them instead of adding a second kind.
func TestValidateEstimateMinutes(t *testing.T) {
	cases := []struct {
		value string
		ok    bool
	}{
		{`15`, true}, {`1`, true}, {`10080`, true}, {`null`, true},
		{`0`, false}, {`-15`, false}, {`1.5`, false}, {`"45"`, false}, {`10081`, false}, {`true`, false}, {`[30]`, false},
	}
	for _, c := range cases {
		err := Validate(op("1", "task", "t1", "estimate_minutes", c.value, 1, "A"))
		if (err == nil) != c.ok {
			t.Errorf("estimate_minutes %s: ok=%v, err=%v", c.value, c.ok, err)
		}
	}
}

// Estimate and due are separate fields: concurrent writes to each keep both, in
// any delivery order (time-blocking, "Concurrent estimate and due edits").
func TestEstimateAndDueConvergeIndependently(t *testing.T) {
	ctx := context.Background()
	s := newTestService(t)
	base := op("c1", "task", "t1", "title", `"Plan"`, 100, "A")
	a := op("a1", "task", "t1", "estimate_minutes", `45`, 200, "A")
	b := op("b1", "task", "t1", "due", `{"date":"2026-10-13","time":"14:30"}`, 150, "B")
	for user, order := range map[string][]Op{"u1": {base, a, b}, "u2": {b, a, base}} {
		if _, err := s.Apply(ctx, user, order); err != nil {
			t.Fatal(err)
		}
		row, err := s.Get(ctx, user, "task", "t1")
		if err != nil {
			t.Fatal(err)
		}
		if string(row["estimate_minutes"]) != `45` {
			t.Fatalf("%s estimate = %s", user, row["estimate_minutes"])
		}
		var due struct{ Date, Time string }
		if err := json.Unmarshal(row["due"], &due); err != nil || due.Time != "14:30" || due.Date != "2026-10-13" {
			t.Fatalf("%s due = %s (%v)", user, row["due"], err)
		}
	}
}
