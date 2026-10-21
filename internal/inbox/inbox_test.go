package inbox

import (
	"encoding/json"
	"fmt"
	"os"
	"testing"
)

type vtask struct {
	ProjectID   *string         `json:"project_id"`
	Due         json.RawMessage `json:"due"`
	Start       *string         `json:"start"`
	CompletedAt *int64          `json:"completed_at"`
	DeletedAt   *int64          `json:"deleted_at"`
}

func (v vtask) task() Task {
	t := Task{
		HasDue:    len(v.Due) > 0 && string(v.Due) != "null",
		Completed: v.CompletedAt != nil,
		Deleted:   v.DeletedAt != nil,
	}
	if v.ProjectID != nil {
		t.ProjectID = *v.ProjectID
	}
	if v.Start != nil {
		t.Start = *v.Start
	}
	return t
}

type vector struct {
	Name          string  `json:"name"`
	Task          vtask   `json:"task"`
	Parents       []vtask `json:"parents"`
	ParentMissing bool    `json:"parent_missing"`
	Inbox         bool    `json:"inbox"`
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
		// Parents are chained as p0 (nearest), p1, …; a missing parent is p0 with no entry.
		byID := map[string]Task{}
		for i, p := range v.Parents {
			pt := p.task()
			if i+1 < len(v.Parents) {
				pt.ParentID = fmt.Sprintf("p%d", i+1)
			}
			byID[fmt.Sprintf("p%d", i)] = pt
		}
		task := v.Task.task()
		if len(v.Parents) > 0 || v.ParentMissing {
			task.ParentID = "p0"
		}
		parentOf := func(id string) (Task, bool) { p, ok := byID[id]; return p, ok }
		if got := IsTask(task, parentOf); got != v.Inbox {
			t.Errorf("%s: IsTask = %v, want %v", v.Name, got, v.Inbox)
		}
	}
}
