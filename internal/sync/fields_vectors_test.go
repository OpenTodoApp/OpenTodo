package sync

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

// The shared vectors of inherited and workspace custom fields (OpenSpec changes
// inherited-custom-fields D1 and workspace-fields D2), read by
// web/src/lib/fields.test.ts too.
type fieldVectors struct {
	Cases []struct {
		Name       string  `json:"name"`
		Project    *string `json:"project"`
		Workspaces *struct {
			Default string   `json:"default"`
			Known   []string `json:"known"`
			Owned   []string `json:"owned"`
			Foreign []string `json:"foreign"`
		} `json:"workspaces"`
		Projects []json.RawMessage `json:"projects"`
		Fields   []json.RawMessage `json:"fields"`
		Want     []string          `json:"want"`
	} `json:"cases"`
	Descendants []struct {
		Name     string            `json:"name"`
		Project  string            `json:"project"`
		Projects []json.RawMessage `json:"projects"`
		Want     []string          `json:"want"`
	} `json:"descendants"`
}

func vectorEntities(t *testing.T, raws []json.RawMessage) []Entity {
	t.Helper()
	out := make([]Entity, 0, len(raws))
	for _, raw := range raws {
		var e Entity
		if err := json.Unmarshal(raw, &e); err != nil {
			t.Fatal(err)
		}
		out = append(out, e)
	}
	return out
}

func TestFieldVectors(t *testing.T) {
	raw, err := os.ReadFile("../../web/src/lib/fields.vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var v fieldVectors
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	if len(v.Cases) == 0 || len(v.Descendants) == 0 {
		t.Fatal("no vectors")
	}
	for _, c := range v.Cases {
		t.Run(c.Name, func(t *testing.T) {
			project := ""
			if c.Project != nil {
				project = *c.Project
			}
			projects := vectorEntities(t, c.Projects)
			// With workspaces (workspace-fields D2) the case places its projects.
			var place FieldPlacement
			if w := c.Workspaces; w != nil {
				p := &Partition{Default: w.Default, Known: map[string]bool{}, Projects: map[string]PartitionProject{}}
				for _, id := range w.Known {
					p.Known[id] = true
				}
				for _, e := range projects {
					p.Projects[e.str("id")] = PartitionProject{WorkspaceID: e.str("workspace_id"), ParentID: e.str("parent_id")}
				}
				owned := w.Owned
				if owned == nil {
					owned = w.Known
				}
				f := &FieldPlace{Partition: p, Owned: map[string]bool{}, Foreign: map[string]bool{}}
				for _, id := range owned {
					f.Owned[id] = true
				}
				for _, id := range w.Foreign {
					f.Foreign[id] = true
				}
				place = f
			}
			got := []string{}
			for _, d := range ApplicableFields(project, ProjectsByID(projects), vectorEntities(t, c.Fields), place) {
				got = append(got, d.str("id"))
			}
			if !reflect.DeepEqual(got, c.Want) {
				t.Fatalf("ApplicableFields(%q) = %v, want %v", project, got, c.Want)
			}
		})
	}
	for _, c := range v.Descendants {
		t.Run("descendants/"+c.Name, func(t *testing.T) {
			got := FieldDescendants(c.Project, ProjectsByID(vectorEntities(t, c.Projects)))
			if got == nil {
				got = []string{}
			}
			if !reflect.DeepEqual(got, c.Want) {
				t.Fatalf("FieldDescendants(%q) = %v, want %v", c.Project, got, c.Want)
			}
		})
	}
}
