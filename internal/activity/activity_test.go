package activity

import (
	"bytes"
	"encoding/json"
	"os"
	"reflect"
	"strings"
	"testing"
)

type fixtureCase struct {
	Name   string            `json:"name"`
	Ops    []json.RawMessage `json:"ops"`
	Events json.RawMessage   `json:"events,omitempty"`
}

type fixture struct {
	About string        `json:"about"`
	Cases []fixtureCase `json:"cases"`
}

const fixturePath = "testdata/activity_fixture.json"

// TestActivityFixture derives every case of the shared fixture and compares the
// events with the expected ones; web/src/lib/activity.test.ts runs the same file.
// OPENTODO_UPDATE_FIXTURE=1 rewrites the expected events from this implementation
// (review the diff: the fixture is the contract between server and client).
func TestActivityFixture(t *testing.T) {
	raw, err := os.ReadFile(fixturePath)
	if err != nil {
		t.Fatal(err)
	}
	var fx fixture
	if err := json.Unmarshal(raw, &fx); err != nil {
		t.Fatal(err)
	}
	update := os.Getenv("OPENTODO_UPDATE_FIXTURE") == "1"
	for i, c := range fx.Cases {
		var ops []Op
		for _, o := range c.Ops {
			var op Op
			if err := json.Unmarshal(o, &op); err != nil {
				t.Fatalf("%s: %v", c.Name, err)
			}
			ops = append(ops, op)
		}
		got, _ := json.Marshal(Derive(ops, nil))
		if update {
			fx.Cases[i].Events = got
			continue
		}
		var want, have any
		if err := json.Unmarshal(c.Events, &want); err != nil {
			t.Fatalf("%s: expected events: %v", c.Name, err)
		}
		_ = json.Unmarshal(got, &have)
		if !reflect.DeepEqual(want, have) {
			t.Errorf("%s:\n got %s\nwant %s", c.Name, got, c.Events)
		}
	}
	if update {
		if err := os.WriteFile(fixturePath, formatFixture(t, fx), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

// formatFixture keeps one op per line so the fixture stays reviewable.
func formatFixture(t *testing.T, fx fixture) []byte {
	var b bytes.Buffer
	about, _ := json.Marshal(fx.About)
	b.WriteString("{\n  \"about\": " + string(about) + ",\n  \"cases\": [\n")
	for i, c := range fx.Cases {
		name, _ := json.Marshal(c.Name)
		b.WriteString("    {\n      \"name\": " + string(name) + ",\n      \"ops\": [\n")
		for j, o := range c.Ops {
			var buf bytes.Buffer
			if err := json.Compact(&buf, o); err != nil {
				t.Fatal(err)
			}
			b.WriteString("        " + buf.String())
			if j < len(c.Ops)-1 {
				b.WriteString(",")
			}
			b.WriteString("\n")
		}
		var ev bytes.Buffer
		if err := json.Indent(&ev, c.Events, "      ", "  "); err != nil {
			t.Fatal(err)
		}
		b.WriteString("      ],\n      \"events\": " + ev.String() + "\n    }")
		if i < len(fx.Cases)-1 {
			b.WriteString(",")
		}
		b.WriteString("\n")
	}
	b.WriteString("  ]\n}\n")
	return b.Bytes()
}

func TestPriorValuesAndNewest(t *testing.T) {
	ops := []Op{{ID: "x", Actor: "a", Entity: "task", EntityID: "t", Field: "due", Value: json.RawMessage(`{"date":"2026-10-12"}`), TS: 10, Device: "d"}}
	evs := Derive(ops, map[string]json.RawMessage{Key("task", "t", "due"): json.RawMessage(`{"date":"2026-10-01"}`)})
	if len(evs) != 1 || evs[0].Kind != KindRescheduled || string(evs[0].Changes[0].From) != `{"date":"2026-10-01"}` {
		t.Fatalf("events = %+v", evs)
	}
	list := []Event{{ID: "a", TS: 1}, {ID: "c", TS: 2}, {ID: "b", TS: 2}}
	Newest(list)
	var ids []string
	for _, e := range list {
		ids = append(ids, e.ID)
	}
	if strings.Join(ids, ",") != "c,b,a" {
		t.Fatalf("newest = %v", ids)
	}
}

func TestPage(t *testing.T) {
	var list []Event
	for i := 0; i < 5; i++ {
		list = append(list, Event{ID: string(rune('a' + i)), TS: int64(10 - i/2)})
	}
	Newest(list)
	seen := map[string]bool{}
	cursor := ""
	for pages := 0; ; pages++ {
		page, next, err := Page(list, cursor, 2)
		if err != nil {
			t.Fatal(err)
		}
		for _, e := range page {
			if seen[e.ID] {
				t.Fatalf("overlap at %s", e.ID)
			}
			seen[e.ID] = true
		}
		if next == "" {
			break
		}
		cursor = next
		if pages > 5 {
			t.Fatal("no progress")
		}
	}
	if len(seen) != 5 {
		t.Fatalf("saw %d events", len(seen))
	}
	if _, _, err := Page(list, "garbage", 2); err == nil {
		t.Fatal("bad cursor accepted")
	}
}
