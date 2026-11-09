package assistant

import (
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/agenttools"
)

// The display tools of OpenSpec change assistant-generative-ui (tasks 2.1, 2.2, 2.5).

// withExclusions gives the fixture's loop a registry that keeps projects away.
func withExclusions(f *fixture) *agenttools.Exclusions {
	x := agenttools.NewExclusions(f.sync.DB())
	clock := time.Date(2026, 10, 12, 10, 0, 0, 0, time.UTC)
	f.loop.Tools = agenttools.New(f.sync, agenttools.Options{Now: func() time.Time { return clock }, LocalToday: func() string { return "2026-10-12" }, Exclusions: x})
	f.loop.Log = slog.New(slog.DiscardHandler)
	return x
}

func offered(p *scripted) []string {
	var out []string
	for _, d := range p.req.Tools {
		out = append(out, d.Name)
	}
	return out
}

func has(list []string, name string) bool {
	for _, n := range list {
		if n == name {
			return true
		}
	}
	return false
}

func result(t *testing.T, r ToolResult) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal([]byte(r.Content), &m); err != nil {
		t.Fatalf("result %q: %v", r.Content, err)
	}
	return m
}

// 2.1: every display tool is offered without a skill; a skill offers only its own.
func TestDisplayToolsOffered(t *testing.T) {
	f := newFixture(t)
	p := &scripted{rounds: []scriptRound{{text: "Hi."}}}
	f.loop.Run(context.Background(), p, TurnInput{UserID: "u1", Zone: time.UTC, Messages: []Message{{Role: "user", Text: "hi"}}}, Events{Text: func(string) {}})
	got := offered(p)
	// 2.6: the fixed instructions say when to show a block and when not to.
	for _, w := range []string{"show_tasks", "do not repeat its content in prose", "At most 4 per answer", "After ask_choice, end your answer"} {
		if !strings.Contains(p.req.System, w) {
			t.Errorf("system prompt lacks %q", w)
		}
	}
	for _, d := range DisplayTools {
		if !has(got, d.Name) {
			t.Errorf("%s not offered without a skill: %v", d.Name, got)
		}
	}
	for id, want := range map[string][]string{"plan-week": {"show_calendar", "ask_choice"}, "break-down": nil, "triage-inbox": {"show_tasks", "ask_choice"}} {
		p := &scripted{rounds: []scriptRound{{text: "ok"}}}
		f.loop.Run(context.Background(), p, TurnInput{UserID: "u1", Zone: time.UTC, Messages: []Message{{Role: "user", Text: "go"}}, Skill: skill(t, id)}, Events{Text: func(string) {}})
		var shown []string
		for _, n := range offered(p) {
			if isDisplay(n) {
				shown = append(shown, n)
			}
		}
		if strings.Join(shown, ",") != strings.Join(want, ",") {
			t.Errorf("%s offers display tools %v, want %v", id, shown, want)
		}
	}
	// Display tools never turn strict tool use off where it was on (Anthropic's limits).
	for _, sk := range agenttools.Skills {
		p := &scripted{rounds: []scriptRound{{text: "ok"}}}
		f.loop.Run(context.Background(), p, TurnInput{UserID: "u1", Zone: time.UTC, Messages: []Message{{Role: "user", Text: "go"}}, Skill: skill(t, sk.ID)}, Events{Text: func(string) {}})
		var with, without []map[string]any
		for _, d := range p.req.Tools {
			with = append(with, strictSchema(d.Schema, false))
			if !isDisplay(d.Name) {
				without = append(without, strictSchema(d.Schema, false))
			}
		}
		if fitsAnthropicStrict(without) && !fitsAnthropicStrict(with) {
			t.Errorf("%s: display tools turn strict tool use off", sk.ID)
		}
	}
}

// 2.1: a display call outside the skill's list is refused and shows nothing.
func TestDisplayToolOutsideSkill(t *testing.T) {
	f := newFixture(t)
	f.task("u1", "t1", "Paint", nil)
	var blocks []Block
	p := &scripted{rounds: []scriptRound{
		{stop: StopToolUse, calls: []ToolCall{call("c1", "show_map", map[string]any{"task_ids": []string{"t1"}})}},
		{text: "ok"},
	}}
	f.loop.Run(context.Background(), p, TurnInput{UserID: "u1", Zone: time.UTC, Messages: []Message{{Role: "user", Text: "go"}}, Skill: skill(t, "plan-week")},
		Events{Text: func(string) {}, Block: func(b Block) { blocks = append(blocks, b) }})
	if len(blocks) != 0 || !p.results[0][0].IsError || result(t, p.results[0][0])["error"] != "unavailable" {
		t.Fatalf("blocks %v, result %s", blocks, p.results[0][0].Content)
	}
}

