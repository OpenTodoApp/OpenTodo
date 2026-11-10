package assistant

import (
	"context"
	"strings"
	"testing"
	"time"
)

// The gaps a real-model eval run found (OpenSpec change assistant-eval-gaps).

// The text of a round after tool calls starts a new paragraph, so the rounds'
// text never runs together; text that already ends a paragraph gets nothing.
func TestRoundTextIsSeparated(t *testing.T) {
	f := newFixture(t)
	f.task("u1", "a", "Book the dentist", nil)
	for _, c := range []struct{ first, want string }{
		{"Today you have one task:", "Today you have one task:\n\nIt is [Book the dentist](?task=a)."},
		{"Looking.\n", "Looking.\n\nIt is [Book the dentist](?task=a)."},
		{"Looking.\n\n", "Looking.\n\nIt is [Book the dentist](?task=a)."},
		{"", "It is [Book the dentist](?task=a)."},
	} {
		p := &scripted{rounds: []scriptRound{
			{text: c.first, stop: StopToolUse, calls: []ToolCall{call("a", "today_summary", map[string]any{"timezone": "UTC"})}},
			{text: "It is [Book the dentist](?task=a)."},
		}}
		res, _, text := run(f, p, "What do I have to do today?")
		if res.Err != nil || text != c.want {
			t.Errorf("after %q: %q (%v), want %q", c.first, text, res.Err, c.want)
		}
	}
}

// In a chat turn a tasks block of one task is refused with the link to write
// instead; two tasks are shown. A routine's step keeps showing one task.
func TestOneTaskIsALinkNotABlock(t *testing.T) {
	f := newFixture(t)
	f.task("u1", "a", "Book the dentist", nil)
	f.task("u1", "b", "Renew the passport", nil)
	var blocks []Block
	p := &scripted{rounds: []scriptRound{
		{stop: StopToolUse, calls: []ToolCall{call("1", "show_tasks", map[string]any{"ids": []string{"a", "gone"}})}},
		{stop: StopToolUse, calls: []ToolCall{call("2", "show_tasks", map[string]any{"ids": []string{"a", "b"}})}},
		{text: "Done."},
	}}
	res := f.loop.Run(context.Background(), p, TurnInput{UserID: "u1", Zone: time.UTC, Messages: []Message{{Role: "user", Text: "today?"}}},
		Events{Text: func(string) {}, Block: func(b Block) { blocks = append(blocks, b) }})
	if res.Err != nil {
		t.Fatal(res.Err)
	}
	if r := p.results[0][0]; !r.IsError || result(t, r)["error"] != "one_task" || result(t, r)["id"] != "a" || result(t, r)["message"] != OneTaskMessage {
		t.Fatalf("one task: %s", r.Content)
	}
	if r := p.results[1][0]; r.IsError || len(blocks) != 1 || len(blocks[0].IDs) != 2 {
		t.Fatalf("two tasks: %s, blocks %+v", r.Content, blocks)
	}
	d := &displayTurn{shower: f.loop.Tools, userID: "u1"}
	if out, isErr, err := d.run(context.Background(), call("3", "show_tasks", map[string]any{"ids": []string{"a"}})); err != nil || isErr {
		t.Fatalf("a routine's one task: %s %v", out, err)
	}
}

// Follow-ups before any words ask for the answer; after words they do not.
func TestFollowupsWithoutWordsAskForThem(t *testing.T) {
	f := newFixture(t)
	for _, c := range []struct {
		first string
		want  string
	}{{"", FollowupsNoTextMessage}, {"Nothing is labelled errand.", FollowupsShownMessage}} {
		p := &scripted{rounds: []scriptRound{
			{text: c.first, stop: StopToolUse, calls: []ToolCall{call("1", "suggest_followups", map[string]any{"suggestions": []string{"Add an errand"}})}},
			{text: "I found no errands."},
		}}
		res, _, text := run(f, p, "Show me my errands")
		if res.Err != nil || !strings.HasSuffix(text, "I found no errands.") {
			t.Fatalf("turn %+v %q", res, text)
		}
		if m := result(t, p.results[0][0]); m["message"] != c.want {
			t.Errorf("after %q: %v, want %q", c.first, m["message"], c.want)
		}
	}
}

func TestInstructionsAskForWords(t *testing.T) {
	for _, w := range []string{"Always answer in words", "never repeat it", "one task is a link in your words, never a block"} {
		if !strings.Contains(SystemRules, w) {
			t.Errorf("SystemRules lacks %q", w)
		}
	}
}
