package flow

import (
	"encoding/json"
	"maps"
	"os"
	"slices"
	"testing"
)

// TestSharedVectors: the Go rule matches web/src/lib/flow.ts on the shared fixture.
func TestSharedVectors(t *testing.T) {
	raw, err := os.ReadFile("testdata/flow_fixture.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Cases []struct {
			Name     string `json:"name"`
			Today    string `json:"today"`
			Projects []Row  `json:"projects"`
			Sections []Row  `json:"sections"`
			Tasks    []Row  `json:"tasks"`
			Expected struct {
				Available []string          `json:"available"`
				Waits     map[string]string `json:"waits"`
			} `json:"expected"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	if len(f.Cases) < 10 {
		t.Fatalf("only %d cases", len(f.Cases))
	}
	for _, c := range f.Cases {
		t.Run(c.Name, func(t *testing.T) {
			in := Input{Today: c.Today}
			for _, r := range c.Projects {
				in.Projects = append(in.Projects, ProjectOf(r))
			}
			for _, r := range c.Sections {
				in.Sections = append(in.Sections, SectionOf(r))
			}
			for _, r := range c.Tasks {
				in.Tasks = append(in.Tasks, TaskOf(r))
			}
			states := Compute(in)
			var avail []string
			waits := map[string]string{}
			for _, tk := range in.Tasks {
				s := states[tk.ID]
				if s.Available {
					avail = append(avail, tk.ID)
				}
				if s.Waits && s.HeldBy != nil {
					waits[tk.ID] = s.HeldBy.Kind + ":" + s.HeldBy.ID
				}
			}
			slices.Sort(avail)
			want := slices.Clone(c.Expected.Available)
			slices.Sort(want)
			if !slices.Equal(avail, want) {
				t.Errorf("available = %v, want %v", avail, want)
			}
			if !maps.Equal(waits, c.Expected.Waits) {
				t.Errorf("waits = %v, want %v", waits, c.Expected.Waits)
			}
		})
	}
}

func TestReadingFlows(t *testing.T) {
	for stored, want := range map[string]string{"": Parallel, "staged": Parallel, "area": Area, "sequential": Sequential} {
		if got := ProjectFlow(stored); got != want {
			t.Errorf("ProjectFlow(%q) = %q, want %q", stored, got, want)
		}
	}
	if SectionFlow("area") != "" || EffectiveSectionFlow("", Area) != Parallel || EffectiveSectionFlow("", Sequential) != Sequential {
		t.Error("section flow reading")
	}
	if !ValidProject("area") || ValidProject("") || ValidProject("serial") || !ValidSection("") || ValidSection("area") {
		t.Error("validation sets")
	}
}
