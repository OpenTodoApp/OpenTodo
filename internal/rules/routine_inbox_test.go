package rules

import (
	"context"
	"fmt"
	"slices"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/notify"
)

// alertSink records Notify me notices and failure alerts.
type alertSink struct {
	noticeSink
	alerts []notify.RoutineAlert
}

func (a *alertSink) RoutineFailed(_ context.Context, x notify.RoutineAlert) { a.alerts = append(a.alerts, x) }

const brokenSteps = `[{"id":"a","kind":"split_lines","in":{"text":{"literal":"a\nb"}}},
	{"id":"b","kind":"create_tasks","in":{"text":{"ref":"a"},"project":{"literal":{"project":"gone"}}}}]`

const okSteps = `[{"id":"a","kind":"split_lines","in":{"text":{"literal":"a\nb"}}},
	{"id":"b","kind":"create_tasks","in":{"text":{"ref":"a"},"project":{"literal":{"project":"errands"}}}}]`

func (h *harness) runAs(rule, source string, test bool) Result {
	h.t.Helper()
	h.n++
	h.clock = h.clock.Add(time.Minute)
	res, err := h.e.RunNow(h.ctx, "alice", RunRequest{RuleID: rule, RunID: fmt.Sprintf("run-%d", h.n), Test: test, Source: source})
	if err != nil {
		h.t.Fatalf("run %s: %v", rule, err)
	}
	return res
}

func (h *harness) inbox(since int64, hide bool) []string {
	h.t.Helper()
	list, err := h.e.Store.InboxRuns(h.ctx, "alice", since, hide)
	if err != nil {
		h.t.Fatal(err)
	}
	out := []string{}
	for _, r := range list {
		out = append(out, r.RuleID+":"+r.Kind+":"+r.Source)
	}
	return out
}

// routine-inbox "What the card shows" and "Routine notifications in the bell".
func TestRoutineInboxRuns(t *testing.T) {
	h, _, _ := routineHarness(t)
	sink := &alertSink{}
	h.e.Routine = sink
	h.project("alice", "errands", "Errands", "")
	h.project("alice", "gone", "Gone", "")
	h.write("alice", "laptop", "project", "gone", map[string]any{"deleted_at": 5})
	h.routine("alice", "ok", "Groceries", `{"kind":"manual"}`, "", okSteps)
	h.routine("alice", "bad", "Weekly digest", `{"kind":"manual"}`, "", brokenSteps)

	// Own manual runs and tests are never shown, and never notify.
	h.runAs("ok", SourceManual, false)
	h.runAs("bad", SourceManual, false)
	h.runAs("bad", SourceManual, true)
	if got := h.inbox(0, false); len(got) != 0 || len(sink.alerts) != 0 {
		t.Fatalf("own runs: %v %v", got, sink.alerts)
	}
	// "Run by an assistant": shown; its failures ring the bell, once per day.
	h.runAs("ok", SourceMCP, false)
	h.runAs("bad", SourceMCP, false)
	marker := h.clock.UnixMilli()
	h.runAs("bad", SourceMCP, false)
	if got := h.inbox(0, false); !slices.Equal(got, []string{"bad:failure:mcp", "bad:failure:mcp", "ok:success:mcp"}) {
		t.Fatalf("inbox %v", got)
	}
	if len(sink.alerts) != 2 || sink.alerts[1].Step != 2 || sink.alerts[1].StepKind != "create_tasks" || sink.alerts[0].Day != sink.alerts[1].Day {
		t.Fatalf("alerts %+v", sink.alerts)
	}
	// "Failure stays": the marker hides successes before it, not failures;
	// "Only what needs me": hiding successes leaves the failures.
	if got := h.inbox(marker, false); !slices.Equal(got, []string{"bad:failure:mcp", "bad:failure:mcp"}) {
		t.Fatalf("after marker %v", got)
	}
	h.runAs("ok", SourceMCP, false)
	if got := h.inbox(marker, true); len(got) != 2 {
		t.Fatalf("hidden successes %v", got)
	}
	// A dismissed success is gone everywhere; another user's run is not found.
	list, _ := h.e.Store.InboxRuns(h.ctx, "alice", marker, false)
	if err := h.e.Dismiss(h.ctx, "bob", "ok", list[0].RunID); err == nil {
		t.Fatal("bob dismissed alice's run")
	}
	if err := h.e.Dismiss(h.ctx, "alice", "ok", list[0].RunID); err != nil {
		t.Fatal(err)
	}
	if got := h.inbox(marker, false); len(got) != 2 {
		t.Fatalf("after dismiss %v", got)
	}
	// Handled: a later successful run of the routine clears its failures.
	h.write("alice", "laptop", "project", "gone", map[string]any{"deleted_at": nil})
	h.runAs("bad", SourceMCP, false)
	if got := h.inbox(h.clock.UnixMilli(), false); len(got) != 0 {
		t.Fatalf("handled %v", got)
	}
}

// routine-inbox "Failed runs are kept until seen" ("Away for six weeks").
func TestRoutineFailedRunKeptUntilSeen(t *testing.T) {
	h, _, _ := routineHarness(t)
	h.e.Routine = &alertSink{}
	h.project("alice", "gone", "Gone", "")
	h.write("alice", "laptop", "project", "gone", map[string]any{"deleted_at": 5})
	h.routine("alice", "bad", "Weekly digest", `{"kind":"manual"}`, "", brokenSteps)
	h.runAs("bad", SourceMCP, false)
	h.clock = h.clock.Add(42 * 24 * time.Hour)
	if _, err := h.e.Store.Prune(h.ctx); err != nil {
		t.Fatal(err)
	}
	if got := h.inbox(0, false); len(got) != 1 {
		t.Fatalf("six weeks away: %v", got)
	}
	// The user comes back and sees it: kept 30 more days, then removed.
	h.write("alice", "phone", "user_prefs", "me", map[string]any{"routines_seen_at": h.clock.UnixMilli()})
	if _, err := h.e.Store.Prune(h.ctx); err != nil {
		t.Fatal(err)
	}
	h.clock = h.clock.Add(29 * 24 * time.Hour)
	if _, err := h.e.Store.Prune(h.ctx); err != nil {
		t.Fatal(err)
	}
	if got := h.inbox(0, false); len(got) != 1 {
		t.Fatalf("29 days after seen: %v", got)
	}
	h.clock = h.clock.Add(2 * 24 * time.Hour)
	if _, err := h.e.Store.Prune(h.ctx); err != nil {
		t.Fatal(err)
	}
	if got := h.inbox(0, false); len(got) != 0 {
		t.Fatalf("31 days after seen: %v", got)
	}
	// The marker and the setting are read from the synced row.
	h.write("alice", "phone", "user_prefs", "me", map[string]any{"routines_hide_successes": "on"})
	if m, hide, err := h.e.Store.SeenPrefs(h.ctx, "alice"); err != nil || m == 0 || !hide {
		t.Fatalf("prefs %d %v %v", m, hide, err)
	}
}
