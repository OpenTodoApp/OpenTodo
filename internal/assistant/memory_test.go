package assistant

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/agenttools"
)

// assistant-memory 2.1, 2.2: remember plans a memory item into the draft and
// never writes; every turn sends the live items in order, and the item a later
// turn needs is there; a skill turn keeps the items but offers no remember.
func TestRememberProposesAndTurnsSendMemory(t *testing.T) {
	f := newFixture(t)
	f.put("u1", "memory", "m2", map[string]any{"text": "Mornings are for deep work", "position": 2, "created_at": 1})
	f.put("u1", "memory", "m1", map[string]any{"text": "Anna is my manager", "position": 1, "created_at": 1})
	f.put("u1", "memory", "gone", map[string]any{"text": "Old fact", "position": 0, "created_at": 1, "deleted_at": 5})
	f.put("u1", "memory", "enc", map[string]any{"text": "enc:v1:" + strings.Repeat("A", 60), "position": 3, "created_at": 1})
	f.put("u2", "memory", "other", map[string]any{"text": "Someone else's fact", "position": 1, "created_at": 1})
	before := f.opLog()
	p := &scripted{rounds: proposing(
		scriptRound{calls: []ToolCall{call("c1", "remember", map[string]any{"text": "  Does not work\non Fridays "})}, stop: StopToolUse},
		scriptRound{text: "I've proposed remembering that.", stop: StopEndTurn},
	)}
	res, _, _ := run(f, p, "I don't work on Fridays")
	if res.Err != nil || len(res.Changes) != 1 {
		t.Fatalf("result = %+v", res)
	}
	c := res.Changes[0]
	if c.Entity != "memory" || !c.Create || string(c.Patch["text"]) != `"Does not work on Fridays"` {
		t.Fatalf("change = %+v", c)
	}
	if f.opLog() != before {
		t.Fatal("the turn wrote")
	}
	sys := p.req.System
	want := "\n\n" + MemoryNote + "\n- Anna is my manager\n- Mornings are for deep work\n"
	if !strings.Contains(sys, want) || strings.Contains(sys, "Old fact") || strings.Contains(sys, "enc:v1:") || strings.Contains(sys, "Someone else") {
		t.Fatalf("system text memory section:\n%s", sys)
	}
	// remember is a write: offered once the model asked for the write tools (assistant-lean-tools D1).
	if strings.Contains(strings.Join(p.offered(0), ","), "remember") || !strings.Contains(strings.Join(p.offered(1), ","), "remember") {
		t.Fatalf("remember offered %v then %v", p.offered(0), p.offered(1))
	}

	// A skill turn: the items are sent, remember is neither offered nor run.
	sk, _ := agenttools.SkillByID("plan-week")
	p2 := &scripted{rounds: []scriptRound{
		{calls: []ToolCall{call("c1", "remember", map[string]any{"text": "Likes Mondays"})}, stop: StopToolUse},
		{text: "Done.", stop: StopEndTurn},
	}}
	res2 := f.loop.Run(context.Background(), p2, TurnInput{UserID: "u1", Zone: time.UTC, Skill: &sk, Messages: []Message{{Role: "user", Text: "plan"}}}, Events{Text: func(string) {}})
	if !strings.Contains(p2.req.System, "- Anna is my manager") || len(res2.Changes) != 0 {
		t.Fatalf("skill turn: %+v", res2)
	}
	for _, tool := range p2.req.Tools {
		if tool.Name == "remember" {
			t.Fatal("remember offered to a skill")
		}
	}
	if !strings.Contains(p2.results[0][0].Content, "unavailable") {
		t.Fatalf("skill remember result = %s", p2.results[0][0].Content)
	}
}

// "The 21st item" and duplicates: remember refuses both and adds nothing.
func TestRememberRefusals(t *testing.T) {
	var live []string
	for i := 0; i < MaxMemoryItems-1; i++ {
		live = append(live, "Fact "+string(rune('a'+i)))
	}
	out, ch := PlanRemember(live, nil, json.RawMessage(`{"text":"FACT A"}`), "id1", 1)
	if ch != nil || out["error"] != "already_remembered" {
		t.Fatalf("duplicate = %v", out)
	}
	_, ch = PlanRemember(live, nil, json.RawMessage(`{"text":"Twentieth"}`), "id1", 1)
	if ch == nil {
		t.Fatal("the 20th item was refused")
	}
	out, ch = PlanRemember(live, agenttools.ChangeSet{*ch}, json.RawMessage(`{"text":"Twenty-first"}`), "id2", 1)
	if ch != nil || out["error"] != "memory_full" {
		t.Fatalf("21st = %v", out)
	}
	for _, bad := range []string{`{}`, `{"text":"   "}`, `{"text":"` + strings.Repeat("x", 201) + `"}`, `{"text":"ok","pin":true}`, `{"text":"enc:v1:AAAA"}`, `[]`} {
		if out, ch := PlanRemember(nil, nil, json.RawMessage(bad), "id", 1); ch != nil || out["error"] != "invalid_arguments" {
			t.Fatalf("%s = %v", bad, out)
		}
	}
}

