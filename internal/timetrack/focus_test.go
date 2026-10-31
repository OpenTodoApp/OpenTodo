package timetrack

import (
	"encoding/json"
	"testing"
)

func TestFocusFromRow(t *testing.T) {
	row := func(m map[string]string) map[string]json.RawMessage {
		out := map[string]json.RawMessage{}
		for k, v := range m {
			out[k] = json.RawMessage(v)
		}
		return out
	}
	if f := FocusFromRow(row(map[string]string{"started_at": "1"})); f != nil {
		t.Fatalf("older entry: got %+v, want nil", f)
	}
	if f := FocusFromRow(row(map[string]string{"focus_mode": `""`, "focus_session": "0", "planned_end_at": "null"})); f != nil {
		t.Fatalf("plain timer: got %+v, want nil", f)
	}
	f := FocusFromRow(row(map[string]string{"focus_mode": `"pomodoro"`, "focus_session": "3", "planned_end_at": "1500"}))
	if f == nil || f.Mode != "pomodoro" || f.Session != 3 || f.PlannedEndAt == nil || *f.PlannedEndAt != 1500 {
		t.Fatalf("pomodoro: got %+v", f)
	}
	f = FocusFromRow(row(map[string]string{"focus_mode": `"flowtime"`, "focus_session": "0", "planned_end_at": "null"}))
	if f == nil || f.Mode != "flowtime" || f.PlannedEndAt != nil {
		t.Fatalf("flowtime: got %+v", f)
	}
	if f := FocusFromRow(row(map[string]string{"focus_mode": `"ultradian"`})); f == nil || f.Mode != "ultradian" {
		t.Fatalf("unknown mode is kept: got %+v", f)
	}
}