// 2.2: ids are checked (unknown, deleted, other people's, kept away), the
// result names kind and count only, nothing is written and no progress line is added.
func TestDisplayToolsCheckIDs(t *testing.T) {
	f := newFixture(t)
	x := withExclusions(f)
	f.task("u1", "t1", "Pay taxes", nil)
	f.task("u1", "t2", "Call Anna", nil)
	f.task("u1", "gone", "Old", map[string]any{"deleted_at": 5})
	f.task("u2", "theirs", "Someone else's", nil)
	f.put("u1", "project", "private", map[string]any{"name": "Private", "position": 1, "created_at": 1})
	f.task("u1", "hidden", "Hidden", map[string]any{"project_id": "private"})
	f.put("u1", "project", "garden", map[string]any{"name": "Garden", "position": 2, "created_at": 1})
	f.put("u1", "note", "n1", map[string]any{"title": "Ideas", "description": "x", "created_at": 1})
	f.put("u1", "note", "n2", map[string]any{"title": "Secret", "description": "x", "project_id": "private", "created_at": 1})
	f.put("u1", "place", "pl1", map[string]any{"name": "Post office", "created_at": 1})
	if err := x.Set(context.Background(), "u1", "private", true, nil); err != nil {
		t.Fatal(err)
	}
	before := f.opLog()
	calls := []ToolCall{
		call("a", "show_tasks", map[string]any{"ids": []string{"t1", "nope", "t2", "gone", "theirs", "hidden", "t1"}, "title": "Overdue"}),
		call("b", "show_project", map[string]any{"id": "private"}),
		call("c", "show_note", map[string]any{"id": "n2"}),
		call("d", "show_map", map[string]any{"task_ids": []string{"t1"}, "place_ids": []string{"pl1", "zzz"}}),
		call("e", "show_note", map[string]any{"id": "n1"}),
	}
	var blocks []Block
	var status []string
	p := &scripted{rounds: []scriptRound{{stop: StopToolUse, calls: calls}, {text: "Here."}}}
	res := f.loop.Run(context.Background(), p, TurnInput{UserID: "u1", Zone: time.UTC, Messages: []Message{{Role: "user", Text: "show me"}}},
		Events{Text: func(string) {}, Status: func(s string) { status = append(status, s) }, Block: func(b Block) { blocks = append(blocks, b) }})
	if res.Err != nil || len(res.Changes) != 0 {
		t.Fatalf("result %+v", res)
	}
	r := p.results[0]
	if m := result(t, r[0]); r[0].IsError || m["shown"] != "tasks" || m["count"] != 2.0 || m["not_found"] != 5.0 || strings.Contains(r[0].Content, "Pay taxes") {
		t.Fatalf("show_tasks result %s", r[0].Content)
	}
	// A kept-away project and a note in it read as not found, like unknown ids.
	for i := 1; i <= 2; i++ {
		if m := result(t, r[i]); !r[i].IsError || m["error"] != "not_found" {
			t.Fatalf("call %d result %s", i, r[i].Content)
		}
	}
	if m := result(t, r[3]); m["count"] != 2.0 || m["not_found"] != 1.0 {
		t.Fatalf("show_map result %s", r[3].Content)
	}
	want := []Block{
		{Kind: BlockTasks, IDs: []string{"t1", "t2"}, Title: "Overdue"},
		{Kind: BlockMap, TaskIDs: []string{"t1"}, PlaceIDs: []string{"pl1"}},
		{Kind: BlockNote, ID: "n1"},
	}
	gotJSON, _ := json.Marshal(blocks)
	wantJSON, _ := json.Marshal(want)
	if string(gotJSON) != string(wantJSON) {
		t.Fatalf("blocks\n got %s\nwant %s", gotJSON, wantJSON)
	}
	if len(status) != 0 {
		t.Fatalf("display calls added progress lines: %v", status)
	}
	if f.opLog() != before {
		t.Fatal("display tools wrote to the op log")
	}
}

// 2.2: arguments are checked before any id.
func TestDisplayToolsArguments(t *testing.T) {
	for _, c := range []struct {
		name string
		args map[string]any
	}{
		{"show_tasks", map[string]any{"ids": []string{}}},
		{"show_tasks", map[string]any{"ids": []string{"t1"}, "title": strings.Repeat("x", 81)}},
		{"show_calendar", map[string]any{"date": "12.10.2026", "span": "day"}},
		{"show_calendar", map[string]any{"date": "2026-10-12", "span": "month"}},
		{"ask_choice", map[string]any{"question": "Which?", "options": []string{"only one"}}},
		{"ask_choice", map[string]any{"question": "", "options": []string{"a", "b"}}},
		{"ask_choice", map[string]any{"question": "Which?", "options": []string{"a", strings.Repeat("b", 61)}}},
		{"show_map", map[string]any{}},
		{"show_note", map[string]any{"id": " "}},
	} {
		if _, err := parseBlock(c.name, mustJSON(c.args)); err == nil {
			t.Errorf("%s %v accepted", c.name, c.args)
		}
	}
	b, err := parseBlock("ask_choice", mustJSON(map[string]any{"question": " Saturday or Sunday? ", "options": []string{"Saturday", " Sunday "}}))
	if err != nil || b.Question != "Saturday or Sunday?" || strings.Join(b.Options, "|") != "Saturday|Sunday" {
		t.Fatalf("choice %+v %v", b, err)
	}
}

