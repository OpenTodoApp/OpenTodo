package agenttools

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// searchFixture is an account with many tasks and a few that search_tasks
// finds, with what rendering a match reads of other tasks: blockers, series
// records, a project, completed, deleted and encrypted matches.
func searchFixture(t *testing.T, fillers int) *fixture {
	f := newFixture(t)
	f.put("u1", "project", "p1", map[string]any{"name": "Weather", "position": 1})
	for i := range fillers {
		f.task("u1", fmt.Sprintf("fill-%03d", i), fmt.Sprintf("Filler %d", i), map[string]any{"blocked_by": []string{"b-open"}})
	}
	f.task("u1", "b-open", "Blocker", nil)
	f.task("u1", "b-done", "Done blocker", map[string]any{"completed_at": 5})
	f.task("u1", "z1", "Zephyr report", map[string]any{"blocked_by": []string{"b-open"}, "project_id": "p1"})
	f.task("u1", "z2", "Second zephyr", map[string]any{"blocked_by": []string{"b-done", "missing"}})
	f.task("u1", "z3", "Plain", map[string]any{"description": "about ZEPHYR winds"})
	f.task("u1", "z4", "ZÉPHYR accented", nil)
	f.task("u1", "z5", "Zephyr done", map[string]any{"completed_at": 7})
	f.task("u1", "z6", "Zephyr gone", map[string]any{"deleted_at": 9})
	f.task("u1", "z7", "enc:v1:zephyrAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", nil)
	f.task("u1", "r1", "Zephyr course", map[string]any{"recurrence": "every day for 3 times", "due": map[string]any{"date": "2030-01-10"}})
	f.task("u1", opsync.OccurrenceID("r1", "2030-01-09"), "Course", map[string]any{"series_id": "r1", "due": map[string]any{"date": "2030-01-09"}, "completed_at": 1})
	return f
}

// searchJSON is search_tasks' answer over a snapshot.
func searchJSON(t *testing.T, snap *snapshot, needle string, includeCompleted bool) string {
	t.Helper()
	list, _, err := page(snap.searchItems(needle, "", includeCompleted, time.UTC, "2030-01-10"), "", MaxItems)
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(list)
	return string(raw)
}

// performance-10k: search_tasks reads the full records of the tasks that can
// match and of what they show (blockers, series records) only, and answers
// exactly as over every task.
func TestSearchReadsOnlyMatches(t *testing.T) {
	f := searchFixture(t, 200)
	ctx := context.Background()
	full, err := f.reg.load(ctx, "u1")
	if err != nil {
		t.Fatal(err)
	}
	for _, needle := range []string{"zephyr", "zéphyr", "winds", "course", "filler 42", "nothing at all", "enc"} {
		narrow, err := f.reg.loadWith(ctx, "u1", f.reg.searchReader("u1", needle, ""))
		if err != nil {
			t.Fatal(err)
		}
		if len(narrow.tasks) > 20 {
			t.Errorf("%q: the snapshot holds %d tasks, want only the matches and what they show", needle, len(narrow.tasks))
		}
		for _, done := range []bool{false, true} {
			if got, want := searchJSON(t, narrow, needle, done), searchJSON(t, full, needle, done); got != want {
				t.Errorf("%q (completed %v):\n got %s\nwant %s", needle, done, got, want)
			}
		}
	}
	// The matches, the open blocker, the done blocker and the series record:
	// rendering reads them, nothing else.
	tasks, ok, err := f.reg.searchReader("u1", "zephyr", "")(ctx)
	if err != nil || !ok {
		t.Fatalf("narrowed = %v, %v", ok, err)
	}
	ids := map[string]bool{}
	for _, task := range tasks {
		ids[rawStr(task, "id")] = true
	}
	for _, id := range []string{"z1", "z2", "z3", "z5", "r1", "b-open", "b-done", opsync.OccurrenceID("r1", "2030-01-09")} {
		if !ids[id] {
			t.Errorf("%s missing from the narrowed tasks", id)
		}
	}
	if len(tasks) != 8 {
		t.Errorf("narrowed to %d tasks, want 8: %v", len(tasks), ids)
	}
	// A needle that matches every task reads them all through List.
	if _, ok, _ := f.reg.searchReader("u1", "e", "")(ctx); ok != (len(full.tasks) <= opsync.MaxListIDs) {
		t.Errorf("a broad needle narrowed = %v", ok)
	}
}

// The cases where the answer can depend on every task read them all.
func TestSearchReadsEveryTaskWhenNeeded(t *testing.T) {
	f := searchFixture(t, 5)
	ctx := context.Background()
	if f.reg.searchReader("u1", "zephyr", "Home") != nil {
		t.Error("a workspace filter must read every task (it walks parents)")
	}
	f.task("u1", "s1", "Split off", map[string]any{"recurrence": "every day", "split_from": map[string]any{"series": "r1", "date": "2030-01-12"}})
	if _, ok, err := f.reg.searchReader("u1", "zephyr", "")(ctx); ok || err != nil {
		t.Errorf("a split series must read every task: narrowed = %v, %v", ok, err)
	}
	out := f.mustCall(agent("u1"), "search_tasks", map[string]any{"query": "zephyr"})
	if n := len(out["tasks"].([]taskOut)); n != 4 {
		t.Errorf("search over every task found %d, want 4", n)
	}
}
