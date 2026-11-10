package assistant

import (
	"slices"
	"strings"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/agenttools"
)

// assistant-lean-tools 1.1, "A question reads only": a turn without a skill is
// offered the read and display tools and propose_changes, never a write tool,
// and with the lean note; the answer proposes nothing.
func TestLeanQuestionReadsOnly(t *testing.T) {
	f := newFixture(t)
	f.task("u1", "a", "Pay rent", map[string]any{"due": map[string]any{"date": "2026-10-12"}})
	p := &scripted{rounds: []scriptRound{
		{calls: []ToolCall{call("c1", "list_tasks", map[string]any{"view": "today", "timezone": "UTC"})}, stop: StopToolUse},
		{text: "Pay rent is due today."},
	}}
	res, _, _ := run(f, p, "what is due today?")
	if res.Err != nil || len(res.Changes) != 0 {
		t.Fatalf("%+v", res)
	}
	writes := map[string]bool{RememberTool.Name: true}
	for _, d := range f.loop.Tools.Definitions(Caller("u1")) {
		if d.Kind == agenttools.KindWrite {
			writes[d.Name] = true
		}
	}
	for i := range p.calls {
		names := p.offered(i)
		if !slices.Contains(names, ProposeTool.Name) || !slices.Contains(names, "list_tasks") || !slices.Contains(names, "show_tasks") {
			t.Fatalf("call %d offered %v", i, names)
		}
		for _, n := range names {
			if writes[n] {
				t.Fatalf("call %d offered the write tool %s", i, n)
			}
		}
	}
	if !strings.HasSuffix(p.req.System, LeanNote) {
		t.Fatal("no lean note")
	}
}

// "A change is asked for": the model calls propose_changes, the next round
// offers schedule_tasks, and the turn ends with a change set; a write called
// before propose_changes is refused without planning anything.
func TestLeanChangeOnRequest(t *testing.T) {
	f := newFixture(t)
	f.task("u1", "o1", "Old", map[string]any{"due": map[string]any{"date": "2026-10-01"}})
	p := &scripted{rounds: []scriptRound{
		{calls: []ToolCall{call("w0", "schedule_tasks", map[string]any{"ids": []string{"o1"}, "due": map[string]any{"date": "2026-10-16"}})}, stop: StopToolUse},
		{calls: []ToolCall{call("p", ProposeTool.Name, map[string]any{})}, stop: StopToolUse},
		{calls: []ToolCall{call("w1", "schedule_tasks", map[string]any{"ids": []string{"o1"}, "due": map[string]any{"date": "2026-10-16"}})}, stop: StopToolUse},
		{text: "I've proposed moving it to Friday."},
	}}
	res, _, _ := run(f, p, "move everything overdue to Friday")
	if res.Err != nil || len(res.Changes) != 1 || res.Changes[0].EntityID != "o1" {
		t.Fatalf("%+v", res)
	}
	if r := p.results[0][0]; !r.IsError || !strings.Contains(r.Content, "not_offered") {
		t.Fatalf("early write: %+v", r)
	}
	if slices.Contains(p.offered(1), "schedule_tasks") || !slices.Contains(p.offered(2), "schedule_tasks") || !slices.Contains(p.offered(2), ProposeTool.Name) {
		t.Fatalf("offered %v then %v", p.offered(1), p.offered(2))
	}
}

// Skills keep their lists, and a turn amending an open proposal offers the
// write tools from its first round, without propose_changes or the note.
func TestLeanSkillsAndOpenProposals(t *testing.T) {
	sk, _ := agenttools.SkillByID("plan-week")
	if leanTurn(TurnInput{Skill: &sk}) || leanTurn(TurnInput{Open: []Proposed{{Entity: "task", EntityID: "t1"}}}) || !leanTurn(TurnInput{}) {
		t.Fatal("leanTurn")
	}
	f := newFixture(t)
	p := &scripted{rounds: []scriptRound{{text: "ok"}}}
	f.loop.Run(t.Context(), p, TurnInput{UserID: "u1", Messages: []Message{{Role: "user", Text: "plan my week"}}, Skill: &sk}, Events{Text: func(string) {}})
	names := p.offered(0)
	if slices.Contains(names, ProposeTool.Name) || !slices.Contains(names, "schedule_tasks") || strings.Contains(p.req.System, LeanNote) {
		t.Fatalf("skill turn offered %v", names)
	}
}
