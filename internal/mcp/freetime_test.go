package mcp

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/agenttools"
	"github.com/OpenTodoApp/opentodo/internal/freetime"
)

// find_free_time (OpenSpec change assistant-time-blocks, spec "Find free time").
func TestFindFreeTime(t *testing.T) {
	f := newFixture(t)
	x := agenttools.NewExclusions(f.sync.DB())
	var asked [2]string
	events := func(_ context.Context, uid, from, to string) ([]freetime.Event, error) {
		asked = [2]string{from, to}
		if uid != "u1" {
			return nil, nil
		}
		return []freetime.Event{
			{Start: freetime.When{Date: "2026-03-11", Time: "09:00"}, End: freetime.When{Date: "2026-03-11", Time: "11:00"}},
			{Start: freetime.When{Date: "2026-03-11", Time: "13:00"}, End: freetime.When{Date: "2026-03-11", Time: "13:30"}},
		}, nil
	}
	f.srv = New(f.sync, Options{Tools: agenttools.New(f.sync, agenttools.Options{Now: func() time.Time { return f.now }, Exclusions: x, Events: events})})
	f.put("u1", "project", "hidden", map[string]any{"name": "Private", "color": "#2563eb", "position": 1, "created_at": 1})
	if err := x.Set(context.Background(), "u1", "hidden", true, nil); err != nil {
		t.Fatal(err)
	}
	f.task("u1", "t1", "Call the bank", map[string]any{"due": map[string]any{"date": "2026-03-11", "time": "16:00"}, "estimate_minutes": 60})
	f.task("u1", "t2", "Done already", map[string]any{"due": map[string]any{"date": "2026-03-11", "time": "18:00"}, "estimate_minutes": 60, "completed_at": 5})
	f.task("u1", "t3", "Secret", map[string]any{"project_id": "hidden", "due": map[string]any{"date": "2026-03-11", "time": "19:00"}, "estimate_minutes": 60})
	f.put("u1", "slot", "s1", map[string]any{"title": "Admin", "date": "2026-03-11", "start": "20:00", "minutes": 30, "task_ids": []string{}})
	f.put("u1", "frame", "fr", map[string]any{"title": "Deep work", "weekdays": "3", "start": "06:00", "end": "08:00", "position": 1})

	// Tomorrow, an hour at least: the fixture's clock is 2026-03-10 23:30 UTC.
	res := f.tool("u1", "find_free_time", map[string]any{"from": "2026-03-11", "min_minutes": 60, "timezone": "UTC"})
	if asked != [2]string{"2026-03-11", "2026-03-11"} {
		t.Fatalf("events asked for %v", asked)
	}
	days := res["days"].([]any)
	if len(days) != 1 {
		t.Fatalf("days = %v", days)
	}
	day := days[0].(map[string]any)
	var got []string
	for _, s := range day["free"].([]any) {
		m := s.(map[string]any)
		got = append(got, m["start"].(string)+"-"+m["end"].(string))
		if m["minutes"].(float64) < 60 {
			t.Fatalf("short stretch %v", m)
		}
	}
	// Busy: the frame 06-08, the events 09-11 and 13-13:30, the task 16-17, the slot 20-20:30.
	// The done task (18:00) and the kept-away one (19:00) take no time.
	if want := "08:00-09:00 11:00-13:00 13:30-16:00 17:00-20:00 20:30-22:00"; strings.Join(got, " ") != want {
		t.Fatalf("free = %v, want %s", got, want)
	}
	if day["free_minutes"].(float64) != 60+120+150+180+90 {
		t.Fatalf("free_minutes = %v", day["free_minutes"])
	}
	if wd := res["working_day"].(map[string]any); wd["start"] != "06:00" || wd["end"] != "22:00" {
		t.Fatalf("working_day = %v", wd)
	}

	// The working day can be given; today starts now (23:30 is past it).
	res = f.tool("u1", "find_free_time", map[string]any{"from": "2026-03-10", "to": "2026-03-11", "day_start_hour": 8, "day_end_hour": 18, "min_minutes": 120})
	days = res["days"].([]any)
	if len(days[0].(map[string]any)["free"].([]any)) != 0 || len(days[1].(map[string]any)["free"].([]any)) != 2 {
		t.Fatalf("working day = %v", days)
	}

	// Range too long: invalid arguments naming the limit.
	r := f.call("u1", "tools/call", map[string]any{"name": "find_free_time", "arguments": map[string]any{"from": "2026-03-11", "to": "2026-04-09"}})
	if errCode(r) != -32602 || !strings.Contains(r["error"].(map[string]any)["message"].(string), "14-day limit") {
		t.Fatalf("long range = %v", r)
	}
	for _, bad := range []map[string]any{{"min_minutes": 0}, {"day_start_hour": 10, "day_end_hour": 9}, {"to": "2026-03-01"}, {"cursor": "x"}} {
		if r := f.call("u1", "tools/call", map[string]any{"name": "find_free_time", "arguments": bad}); errCode(r) != -32602 {
			t.Fatalf("%v = %v", bad, r)
		}
	}
}
