package sync

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

// The shared vectors of inherited custom fields (OpenSpec change
// inherited-custom-fields, design D1), read by web/src/lib/fields.test.ts too.
type fieldVectors struct {
	Cases []struct {
		Name     string            `json:"name"`
		Project  *string           `json:"project"`
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
			got := []string{}
			for _, d := range ApplicableFields(project, ProjectsByID(vectorEntities(t, c.Projects)), vectorEntities(t, c.Fields)) {
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
