package assistant

import (
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/agenttools"
)

// Planning vocabulary in the fixed instructions and the skills (OpenSpec change
// agent-planning-fields, design D7).

func TestSystemPromptPlanningVocabulary(t *testing.T) {
	s := SystemPrompt(TurnInput{UserName: "Ada", Zone: time.UTC}, time.Date(2026, 10, 22, 9, 0, 0, 0, time.UTC))
	for _, want := range []string{"deadline", `start "someday"`, "evening", "blocked_by", "location", "parking does not clear the due date"} {
		if !strings.Contains(s, want) {
			t.Fatalf("missing %q in the prompt", want)
		}
	}
}

func TestSkillsUsePlanningFields(t *testing.T) {
	for id, words := range map[string][]string{
		"plan-week":     {"start date", "never give a do-on date only to keep a task visible"},
		"weekly-review": {"blocked_by", `start "someday"`, "view someday"},
		"triage-inbox":  {`start "someday"`, "deadline"},
	} {
		sk, ok := agenttools.SkillByID(id)
		if !ok {
			t.Fatalf("no skill %s", id)
		}
		for _, w := range words {
			if !strings.Contains(sk.Instructions, w) {
				t.Errorf("%s lacks %q", id, w)
			}
		}
		allowed := false
		for _, tool := range sk.Tools {
			allowed = allowed || tool == "update_tasks"
		}
		if !allowed {
			t.Errorf("%s names planning fields but cannot call update_tasks", id)
		}
	}
}

// Plan-week defers instead of dating: a recorded turn proposes start, and the
// proposal carries it without a due date.
func TestPlanWeekDefersInsteadOfDating(t *testing.T) {
	f := newFixture(t)
	f.task("u1", "rep", "Quarterly report", nil)
	p := &scripted{rounds: []scriptRound{
		{stop: StopToolUse, calls: []ToolCall{call("w", "update_tasks", map[string]any{"updates": []any{map[string]any{"id": "rep", "start": "2026-10-26", "deadline": "2026-10-30"}}})}},
		{text: "I've proposed a start date; review it below."},
	}}
	res := f.loop.Run(t.Context(), p, TurnInput{UserID: "u1", UserName: "Ada", Zone: time.UTC, Skill: skill(t, "plan-week"),
		Messages: []Message{{Role: "user", Text: "Plan my week"}}}, Events{Text: func(string) {}, Status: func(string) {}})
	if res.Err != nil || len(res.Changes) != 1 {
		t.Fatalf("result = %+v", res)
	}
	patch := res.Changes[0].Patch
	if string(patch["start"]) != `"2026-10-26"` || string(patch["deadline"]) != `"2026-10-30"` || patch["due"] != nil {
		t.Fatalf("patch = %v", patch)
	}
}
