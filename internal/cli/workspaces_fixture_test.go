package cli

import (
	"encoding/json"
	"os"
	"testing"
)

// The CLI places projects and tasks like the server and the app: it reads the
// shared fixture of internal/sync (OpenSpec change workspaces, design D15).
func TestPartitionMatchesSharedFixture(t *testing.T) {
	raw, err := os.ReadFile("../sync/testdata/workspaces_fixture.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Default    string            `json:"default"`
		Workspaces []string          `json:"workspaces"`
		Projects   []project         `json:"projects"`
		Tasks      []task            `json:"tasks"`
		Expected   map[string]string `json:"expected"`
	}
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	s := &wsScope{def: f.Default, known: map[string]bool{}}
	for _, w := range f.Workspaces {
		s.known[w] = true
	}
	byID := map[string]project{}
	for _, p := range f.Projects {
		byID[p.ID] = p
	}
	tasks := map[string]task{}
	for _, tk := range f.Tasks {
		tasks[tk.ID] = tk
	}
	for _, p := range f.Projects {
		if got, want := s.project(byID, p.ID), f.Expected["project:"+p.ID]; got != want {
			t.Errorf("project %s: %s, want %s", p.ID, got, want)
		}
	}
	for _, tk := range f.Tasks {
		if got, want := s.task(byID, tasks, tk), f.Expected["task:"+tk.ID]; got != want {
			t.Errorf("task %s: %s, want %s", tk.ID, got, want)
		}
	}
}
