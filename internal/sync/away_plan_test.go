package sync

import (
	"encoding/json"
	"os"
	"slices"
	"testing"
)

type awayFixture struct {
	Cases []struct {
		Name, Today, From, To string
		Series                struct {
			Rule, Due string
			Habit     bool
		}
		Records     []struct{ Date, State string }
		Skipped     []string
		Due         string
		Occurrences int
	}
}

func TestAwayPlanFixture(t *testing.T) {
	raw, err := os.ReadFile("testdata/away_plan.fixture.json")
	if err != nil {
		t.Fatal(err)
	}
	var f awayFixture
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	const id = "s1"
	for _, c := range f.Cases {
		series := Entity{"id": JSONOf(id), "title": JSONOf("x"), "recurrence": JSONOf(c.Series.Rule), "due": JSONOf(map[string]string{"date": c.Series.Due}),
			"completed_at": json.RawMessage("null"), "habit": JSONOf(c.Series.Habit), "labels": json.RawMessage("[]")}
		tasks := []Entity{series}
		for _, r := range c.Records {
			rec := Entity{"id": JSONOf(OccurrenceID(id, r.Date)), "series_id": JSONOf(id), "occurrence_date": JSONOf(r.Date),
				"due": JSONOf(map[string]string{"date": r.Date}), "completed_at": JSONOf(1), "skipped": JSONOf(r.State == "skipped")}
			tasks = append(tasks, rec)
		}
		plan, err := PlanAway(tasks, AwayScope{All: true}, c.From, c.To, func(Entity) bool { return true }, 5, c.Today, 0)
		if err != nil {
			t.Fatalf("%s: %v", c.Name, err)
		}
		due := c.Series.Due
		var skipped []string
		for _, w := range plan.Writes {
			if w.ID == id {
				if d := decodeRecurringDue(w.Fields["due"]); d != nil {
					due = d.Date
				}
				continue
			}
			if string(w.Fields["skipped"]) == "true" {
				skipped = append(skipped, StringOf(w.Fields["occurrence_date"]))
			}
		}
		slices.Sort(skipped)
		if !slices.Equal(skipped, c.Skipped) && !(len(skipped) == 0 && len(c.Skipped) == 0) {
			t.Errorf("%s: skipped %v, want %v", c.Name, skipped, c.Skipped)
		}
		if due != c.Due || plan.Occurrences != c.Occurrences {
			t.Errorf("%s: due %s (%d occurrences), want %s (%d)", c.Name, due, plan.Occurrences, c.Due, c.Occurrences)
		}
	}
}
