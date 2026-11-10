package assistant

import (
	"encoding/json"
	"testing"
)

// The in-app assistant's find_free_time gets the device's working day when the
// model names none (assistant-time-blocks D2), so its answer matches the block.
func TestFindFreeTimeGetsTheWorkday(t *testing.T) {
	w := &Workday{StartHour: 8, EndHour: 18, DayLength: 480}
	args := func(c ToolCall) map[string]any {
		var m map[string]any
		_ = json.Unmarshal(c.Args, &m)
		return m
	}
	got := args(withWorkday(ToolCall{Name: "find_free_time", Args: json.RawMessage(`{"min_minutes":60}`)}, w))
	if got["day_start_hour"] != 8.0 || got["day_end_hour"] != 18.0 || got["min_minutes"] != 60.0 {
		t.Fatalf("filled = %v", got)
	}
	if got := args(withWorkday(ToolCall{Name: "find_free_time"}, w)); got["day_start_hour"] != 8.0 {
		t.Fatalf("no arguments = %v", got)
	}
	// The model's own hours, another tool, no working day and a broken one stay as they are.
	for _, c := range []struct {
		call ToolCall
		w    *Workday
	}{
		{ToolCall{Name: "find_free_time", Args: json.RawMessage(`{"day_end_hour":20}`)}, w},
		{ToolCall{Name: "list_frames", Args: json.RawMessage(`{}`)}, w},
		{ToolCall{Name: "find_free_time", Args: json.RawMessage(`{}`)}, nil},
		{ToolCall{Name: "find_free_time", Args: json.RawMessage(`{}`)}, &Workday{StartHour: 18, EndHour: 8, DayLength: 480}},
		{ToolCall{Name: "find_free_time", Args: json.RawMessage(`[1]`)}, w},
	} {
		if out := withWorkday(c.call, c.w); string(out.Args) != string(c.call.Args) {
			t.Errorf("%s %s changed to %s", c.call.Name, c.call.Args, out.Args)
		}
	}
	if statusFor("find_free_time", nil) != "Looking for free time…" {
		t.Fatal("progress line")
	}
}