func mustJSON(v any) json.RawMessage {
	raw, _ := json.Marshal(v)
	return raw
}

// 2.2: a turn shows at most four blocks; the fifth call is refused.
func TestDisplayBlockLimit(t *testing.T) {
	f := newFixture(t)
	var calls []ToolCall
	for i := 0; i < MaxBlocks+1; i++ {
		calls = append(calls, call("c", "show_calendar", map[string]any{"date": "2026-10-12", "span": "day"}))
	}
	var blocks []Block
	p := &scripted{rounds: []scriptRound{{stop: StopToolUse, calls: calls}, {text: "ok"}}}
	f.loop.Run(context.Background(), p, TurnInput{UserID: "u1", Zone: time.UTC, Messages: []Message{{Role: "user", Text: "go"}}},
		Events{Text: func(string) {}, Block: func(b Block) { blocks = append(blocks, b) }})
	if len(blocks) != MaxBlocks {
		t.Fatalf("%d blocks shown", len(blocks))
	}
	last := p.results[0][MaxBlocks]
	if !last.IsError || result(t, last)["error"] != "block_limit" {
		t.Fatalf("fifth call %s", last.Content)
	}
}

// 2.2: a choice tells the model to end its answer.
func TestAskChoiceResult(t *testing.T) {
	f := newFixture(t)
	p := &scripted{rounds: []scriptRound{{stop: StopToolUse, calls: []ToolCall{call("c", "ask_choice", map[string]any{"question": "Saturday or Sunday?", "options": []string{"Saturday", "Sunday"}})}}, {text: ""}}}
	f.loop.Run(context.Background(), p, TurnInput{UserID: "u1", Zone: time.UTC, Messages: []Message{{Role: "user", Text: "move it"}}}, Events{Text: func(string) {}})
	m := result(t, p.results[0][0])
	if m["shown"] != "choice" || !strings.Contains(m["message"].(string), "End this answer") {
		t.Fatalf("choice result %v", m)
	}
}

// blockVectors pin the device's display tools to the server's (assistant-generative-ui
// task 4.2): the same rows, the same calls, the same blocks and tool results.
type blockVectors struct {
	Comment  string                      `json:"_comment"`
	User     string                      `json:"user"`
	Rows     map[string][]map[string]any `json:"rows"`
	KeptAway []string                    `json:"kept_away"`
	Cases    []blockCase                 `json:"cases"`
}

type blockCase struct {
	Name    string           `json:"name"`
	Calls   []blockCall      `json:"calls"`
	Blocks  []Block          `json:"blocks"`
	Results []map[string]any `json:"results"`
}

type blockCall struct {
	Name string         `json:"name"`
	Args map[string]any `json:"args"`
}

func blockRows() map[string][]map[string]any {
	return map[string][]map[string]any{
		"project": {
			{"id": "work", "name": "Work", "color": "#2563eb", "position": 1, "archived": false, "parent_id": nil, "created_at": 1, "deleted_at": nil},
			{"id": "private", "name": "Private", "color": "#16a34a", "position": 2, "archived": false, "parent_id": nil, "created_at": 1, "deleted_at": nil},
			{"id": "old", "name": "Old", "color": "#64748b", "position": 3, "archived": false, "parent_id": nil, "created_at": 1, "deleted_at": 5},
		},
		"task": {
			{"id": "t1", "title": "Pay taxes", "project_id": nil, "priority": 4, "labels": []string{}, "created_at": 1, "deleted_at": nil, "completed_at": nil},
			{"id": "t2", "title": "Call Anna", "project_id": "work", "priority": 4, "labels": []string{}, "created_at": 1, "deleted_at": nil, "completed_at": nil},
			{"id": "t3", "title": "Done one", "project_id": nil, "priority": 4, "labels": []string{}, "created_at": 1, "deleted_at": nil, "completed_at": 9},
			{"id": "gone", "title": "Deleted", "project_id": nil, "priority": 4, "labels": []string{}, "created_at": 1, "deleted_at": 5, "completed_at": nil},
			{"id": "hidden", "title": "Hidden", "project_id": "private", "priority": 4, "labels": []string{}, "created_at": 1, "deleted_at": nil, "completed_at": nil},
			{"id": "orphan", "title": "In a deleted project", "project_id": "old", "priority": 4, "labels": []string{}, "created_at": 1, "deleted_at": nil, "completed_at": nil},
		},
		"note": {
			{"id": "n1", "title": "Ideas", "description": "x", "project_id": nil, "created_at": 1, "deleted_at": nil},
			{"id": "n2", "title": "Secret", "description": "x", "project_id": "private", "created_at": 1, "deleted_at": nil},
		},
		"place": {
			{"id": "pl1", "name": "Post office", "address": "Station Road 4", "position": 1, "created_at": 1, "deleted_at": nil},
			{"id": "pl2", "name": "Closed shop", "address": "", "position": 2, "created_at": 1, "deleted_at": 5},
		},
	}
}

