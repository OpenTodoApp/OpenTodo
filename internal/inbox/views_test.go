package inbox

import (
	"encoding/json"
	"os"
	"testing"
)

// TestViewVectors: Someday and Anytime match the vectors web/src/lib/views.ts reads.
func TestViewVectors(t *testing.T) {
	raw, err := os.ReadFile("../../web/src/lib/views.vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var vs []struct {
		Name string `json:"name"`
		Task struct {
			Due         json.RawMessage `json:"due"`
			Deadline    *string         `json:"deadline"`
			Start       *string         `json:"start"`
			CompletedAt *int64          `json:"completed_at"`
		} `json:"task"`
		Someday bool `json:"someday"`
		Anytime bool `json:"anytime"`
	}
	if err := json.Unmarshal(raw, &vs); err != nil {
		t.Fatal(err)
	}
	if len(vs) < 8 {
		t.Fatalf("only %d vectors", len(vs))
	}
	for _, v := range vs {
		p := Planned{HasDue: len(v.Task.Due) > 0 && string(v.Task.Due) != "null", HasDeadline: v.Task.Deadline != nil, Completed: v.Task.CompletedAt != nil}
		if v.Task.Start != nil {
			p.Start = *v.Task.Start
		}
		if got := Someday(p); got != v.Someday {
			t.Errorf("%s: Someday = %v, want %v", v.Name, got, v.Someday)
		}
		if got := Anytime(p); got != v.Anytime {
			t.Errorf("%s: Anytime = %v, want %v", v.Name, got, v.Anytime)
		}
	}
}
