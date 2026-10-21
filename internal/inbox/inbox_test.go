package inbox

import (
	"encoding/json"
	"os"
	"testing"
)

type vector struct {
	Name string `json:"name"`
	Task struct {
		ProjectID   *string         `json:"project_id"`
		Due         json.RawMessage `json:"due"`
		Start       *string         `json:"start"`
		CompletedAt *int64          `json:"completed_at"`
		DeletedAt   *int64          `json:"deleted_at"`
	} `json:"task"`
	Inbox bool `json:"inbox"`
}

// TestVectors: the rule matches the vectors the web helper reads too.
func TestVectors(t *testing.T) {
	raw, err := os.ReadFile("../../web/src/lib/inbox.vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var vs []vector
	if err := json.Unmarshal(raw, &vs); err != nil {
		t.Fatal(err)
	}
	if len(vs) < 10 {
		t.Fatalf("only %d vectors", len(vs))
	}
	for _, v := range vs {
		task := Task{
			HasDue:    len(v.Task.Due) > 0 && string(v.Task.Due) != "null",
			Completed: v.Task.CompletedAt != nil,
			Deleted:   v.Task.DeletedAt != nil,
		}
		if v.Task.ProjectID != nil {
			task.ProjectID = *v.Task.ProjectID
		}
		if v.Task.Start != nil {
			task.Start = *v.Task.Start
		}
		if got := IsTask(task); got != v.Inbox {
			t.Errorf("%s: IsTask = %v, want %v", v.Name, got, v.Inbox)
		}
	}
}