var blockCalls = []struct {
	name  string
	calls []blockCall
}{
	{"tasks keep live visible ids in order", []blockCall{{"show_tasks", map[string]any{"ids": []string{"t2", "nope", "t1", "gone", "hidden", "orphan", "t3", "t1"}, "title": " Overdue "}}}},
	{"no id found shows nothing", []blockCall{{"show_tasks", map[string]any{"ids": []string{"hidden", "gone"}}}}},
	{"kept-away project reads as not found", []blockCall{{"show_project", map[string]any{"id": "private"}}, {"show_project", map[string]any{"id": "work"}}}},
	{"notes", []blockCall{{"show_note", map[string]any{"id": "n2"}}, {"show_note", map[string]any{"id": "n1"}}}},
	{"map of tasks and places", []blockCall{{"show_map", map[string]any{"task_ids": []string{"t1", "hidden"}, "place_ids": []string{"pl1", "pl2"}}}}},
	{"calendar and choice", []blockCall{
		{"show_calendar", map[string]any{"date": "2026-11-12", "span": "week"}},
		{"ask_choice", map[string]any{"question": "Saturday or Sunday?", "options": []string{" Saturday", "Sunday "}}},
	}},
	{"invalid arguments", []blockCall{
		{"show_calendar", map[string]any{"date": "12.11.2026", "span": "day"}},
		{"ask_choice", map[string]any{"question": "One?", "options": []string{"only"}}},
		{"show_map", map[string]any{}},
		{"show_tasks", map[string]any{"ids": []string{}}},
	}},
	{"fifth block refused", []blockCall{
		{"show_calendar", map[string]any{"date": "2026-11-12", "span": "day"}},
		{"show_calendar", map[string]any{"date": "2026-11-13", "span": "day"}},
		{"show_note", map[string]any{"id": "n1"}},
		{"show_tasks", map[string]any{"ids": []string{"t1"}}},
		{"show_tasks", map[string]any{"ids": []string{"t2"}}},
	}},
}

func TestDeviceBlockVectors(t *testing.T) {
	f := newFixture(t)
	x := withExclusions(f)
	rows := blockRows()
	for _, entity := range []string{"project", "task", "note", "place"} {
		for _, r := range rows[entity] {
			fields := map[string]any{}
			for k, v := range r {
				if k != "id" {
					fields[k] = v
				}
			}
			f.put("u1", entity, r["id"].(string), fields)
		}
	}
	if err := x.Set(context.Background(), "u1", "private", true, nil); err != nil {
		t.Fatal(err)
	}
	bv := blockVectors{User: "u1", Rows: rows, KeptAway: []string{"private"},
		Comment: "Generated by go test ./internal/assistant -run DeviceBlockVectors -update. Each case is one turn; an invalid_arguments result keeps its code only."}
	for _, c := range blockCalls {
		bc := blockCase{Name: c.name, Blocks: []Block{}}
		d := &displayTurn{shower: f.loop.Tools, userID: "u1", emit: func(b Block) { bc.Blocks = append(bc.Blocks, b) }}
		for i, call := range c.calls {
			args, _ := json.Marshal(call.Args)
			out, isErr, err := d.run(context.Background(), ToolCall{ID: "c", Name: call.Name, Args: args})
			if err != nil {
				t.Fatalf("%s call %d: %v", c.name, i, err)
			}
			var res map[string]any
			_ = json.Unmarshal([]byte(out), &res)
			if res["error"] == "invalid_arguments" {
				res = map[string]any{"error": "invalid_arguments"}
			}
			res["is_error"] = isErr
			bc.Results = append(bc.Results, res)
		}
		bc.Calls = c.calls
		bv.Cases = append(bv.Cases, bc)
	}
	checkFile(t, "blocks.vectors.json", bv)
}
