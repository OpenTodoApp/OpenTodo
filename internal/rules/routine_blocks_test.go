package rules

import (
	"encoding/json"
	"strings"
	"testing"
)

// morningBriefing: today's tasks, an Ask AI step in text and a Notify me with its answer.
const morningBriefing = `[{"id":"a","kind":"find_tasks","in":{"condition":{"literal":{"labels":{"any":["inbox"]}}}}},
	{"id":"b","kind":"ask_ai","in":{"instruction":{"literal":"brief me on today"},"context":{"ref":"a"}}},
	{"id":"c","kind":"ask_ai","in":{"instruction":{"literal":"and the week"}}},
	{"id":"d","kind":"ask_ai","in":{"instruction":{"literal":"list them"},"context":{"ref":"a"},"answer":{"literal":"lines"}}},
	{"id":"e","kind":"notify","in":{"text":{"ref":"b"}}}]`

// "Morning briefing" (assistant-routine-blocks 1.1): an Ask AI step in text
// may show blocks and reads the tasks with their ids; the run keeps at most
// four blocks across its steps, as kinds and parameters, and the run log and
// the Inbox card carry them. A Lines answer is offered no show tool.
func TestRoutineRunBlocks(t *testing.T) {
	h, ai, _ := aiHarness(t)
	h.inboxTasks(3)
	h.routine("alice", "r1", "Morning briefing", `{"kind":"manual"}`, "", morningBriefing)
	ai.answer = AIAnswer{Text: "A light day.", Input: 10, Output: 5, Blocks: []RunBlock{
		{Kind: RunBlockCalendar, Date: "2026-11-06", Span: "day"},
		{Kind: RunBlockTasks, IDs: []string{"t0", "t1", "t2"}},
		{Kind: RunBlockDeadlines, From: "2026-11-06", To: "2026-11-12"},
		{Kind: "map", IDs: []string{"t0"}},
	}}
	res := h.runAs("r1", SourceSchedule, false)
	if len(ai.calls) != 3 || ai.calls[0].Show != 4 || ai.calls[1].Show != 1 || ai.calls[2].Show != 0 {
		t.Fatalf("calls %+v", ai.calls)
	}
	if !strings.Contains(ai.calls[0].Context[0], "(id t0") || strings.Contains(ai.calls[2].Context[0], "id t0") {
		t.Fatalf("context %q / %q", ai.calls[0].Context, ai.calls[2].Context)
	}
	run, err := h.e.Store.RunByID(h.ctx, "alice", res.Run.RunID)
	if err != nil {
		t.Fatal(err)
	}
	got, _ := json.Marshal(run.Blocks)
	want := `[{"kind":"calendar","date":"2026-11-06","span":"day"},{"kind":"tasks","ids":["t0","t1","t2"]},{"kind":"deadlines","from":"2026-11-06","to":"2026-11-12"},{"kind":"calendar","date":"2026-11-06","span":"day"}]`
	if string(got) != want {
		t.Fatalf("blocks %s", got)
	}
	list, err := h.e.Store.InboxRuns(h.ctx, "alice", 0, false)
	if err != nil || len(list) != 1 || len(list[0].Blocks) != 4 {
		t.Fatalf("inbox %+v %v", list, err)
	}
}

// A run without blocks keeps none, and a device's blocks are checked.
func TestRunBlocksChecked(t *testing.T) {
	if blocksJSON(nil) != "" || blocksOf("") != nil || blocksOf("{") != nil {
		t.Fatal("empty")
	}
	ok := []RunBlock{{Kind: RunBlockTasks, IDs: []string{"a"}}, {Kind: RunBlockCalendar, Date: "2026-11-06", Span: "week"}, {Kind: RunBlockDeadlines, From: "2026-11-01", To: "2026-11-30"}}
	if err := checkRunBlocks(ok); err != nil {
		t.Fatal(err)
	}
	for _, bad := range [][]RunBlock{
		append(ok, ok[0], ok[0]),
		{{Kind: "map", IDs: []string{"a"}}},
		{{Kind: RunBlockTasks}},
		{{Kind: RunBlockTasks, IDs: []string{"a b"}}},
		{{Kind: RunBlockTasks, IDs: []string{"a"}, Date: "2026-11-06"}},
		{{Kind: RunBlockCalendar, Date: "2026-13-01", Span: "day"}},
		{{Kind: RunBlockCalendar, Date: "2026-11-06", Span: "month"}},
		{{Kind: RunBlockDeadlines, From: "2026-11-06", To: "2026-11-05"}},
		{{Kind: RunBlockDeadlines, From: "2026-11-01", To: "2026-12-02"}},
	} {
		if checkRunBlocks(bad) == nil {
			t.Fatalf("accepted %+v", bad)
		}
	}
}
