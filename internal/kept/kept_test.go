package kept

import (
	"encoding/json"
	"os"
	"sort"
	"testing"

	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

type vector struct {
	Name  string `json:"name"`
	Tasks []struct {
		ID      string `json:"id"`
		Parent  string `json:"parent"`
		Done    bool   `json:"done"`
		Deleted bool   `json:"deleted"`
	} `json:"tasks"`
	Kept []string `json:"kept"`
}

func vectors(t *testing.T) []vector {
	t.Helper()
	raw, err := os.ReadFile("../../web/src/lib/kept.vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Cases []vector `json:"cases"`
	}
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	return f.Cases
}

func sorted(m map[string]bool) []string {
	out := []string{}
	for id := range m {
		out = append(out, id)
	}
	sort.Strings(out)
	return out
}

// The shared vectors, read as plain tasks and as materialised rows.
func TestVectors(t *testing.T) {
	for _, v := range vectors(t) {
		var tasks []Task
		var rows []opsync.Entity
		for _, x := range v.Tasks {
			tasks = append(tasks, Task{ID: x.ID, ParentID: x.Parent, Completed: x.Done, Deleted: x.Deleted})
			row := opsync.Entity{"id": json.RawMessage(`"` + x.ID + `"`), "completed_at": json.RawMessage("null")}
			if x.Parent != "" {
				row["parent_id"] = json.RawMessage(`"` + x.Parent + `"`)
			}
			if x.Done {
				row["completed_at"] = json.RawMessage("1700000000000")
			}
			if x.Deleted {
				row["deleted_at"] = json.RawMessage("1700000000001")
			}
			rows = append(rows, row)
		}
		want := v.Kept
		if got := sorted(IDs(tasks)); !equal(got, want) {
			t.Errorf("%s: IDs = %v, want %v", v.Name, got, want)
		}
		if got := sorted(OfRows(rows)); !equal(got, want) {
			t.Errorf("%s: OfRows = %v, want %v", v.Name, got, want)
		}
	}
}

func equal(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
