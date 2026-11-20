package sync

import (
	"errors"
	"fmt"
	"testing"
	"time"
)

// The bounds of an away plan (the security read of #1635): planning reads each
// series' own lineage, not every task once per day; it stops as soon as the
// changes would pass the limit; and "Everything" leaves out series assigned to
// someone else and those of shared projects not picked under "Only".

func awaySeries(id, rule, due string) Entity {
	return Entity{"id": JSONOf(id), "title": JSONOf(id), "recurrence": JSONOf(rule), "due": JSONOf(map[string]string{"date": due}),
		"completed_at": nullJSON, "habit": JSONOf(true), "labels": JSONOf([]string{})}
}

var nullJSON = []byte("null")

// awayAccount is n daily habits, each with past done records, and many plain tasks.
func awayAccount(series, history, plain int) []Entity {
	var tasks []Entity
	for i := 0; i < series; i++ {
		id := fmt.Sprintf("s%d", i)
		tasks = append(tasks, awaySeries(id, "every day", "2026-12-01"))
		for d := 1; d <= history; d++ {
			date := time.Date(2026, 12, 1, 0, 0, 0, 0, time.UTC).AddDate(0, 0, -d).Format(time.DateOnly)
			tasks = append(tasks, Entity{"id": JSONOf(OccurrenceID(id, date)), "series_id": JSONOf(id), "occurrence_date": JSONOf(date),
				"due": JSONOf(map[string]string{"date": date}), "completed_at": JSONOf(1), "skipped": JSONOf(false)})
		}
	}
	for i := 0; i < plain; i++ {
		tasks = append(tasks, Entity{"id": JSONOf(fmt.Sprintf("t%d", i)), "title": JSONOf("x"), "completed_at": nullJSON, "labels": JSONOf([]string{})})
	}
	return tasks
}

func TestPlanAwayScaleIsBounded(t *testing.T) {
	tasks := awayAccount(100, 60, 10000)
	start := time.Now()
	plan, err := PlanAway(tasks, AwayScope{All: true}, "2026-12-01", "2026-12-30", func(Entity) bool { return true }, 5, "2026-12-01", 0)
	if err != nil {
		t.Fatal(err)
	}
	if plan.Series != 100 || plan.Occurrences != 100*30 {
		t.Fatalf("plan = %d series, %d occurrences", plan.Series, plan.Occurrences)
	}
	if took := time.Since(start); took > 10*time.Second {
		t.Fatalf("planning 100 daily series among 16k tasks took %v", took)
	}
}

func TestPlanAwayStopsAtTheLimit(t *testing.T) {
	tasks := awayAccount(200, 0, 0)
	start := time.Now()
	_, err := PlanAway(tasks, AwayScope{All: true}, "2026-12-01", "2027-02-28", func(Entity) bool { return true }, 5, "2026-12-01", 2000)
	if !errors.Is(err, ErrAwayTooLarge) {
		t.Fatalf("err = %v, want ErrAwayTooLarge", err)
	}
	if took := time.Since(start); took > time.Second {
		t.Fatalf("refusing took %v", took)
	}
}

func TestAwayEverythingLeavesOthersAndShared(t *testing.T) {
	own := awaySeries("mine", "every day", "2026-12-01")
	theirs := awaySeries("standup", "every day", "2026-12-01")
	theirs["project_id"], theirs["assignee_id"] = JSONOf("team"), JSONOf("alice")
	shared := awaySeries("review", "every day", "2026-12-01")
	shared["project_id"] = JSONOf("team")
	mineShared := awaySeries("notes", "every day", "2026-12-01")
	mineShared["project_id"], mineShared["assignee_id"] = JSONOf("team"), JSONOf("bob")
	tasks := []Entity{own, theirs, shared, mineShared}
	planned := func(scope AwayScope) []string {
		scope.Me, scope.Shared = "bob", map[string]bool{"team": true}
		plan, err := PlanAway(tasks, scope, "2026-12-01", "2026-12-02", func(Entity) bool { return true }, 5, "2026-12-01", 0)
		if err != nil {
			t.Fatal(err)
		}
		seen := map[string]bool{}
		var out []string
		for _, w := range plan.Writes {
			if w.Series && !seen[w.ID] {
				seen[w.ID] = true
				out = append(out, w.ID)
			}
		}
		return out
	}
	if got := planned(AwayScope{All: true}); fmt.Sprint(got) != "[mine]" {
		t.Fatalf("Everything = %v, want only the unshared series", got)
	}
	if got := planned(AwayScope{Projects: []string{"team"}}); fmt.Sprint(got) != "[review notes]" {
		t.Fatalf("Only team = %v, want the shared project's series not assigned to someone else", got)
	}
	if got := planned(AwayScope{Labels: []string{"x"}}); len(got) != 0 {
		t.Fatalf("a label = %v", got)
	}
}
