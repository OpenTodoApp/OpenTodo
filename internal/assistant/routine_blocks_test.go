package assistant

import (
	"context"
	"strings"
	"testing"
	"time"
)

// showService is routineService with the registry, so show calls are checked.
func showService(t *testing.T, p Provider) (*Service, Settings, *fixture) {
	t.Helper()
	f := newFixture(t)
	st := NewStore(f.sync.DB(), t.TempDir(), func() time.Time { return time.Date(2026, 11, 6, 17, 0, 0, 0, time.UTC) })
	ctx := context.Background()
	set := anthropicOn()
	if _, err := st.SaveSettings(ctx, "owner", set, KeyChange{Anthropic: strp("sk-test")}, nil, nil); err != nil {
		t.Fatal(err)
	}
	if err := st.SetConsent(ctx, "u1", Anthropic, true, true); err != nil {
		t.Fatal(err)
	}
	svc := NewService(st, f.loop)
	svc.stub = p
	set, _ = st.Settings(ctx)
	return svc, set, f
}

// TestRoutineShowsBlocks (assistant-routine-blocks 1.1): a call that may show
// blocks offers only show_tasks, show_calendar and show_deadlines with the show
// note; a shown block keeps its kind and checked ids without the model's
// heading, an unknown tool and an unknown id are refused, and every round's
// tokens count.
func TestRoutineShowsBlocks(t *testing.T) {
	p := &scripted{rounds: []scriptRound{
		{stop: StopToolUse, in: 100, out: 20, calls: []ToolCall{
			call("c1", "show_calendar", map[string]any{"date": "2026-11-06", "span": "day"}),
			call("c2", "show_tasks", map[string]any{"ids": []string{"t1", "gone"}, "title": "Start with"}),
			call("c3", "show_map", map[string]any{"task_ids": []string{"t1"}}),
			call("c4", "show_tasks", map[string]any{"ids": []string{"nope"}}),
		}},
		{text: "A light day: start with the slides.", in: 150, out: 30},
	}}
	svc, set, f := showService(t, p)
	f.task("u1", "t1", "Send the slides", nil)
	c := RoutineCall{UserID: "u1", Instruction: "Brief me on today", Context: []string{"- Send the slides (id t1)"}, Answer: "text", MaxTokens: RoutineTextTokens, Show: 4}
	ans, err := svc.Routine(context.Background(), set, c)
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, d := range p.req.Tools {
		names = append(names, d.Name)
	}
	if strings.Join(names, ",") != "show_tasks,show_calendar,show_deadlines" || p.req.System != RoutineSystem+"\n"+RoutineShowNote {
		t.Fatalf("tools %v system %q", names, p.req.System)
	}
	if len(ans.Blocks) != 2 || ans.Blocks[0].Kind != BlockCalendar || ans.Blocks[1].Kind != BlockTasks ||
		strings.Join(ans.Blocks[1].IDs, ",") != "t1" || ans.Blocks[1].Title != "" {
		t.Fatalf("blocks %+v", ans.Blocks)
	}
	res := p.results[0]
	if !res[2].IsError || !strings.Contains(res[2].Content, "unknown_tool") || !res[3].IsError || !strings.Contains(res[3].Content, "not_found") {
		t.Fatalf("results %+v", res)
	}
	if ans.Text != "A light day: start with the slides." || ans.Input != 270 || ans.Output != 60 {
		t.Fatalf("answer %+v", ans)
	}
}

// TestRoutineShowLimit: the run's four blocks hold across steps (Show is what
// is left), and a step that may show none is offered no tool.
func TestRoutineShowLimit(t *testing.T) {
	p := &scripted{rounds: []scriptRound{
		{stop: StopToolUse, calls: []ToolCall{
			call("c1", "show_calendar", map[string]any{"date": "2026-11-06", "span": "day"}),
			call("c2", "show_deadlines", map[string]any{"from": "2026-11-06", "to": "2026-11-12"}),
		}},
		{text: "Done."},
	}}
	svc, set, _ := showService(t, p)
	c := RoutineCall{UserID: "u1", Instruction: "Brief me", Answer: "text", MaxTokens: RoutineTextTokens, Show: 1}
	ans, err := svc.Routine(context.Background(), set, c)
	if err != nil {
		t.Fatal(err)
	}
	if len(ans.Blocks) != 1 || !strings.Contains(p.results[0][1].Content, "block_limit") {
		t.Fatalf("blocks %+v results %+v", ans.Blocks, p.results)
	}

	q := &scripted{rounds: []scriptRound{{text: "Done."}}}
	svc.stub = q
	c.Show = 0
	if _, err := svc.Routine(context.Background(), set, c); err != nil || len(q.req.Tools) != 0 || q.req.System != RoutineSystem {
		t.Fatalf("no show: %v %d tools", err, len(q.req.Tools))
	}
}

// TestRoutineShowRounds: a model that keeps asking to show stops after
// MaxRoutineRounds with the text and blocks it has.
func TestRoutineShowRounds(t *testing.T) {
	p := &scripted{rounds: []scriptRound{{text: "Today. ", stop: StopToolUse, calls: []ToolCall{
		call("c1", "show_calendar", map[string]any{"date": "2026-11-06", "span": "day"}),
	}}}}
	svc, set, _ := showService(t, p)
	ans, err := svc.Routine(context.Background(), set, RoutineCall{UserID: "u1", Instruction: "Brief me", Answer: "text", MaxTokens: RoutineTextTokens, Show: 4})
	if err != nil || p.calls != MaxRoutineRounds || len(ans.Blocks) != MaxRoutineRounds-1 || ans.Text != "Today. Today. Today." {
		t.Fatalf("%v: %d calls, %+v", err, p.calls, ans)
	}
}

// The estimate counts the show tools' definitions.
func TestRoutineEstimateShow(t *testing.T) {
	c := RoutineCall{Instruction: "brief me", Answer: "text", MaxTokens: RoutineTextTokens}
	plain := EstimateTokens(c)
	c.Show = 4
	if EstimateTokens(c) <= plain+100 {
		t.Fatalf("estimate %d vs %d", EstimateTokens(c), plain)
	}
}
