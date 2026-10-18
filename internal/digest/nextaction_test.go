package digest

import (
	"encoding/json"
	"os"
	"slices"
	"testing"

	opsync "github.com/pixari/opentodo/internal/sync"
)

// TestWithoutNextActionSharedVectors (open-loops-method D3): the digest's
// "projects without a next action" match web/src/lib/method/rules.ts on the
// shared fixture.
func TestWithoutNextActionSharedVectors(t *testing.T) {
	raw, err := os.ReadFile("testdata/next_action_fixture.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Me       string            `json:"me"`
		Today    string            `json:"today"`
		Roles    map[string]string `json:"roles"`
		Projects []opsync.Entity   `json:"projects"`
		Tasks    []opsync.Entity   `json:"tasks"`
		Expected struct {
			WithoutNextAction []string `json:"withoutNextAction"`
		} `json:"expected"`
	}
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	in := Input{Me: f.Me, Today: f.Today, Shared: f.Roles}
	for _, e := range f.Projects {
		in.Projects = append(in.Projects, ProjectOf(e))
	}
	for _, e := range f.Tasks {
		in.Tasks = append(in.Tasks, TaskOf(e))
	}
	var got []string
	for _, p := range in.WithoutNextAction() {
		got = append(got, p.ID)
	}
	if !slices.Equal(got, f.Expected.WithoutNextAction) {
		t.Fatalf("without next action = %v, want %v", got, f.Expected.WithoutNextAction)
	}
}