// "Memory stays in the app": remember is not a registry tool, so neither MCP
// clients nor agent tokens can list or call it.
func TestRememberIsNotInTheRegistry(t *testing.T) {
	f := newFixture(t)
	for _, c := range []agenttools.Caller{Caller("u1"), {UserID: "u1", Scope: "read"}, {UserID: "u1", Scope: agenttools.ScopeRoutine}, {UserID: "u1", Scope: agenttools.ScopeAgent, OwnerAllowsWrites: true, UserAllowsWrites: true}} {
		for _, d := range f.loop.Tools.Definitions(c) {
			if d.Name == "remember" || strings.Contains(strings.ToLower(d.Name), "memory") {
				t.Fatalf("registry offers %s", d.Name)
			}
		}
		if _, ok := f.loop.Tools.Lookup("remember", c); ok {
			t.Fatal("registry knows remember")
		}
	}
}

// An open proposal keeps its new memory items (checked here), and drops one
// naming an existing item, a ciphertext text or a field remember never writes.
func TestOpenProposalKeepsMemory(t *testing.T) {
	f := newFixture(t)
	f.put("u1", "memory", "m1", map[string]any{"text": "Anna is my manager", "position": 1, "created_at": 1})
	raw := func(s string) json.RawMessage { return json.RawMessage(s) }
	open := []Proposed{
		{Entity: "memory", EntityID: "new1", Create: true, Patch: map[string]json.RawMessage{"text": raw(`"Does not work on Fridays"`), "position": raw(`5`), "created_at": raw(`5`)}},
		{Entity: "memory", EntityID: "m1", Create: true, Patch: map[string]json.RawMessage{"text": raw(`"Squat"`)}},
		{Entity: "memory", EntityID: "new2", Create: true, Patch: map[string]json.RawMessage{"text": raw(`"enc:v1:AAAA"`)}},
		{Entity: "memory", EntityID: "new3", Create: true, Patch: map[string]json.RawMessage{"text": raw(`"Fine"`), "deleted_at": raw(`5`)}},
		{Entity: "memory", EntityID: "m1", Patch: map[string]json.RawMessage{"text": raw(`"Edit"`)}},
	}
	got := f.loop.openDraft(context.Background(), "u1", open, f.loop.Log)
	if len(got) != 1 || got[0].EntityID != "new1" {
		t.Fatalf("kept %+v", got)
	}
}

// "Memory stays in the app": a routine's AI step sends its fixed instructions
// and its own material only, never the person's memory.
func TestRoutineNeverSendsMemory(t *testing.T) {
	p := &scripted{rounds: []scriptRound{{text: "- Send the slides\n", in: 10, out: 5}}}
	f := newFixture(t)
	f.put("u1", "memory", "m1", map[string]any{"text": "Secret preference xyzzy", "position": 1, "created_at": 1})
	ctx := context.Background()
	st := NewStore(f.sync.DB(), t.TempDir(), func() time.Time { return time.Date(2026, 11, 6, 17, 0, 0, 0, time.UTC) })
	if _, err := st.SaveSettings(ctx, "owner", anthropicOn(), KeyChange{Anthropic: strp("sk-test")}, nil, nil); err != nil {
		t.Fatal(err)
	}
	if err := st.SetConsent(ctx, "u1", Anthropic, true, true); err != nil {
		t.Fatal(err)
	}
	svc := NewService(st, f.loop)
	svc.stub = p
	set, _ := st.Settings(ctx)
	if _, err := svc.Routine(ctx, set, routineCall("lines")); err != nil {
		t.Fatal(err)
	}
	blob, _ := json.Marshal(p.req)
	if strings.Contains(string(blob), "xyzzy") || strings.Contains(string(blob), MemoryNote) {
		t.Fatalf("routine request carries memory: %s", blob)
	}
}
