package sync

import (
	"encoding/json"
	"fmt"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/recurrence"
)

// OpenSpec change series-split, task 2.4: a lineage walk is capped at 50 pieces;
// older ones end at their own until (web lineage.test.ts runs the same shape).
func TestLineageCappedAtFiftyPieces(t *testing.T) {
	var tasks []Entity
	prev := ""
	for i := 0; i < 60; i++ {
		id := fmt.Sprintf("p%02d", i)
		row := Entity{"id": JSONOf(id), "recurrence": JSONOf("every day"), "due": JSONOf(map[string]string{"date": recurrence.AddDays("2026-01-01", i*2)}),
			"completed_at": json.RawMessage("null"), "deleted_at": json.RawMessage("null")}
		if prev != "" {
			row["split_from"] = JSONOf(SplitFrom{Series: prev, Date: recurrence.AddDays("2026-01-01", i*2)})
		}
		tasks = append(tasks, row)
		prev = id
	}
	last := tasks[59]
	pieces := lineageOf("p59", last, tasks)
	if len(pieces) != MaxPieces || pieces[len(pieces)-1].id != "p59" {
		t.Fatalf("last piece's lineage = %d pieces ending %s", len(pieces), pieces[len(pieces)-1].id)
	}
	// The root is past the cap: alone, bounded by its own rule only.
	if b := SeriesBudget("p00", tasks[0], tasks, "", "2026-01-01"); b.End != "" {
		t.Fatalf("root end = %q, want none", b.End)
	}
	// A kept middle piece ends the day before the next one starts.
	if b := SeriesBudget("p30", tasks[30], tasks, "", "2026-01-01"); b.End != recurrence.AddDays("2026-01-01", 61) {
		t.Fatalf("p30 end = %q", b.End)
	}
}
