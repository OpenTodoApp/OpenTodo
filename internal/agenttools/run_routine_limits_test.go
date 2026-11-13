package agenttools

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/ruleval"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// fakeRuns stands in for the rules engine: a run writes `writes` entities
// unless that is more than its cap.
type fakeRuns struct {
	writes int
	calls  int
	caps   []int
	notes  []string
}

func (f *fakeRuns) Check(context.Context, string, map[string]json.RawMessage, opsync.Entity) ([]ruleval.StepWarning, error) {
	return nil, nil
}
func (f *fakeRuns) Runs(context.Context, string, string, string, int) (any, error) { return nil, nil }
func (f *fakeRuns) Run(context.Context, string, string, string) (any, bool, error) {
	return nil, false, nil
}
func (f *fakeRuns) State(context.Context, string) (map[string]string, map[string]int64) {
	return nil, nil
}
func (f *fakeRuns) RunAs(context.Context, string, []string) map[string]map[string]string {
	return nil
}
func (f *fakeRuns) RunNow(_ context.Context, _, _, _, noteID string, test bool, maxWrites int) (map[string]any, int, error) {
	f.calls++
	f.notes = append(f.notes, noteID)
	f.caps = append(f.caps, maxWrites)
	if test {
		return map[string]any{"test": true}, 0, nil
	}
	if maxWrites > 0 && f.writes > maxWrites {
		return map[string]any{"run": map[string]any{"outcome": "failed"}}, 0, nil
	}
	return map[string]any{"run": map[string]any{"outcome": "applied"}}, f.writes, nil
}

// "Run on a note" (notes-in-routines): run_routine passes note_id; with a
// task_id too it is refused before anything runs.
func TestRunRoutineOnANote(t *testing.T) {
	f := newFixture(t)
	runs := &fakeRuns{writes: 1}
	f.reg.SetRoutines(runs)
	f.put("u1", "rule", "r1", map[string]any{"name": "Checkboxes", "enabled": false, "trigger": map[string]any{"kind": "manual", "on": "note"}, "deleted_at": nil})
	c := agent("u1")
	f.mustCall(c, "run_routine", map[string]any{"routine": "r1", "note_id": "n1"})
	if len(runs.notes) != 1 || runs.notes[0] != "n1" {
		t.Fatalf("notes %v", runs.notes)
	}
	if _, err := f.call(c, "run_routine", map[string]any{"routine": "r1", "note_id": "n1", "task_id": "t1"}); err == nil || runs.calls != 1 {
		t.Fatalf("both ids: %v, %d runs", err, runs.calls)
	}
}

// run_routine runs only within what is left of the token's daily items: the
// rest is held while it runs and what it did not write goes back; with nothing
// left the routine does not run; a test writes nothing and is not limited.
func TestRunRoutineWithinDailyItems(t *testing.T) {
	f := newFixture(t)
	runs := &fakeRuns{writes: 3}
	f.reg.SetRoutines(runs)
	f.put("u1", "rule", "r1", map[string]any{"name": "Sweep", "enabled": false, "trigger": map[string]any{"kind": "manual"}, "deleted_at": nil})
	c := agent("u1")
	tok := c.TokenID
	if ok, _ := f.reg.limits.Reserve(tok, PerDay-5); !ok {
		t.Fatal("reserve")
	}
	f.mustCall(c, "run_routine", map[string]any{"routine": "r1"})
	if runs.caps[0] != 5 {
		t.Fatalf("cap %d, want the 5 items left", runs.caps[0])
	}
	// 3 written, 2 left.
	if ok, _ := f.reg.limits.Reserve(tok, 3); ok {
		t.Fatal("the run's writes were not counted")
	}
	runs.writes = 2
	f.mustCall(c, "run_routine", map[string]any{"routine": "r1"})
	if runs.caps[1] != 2 {
		t.Fatalf("cap %d, want 2", runs.caps[1])
	}
	// Nothing left: refused before the routine runs.
	_, err := f.call(c, "run_routine", map[string]any{"routine": "r1"})
	var te *ToolError
	if !errors.As(err, &te) || te.Code != "rate_limited" || te.Data["retry_after_seconds"].(int) <= 0 {
		t.Fatalf("run past the daily items: %v", err)
	}
	if runs.calls != 2 {
		t.Fatalf("the routine ran %d times", runs.calls)
	}
	// A test still runs, uncapped, and books nothing.
	f.mustCall(c, "run_routine", map[string]any{"routine": "r1", "test": true})
	if runs.calls != 3 || runs.caps[2] != 0 {
		t.Fatalf("test: calls %d caps %v", runs.calls, runs.caps)
	}
}

func TestLimiterHoldAndSettle(t *testing.T) {
	l := NewLimiter(nil)
	if ok, _ := l.Reserve("t", PerDay-10); !ok {
		t.Fatal("reserve")
	}
	held, _ := l.Hold("t")
	if held != 10 {
		t.Fatalf("held %d", held)
	}
	if ok, _ := l.Reserve("t", 1); ok {
		t.Fatal("a held budget was given to another call")
	}
	l.Settle("t", held, 4)
	if ok, _ := l.Reserve("t", 6); !ok {
		t.Fatal("the unused part did not go back")
	}
	if held, retry := l.Hold("t"); held != 0 || retry <= 0 {
		t.Fatalf("hold with nothing left: %d %d", held, retry)
	}
	// A run that wrote more than it held (a device run) books the excess.
	l2 := NewLimiter(nil)
	l2.Reserve("t", PerDay-2)
	h, _ := l2.Hold("t")
	l2.Settle("t", h, 7)
	if held, _ := l2.Hold("t"); held != 0 {
		t.Fatalf("excess not booked: %d left", held)
	}
}

// A hold is the smaller of what is left to the token and to its account, and
// settling gives the unused part back to both.
func TestLimiterHoldForAccount(t *testing.T) {
	l := NewLimiter(nil)
	if ok, _ := l.ReserveFor("u", "a", PerDay); !ok {
		t.Fatal("reserve a")
	}
	if ok, _ := l.ReserveFor("u", "b", PerDay-4); !ok {
		t.Fatal("reserve b")
	}
	held, _ := l.HoldFor("u", "c")
	if held != 4 {
		t.Fatalf("held %d, want the account's 4 left", held)
	}
	if ok, _ := l.ReserveFor("u", "b", 1); ok {
		t.Fatal("the account's held items were given to another token")
	}
	l.SettleFor("u", "c", held, 1)
	if ok, _ := l.ReserveFor("u", "b", 3); !ok {
		t.Fatal("the unused part did not go back to the account")
	}
	if held, retry := l.HoldFor("u", "c"); held != 0 || retry <= 0 {
		t.Fatalf("hold with the account spent: %d %d", held, retry)
	}
}
