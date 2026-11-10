package assistant

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

// Proposals that grow over turns (OpenSpec change assistant-proposal-editing, task 1.3).

func raw(v any) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}

func moved(id, date string) Proposed {
	return Proposed{Entity: "task", EntityID: id, Patch: map[string]json.RawMessage{"due": raw(map[string]any{"date": date})}, Base: map[string]json.RawMessage{"due": raw(nil)}}
}

func changeIDs(cs []Proposed) []string {
	var out []string
	for _, c := range cs {
		out = append(out, c.EntityID)
	}
	return out
}

// The open proposal seeds the draft: a new write adds to it, the instructions
// list it, the drop tool is offered, and the change set is the merge.
func TestOpenProposalGrows(t *testing.T) {
	f := newFixture(t)
	for _, id := range []string{"t1", "t2", "t3"} {
		f.task("u1", id, "Task "+id, nil)
	}
	open := []Proposed{moved("t1", "2026-10-14"), moved("t2", "2026-10-14"), moved("t3", "2026-10-15")}
	p := &scripted{rounds: []scriptRound{
		{stop: StopToolUse, calls: []ToolCall{call("c1", "create_tasks", map[string]any{"items": []any{map[string]any{"title": "Call the plumber"}}})}},
		{text: "Added it."},
	}}
	res := f.loop.Run(context.Background(), p, TurnInput{UserID: "u1", Zone: time.UTC, Open: open, Messages: []Message{{Role: "user", Text: "also add a task to call the plumber"}}}, Events{Text: func(string) {}})
	if res.Err != nil {
		t.Fatal(res.Err)
	}
	if len(res.Changes) != 4 {
		t.Fatalf("changes %v", changeIDs(res.Changes))
	}
	created := 0
	for _, c := range res.Changes {
		if c.Create && rawString(c.Patch["title"]) == "Call the plumber" {
			created++
		}
	}
	if created != 1 || !has(offered(p), DropTool.Name) {
		t.Fatalf("created %d, offered %v", created, offered(p))
	}
	if !strings.Contains(p.req.System, OpenProposalNote) || !strings.Contains(p.req.System, `{"entity":"task","id":"t3","set":{"due":{"date":"2026-10-15"}}}`) {
		t.Fatalf("instructions lack the open proposal:\n%s", p.req.System)
	}
}

// drop_from_proposal removes items; a change to an item in it replaces its values.
func TestOpenProposalDropAndChange(t *testing.T) {
	f := newFixture(t)
	for _, id := range []string{"t1", "t2"} {
		f.task("u1", id, "Task "+id, nil)
	}
	open := []Proposed{moved("t1", "2026-10-14"), moved("t2", "2026-10-14")}
	p := &scripted{rounds: []scriptRound{
		{stop: StopToolUse, calls: []ToolCall{
			call("c1", DropTool.Name, map[string]any{"ids": []string{"t1", "nope"}}),
			call("c2", "schedule_tasks", map[string]any{"ids": []string{"t2"}, "due": map[string]any{"date": "2026-10-16"}}),
		}},
		{text: "Done."},
	}}
	res := f.loop.Run(context.Background(), p, TurnInput{UserID: "u1", Zone: time.UTC, Open: open, Messages: []Message{{Role: "user", Text: "drop the first, move the second to Friday"}}}, Events{Text: func(string) {}})
	if res.Err != nil {
		t.Fatal(res.Err)
	}
	if len(res.Changes) != 1 || res.Changes[0].EntityID != "t2" || !strings.Contains(string(res.Changes[0].Patch["due"]), "2026-10-16") {
		t.Fatalf("changes %+v", res.Changes)
	}
	if m := result(t, p.results[0][0]); m["dropped"] != float64(1) || m["not_in_proposal"] != float64(1) {
		t.Fatalf("drop result %v", m)
	}
}

// Items that fail a check are left out: someone else's, kept away, unknown
// fields, a new item under an existing id; without an open proposal there is no drop tool.
func TestOpenProposalChecks(t *testing.T) {
	f := newFixture(t)
	x := withExclusions(f)
	f.task("u1", "t1", "Mine", nil)
	f.task("u2", "theirs", "Someone else's", nil)
	f.put("u1", "project", "private", map[string]any{"name": "Private", "position": 1, "created_at": 1})
	f.task("u1", "hidden", "In private", map[string]any{"project_id": "private"})
	if err := x.Set(context.Background(), "u1", "private", true, nil); err != nil {
		t.Fatal(err)
	}
	newTask := Proposed{Entity: "task", EntityID: "n1", Create: true, Patch: map[string]json.RawMessage{"title": raw("New")}}
	clash := Proposed{Entity: "task", EntityID: "t1", Create: true, Patch: map[string]json.RawMessage{"title": raw("Clash")}}
	unknown := Proposed{Entity: "task", EntityID: "t1", Patch: map[string]json.RawMessage{"colour": raw("red")}}
	badKind := Proposed{Entity: "task", EntityID: "t1", Patch: map[string]json.RawMessage{"priority": raw("high")}}
	open := []Proposed{moved("t1", "2026-10-14"), moved("theirs", "2026-10-14"), moved("hidden", "2026-10-14"), newTask, clash, unknown, badKind,
		{Entity: "user_prefs", EntityID: "u1", Patch: map[string]json.RawMessage{"today_limit": raw(3)}}}
	p := &scripted{rounds: []scriptRound{{text: "ok"}}}
	res := f.loop.Run(context.Background(), p, TurnInput{UserID: "u1", Zone: time.UTC, Open: open, Messages: []Message{{Role: "user", Text: "go"}}}, Events{Text: func(string) {}})
	if got := strings.Join(changeIDs(res.Changes), ","); got != "n1,t1" && got != "t1,n1" {
		t.Fatalf("kept %s", got)
	}
	if strings.Contains(p.req.System, "theirs") || strings.Contains(p.req.System, "hidden") {
		t.Fatal("instructions name an item that was left out")
	}
	p2 := &scripted{rounds: []scriptRound{{text: "ok"}}}
	f.loop.Run(context.Background(), p2, TurnInput{UserID: "u1", Zone: time.UTC, Messages: []Message{{Role: "user", Text: "go"}}}, Events{Text: func(string) {}})
	if has(offered(p2), DropTool.Name) || strings.Contains(p2.req.System, OpenProposalNote) {
		t.Fatal("a turn without an open proposal offers the drop tool")
	}
}
