package assistant

import (
	"context"
	"encoding/json"
	"slices"
	"strings"
	"testing"
	"time"
)

// assistant-in-context 1.1: the four skills offer their registry tools, their
// display tools and the follow-ups, and nothing else.
func TestInContextSkillTools(t *testing.T) {
	f := newFixture(t)
	for id, want := range map[string][]string{
		"rewrite-task": {"get_task", "update_tasks", "suggest_followups"},
		"find-slot":    {"get_task", "find_free_time", "schedule_tasks", "show_free_time", "suggest_followups"},
		"project-next": {"today_summary", "list_projects", "list_tasks", "search_tasks", "get_task", "list_time_entries", "show_tasks", "show_board", "show_timeline", "suggest_followups"},
		"brief-today":  {"today_summary", "list_tasks", "get_task", "find_free_time", "show_calendar", "show_deadlines", "show_stats", "suggest_followups"},
	} {
		p := &scripted{rounds: []scriptRound{{text: "ok"}}}
		in := TurnInput{UserID: "u1", Zone: time.UTC, Messages: []Message{{Role: "user", Text: "go"}}, Skill: skill(t, id)}
		if res := f.loop.Run(context.Background(), p, in, Events{Text: func(string) {}}); res.Err != nil {
			t.Fatal(res.Err)
		}
		var got []string
		for _, d := range p.req.Tools {
			got = append(got, d.Name)
		}
		slices.Sort(got)
		w := slices.Clone(want)
		slices.Sort(w)
		if !slices.Equal(got, w) {
			t.Fatalf("%s offers %v, want %v", id, got, w)
		}
	}
}

// "A free slot": a 60-minute task, a working day from 14:00 to 16:00 tomorrow;
// find_free_time searches that day and the proposal sets the do-on date to
// tomorrow at 14:00. The turn writes nothing.
func TestFindSlotProposesTheFreeStretch(t *testing.T) {
	f := newFixture(t) // now: 2026-10-12 10:00 UTC
	f.task("u1", "t1", "Write the report", map[string]any{"estimate_minutes": 60})
	before := f.opLog()
	p := &scripted{rounds: []scriptRound{
		{stop: StopToolUse, calls: []ToolCall{call("c1", "get_task", map[string]any{"id": "t1", "timezone": "UTC"})}},
		{stop: StopToolUse, calls: []ToolCall{call("c2", "find_free_time", map[string]any{"from": "2026-10-13", "to": "2026-10-13", "min_minutes": 60, "timezone": "UTC"})}},
		{next: func(results []ToolResult) scriptRound {
			if !strings.Contains(results[0].Content, `"14:00"`) {
				t.Fatalf("find_free_time = %s", results[0].Content)
			}
			return scriptRound{stop: StopToolUse, calls: []ToolCall{call("c3", "schedule_tasks", map[string]any{"ids": []string{"t1"}, "due": map[string]any{"date": "2026-10-13", "time": "14:00"}})}}
		}},
		{text: "Tomorrow at 14:00."},
	}}
	in := TurnInput{UserID: "u1", Zone: time.UTC, Messages: []Message{{Role: "user", Text: "Find a slot"}}, Selected: []string{"t1"},
		Skill: skill(t, "find-slot"), Workday: &Workday{StartHour: 14, EndHour: 16, DayLength: 120}}
	res := f.loop.Run(context.Background(), p, in, Events{Text: func(string) {}})
	if res.Err != nil || len(res.Changes) != 1 {
		t.Fatalf("result = %+v", res)
	}
	var due map[string]string
	_ = json.Unmarshal(res.Changes[0].Patch["due"], &due)
	if due["date"] != "2026-10-13" || due["time"] != "14:00" {
		t.Fatalf("due = %v", due)
	}
	if !strings.Contains(p.req.System, "Working day: from 14:00 to 16:00. Pass day_start_hour 14 and day_end_hour 16 to find_free_time.") {
		t.Fatalf("system text lacks the working day:\n%s", p.req.System)
	}
	if f.opLog() != before {
		t.Fatal("the turn wrote")
	}
}
