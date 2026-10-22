package sync

import (
	"encoding/json"
	"os"
	"testing"
)

// workspacesFixture is testdata/workspaces_fixture.json, also read by
// web/src/lib/workspaces.test.ts (OpenSpec change workspaces, design D15).
type workspacesFixture struct {
	Default    string            `json:"default"`
	Workspaces []string          `json:"workspaces"`
	Projects   []fixtureEntity   `json:"projects"`
	Tasks      []fixtureEntity   `json:"tasks"`
	Labels     []fixtureEntity   `json:"labels"`
	Views      []fixtureEntity   `json:"views"`
	Expected   map[string]string `json:"expected"`
}

type fixtureEntity struct {
	ID          string  `json:"id"`
	WorkspaceID *string `json:"workspace_id"`
	ParentID    string  `json:"parent_id"`
	ProjectID   string  `json:"project_id"`
}

func (e fixtureEntity) workspace() string {
	if e.WorkspaceID == nil {
		return ""
	}
	return *e.WorkspaceID
}

func TestPartitionMatchesSharedFixture(t *testing.T) {
	t.Parallel()
	raw, err := os.ReadFile("testdata/workspaces_fixture.json")
	if err != nil {
		t.Fatal(err)
	}
	var f workspacesFixture
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	p := Partition{Default: f.Default, Known: map[string]bool{}, Projects: map[string]PartitionProject{}, Tasks: map[string]PartitionTask{}}
	for _, w := range f.Workspaces {
		p.Known[w] = true
	}
	for _, e := range f.Projects {
		p.Projects[e.ID] = PartitionProject{WorkspaceID: e.workspace(), ParentID: e.ParentID}
	}
	for _, e := range f.Tasks {
		p.Tasks[e.ID] = PartitionTask{WorkspaceID: e.workspace(), ProjectID: e.ProjectID, ParentID: e.ParentID}
	}
	got := map[string]string{}
	for _, e := range f.Projects {
		got["project:"+e.ID] = p.Project(e.ID)
	}
	for _, e := range f.Tasks {
		got["task:"+e.ID] = p.Task(e.ID)
	}
	for _, e := range f.Labels {
		got["label:"+e.ID] = p.Own(e.workspace())
	}
	for _, e := range f.Views {
		got["view:"+e.ID] = p.Own(e.workspace())
	}
	if len(got) != len(f.Expected) {
		t.Fatalf("fixture lists %d expectations for %d entities", len(f.Expected), len(got))
	}
	for k, want := range f.Expected {
		if got[k] != want {
			t.Errorf("%s: got %s, want %s", k, got[k], want)
		}
	}
}
