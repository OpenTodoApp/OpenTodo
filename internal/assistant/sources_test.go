package assistant

import (
	"context"
	"encoding/json"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"
)

// TestSourceVectors pins SourceOf to the device's reader (assistant-tool-sources D1).
func TestSourceVectors(t *testing.T) {
	raw, err := os.ReadFile("../../web/src/lib/assistantDevice/sources.vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Vectors []struct {
			Name, Tool, Result string
			Source             *Source
		}
	}
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	if len(f.Vectors) == 0 {
		t.Fatal("no vectors")
	}
	for _, v := range f.Vectors {
		got, ok := SourceOf(v.Tool, v.Result)
		if v.Source == nil {
			if ok {
				t.Errorf("%s: got a source %+v, want none", v.Name, got)
			}
			continue
		}
		if !ok || !reflect.DeepEqual(got, *v.Source) {
			t.Errorf("%s: got %+v (%v), want %+v", v.Name, got, ok, *v.Source)
		}
	}
}

// TestLoopStreamsSources: a successful read streams its ids, a failed one and a
// write stream nothing (assistant-tool-sources).
func TestLoopStreamsSources(t *testing.T) {
	f := newFixture(t)
	f.task("u1", "a1", "Pay rent", nil)
	f.task("u1", "b2", "Call Bea", nil)
	p := &scripted{rounds: []scriptRound{
		{calls: []ToolCall{call("c1", "search_tasks", map[string]any{"query": "a"}), call("c2", "get_task", map[string]any{"id": "missing"})}, stop: StopToolUse},
		{text: "Two tasks.", stop: StopEndTurn},
	}}
	var got []Source
	res := f.loop.Run(context.Background(), p, TurnInput{UserID: "u1", Zone: time.UTC, Messages: []Message{{Role: "user", Text: "find a"}}},
		Events{Source: func(s Source) { got = append(got, s) }})
	if res.Err != nil {
		t.Fatal(res.Err)
	}
	if len(got) != 1 || got[0].Of != "tasks" || got[0].Total != 2 || len(got[0].IDs) != 2 {
		t.Fatalf("sources = %+v, want one tasks source", got)
	}
	raw, _ := json.Marshal(got[0])
	if strings.Contains(string(raw), "Pay rent") || strings.Contains(string(raw), "Call Bea") {
		t.Fatalf("source carries content: %s", raw)
	}
}
