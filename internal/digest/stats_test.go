package digest

import (
	"encoding/json"
	"os"
	"slices"
	"testing"
	"time"

	opsync "github.com/pixari/opentodo/internal/sync"
)

type fixtureCase struct {
	Name      string `json:"name"`
	WeekStart int    `json:"weekStart"`
	Period    string `json:"period"`
	Start     string `json:"start"`
	End       string `json:"end"`
	Expected  struct {
		Completed int   `json:"completed"`
		Created   int   `json:"created"`
		Late      int   `json:"late"`
		Slipped   int   `json:"slipped"`
		Overdue   int   `json:"overdue"`
		PerDay    []int `json:"perDay"`
	} `json:"expected"`
}

type fixture struct {
	TimeZone string          `json:"timeZone"`
	Me       string          `json:"me"`
	Today    string          `json:"today"`
	Projects []opsync.Entity `json:"projects"`
	Shared   []string        `json:"shared"`
	Tasks    []opsync.Entity `json:"tasks"`
	Cases    []fixtureCase   `json:"cases"`
}

func loadFixture(t *testing.T) (fixture, Input) {
	t.Helper()
	raw, err := os.ReadFile("testdata/stats_fixture.json")
	if err != nil {
		t.Fatal(err)
	}
	var f fixture
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	loc, err := time.LoadLocation(f.TimeZone)
	if err != nil {
		t.Fatal(err)
	}
	in := Input{Me: f.Me, Today: f.Today, Loc: loc, Shared: map[string]string{}}
	for _, id := range f.Shared {
		in.Shared[id] = "editor"
	}
	for _, e := range f.Tasks {
		in.Tasks = append(in.Tasks, TaskOf(e))
	}
	for _, e := range f.Projects {
		in.Projects = append(in.Projects, ProjectOf(e))
	}
	return f, in
}

// TestFixtureMatchesDevice (stats-and-review, task 4.2): the shared fixture that
// web/src/lib/stats.test.ts evaluates gives the same numbers here.
func TestFixtureMatchesDevice(t *testing.T) {
	f, in := loadFixture(t)
	for _, c := range f.Cases {
		t.Run(c.Name, func(t *testing.T) {
			var p Period
			switch c.Period {
			case "last-week":
				p = WeekPeriod(f.Today, c.WeekStart, -1)
			case "this-week":
				p = ThisWeek(f.Today, c.WeekStart)
			default:
				t.Fatalf("unknown period %q", c.Period)
			}
			if p.Start != c.Start || p.End != c.End {
				t.Fatalf("period = %+v, want %s..%s", p, c.Start, c.End)
			}
			s := Compute(in, p)
			got := []int{s.Completed, s.Created, s.Late, s.Slipped, s.Overdue}
			want := []int{c.Expected.Completed, c.Expected.Created, c.Expected.Late, c.Expected.Slipped, c.Expected.Overdue}
			if !slices.Equal(got, want) {
				t.Fatalf("completed, created, late, slipped, overdue = %v, want %v", got, want)
			}
			if !slices.Equal(s.PerDay, c.Expected.PerDay) {
				t.Fatalf("per day = %v, want %v", s.PerDay, c.Expected.PerDay)
			}
		})
	}
}

func TestWeekStartPreference(t *testing.T) {
	for pref, want := range map[string]int{"sun": 0, "mon": 1, "sat": 6, "system": 1, "": 1, "future": 1} {
		if got := WeekStart(pref); got != want {
			t.Errorf("WeekStart(%q) = %d, want %d", pref, got, want)
		}
	}
	// Sunday start, Wednesday 2026-10-14 (statistics "Sunday start").
	if p := WeekPeriod("2026-10-14", 0, -1); p != (Period{"2026-10-04", "2026-10-10"}) {
		t.Fatalf("last week = %+v", p)
	}
}

func TestWithoutNextAction(t *testing.T) {
	_, in := loadFixture(t)
	in.Projects = append(in.Projects, Project{ID: "garage", Name: "Garage"}, Project{ID: "viewed", Name: "Viewed"})
	in.Shared["viewed"] = "viewer"
	in.Tasks = append(in.Tasks, Task{ID: "g1", ProjectID: "garage", CompletedAt: new(int64)})
	var names []string
	for _, p := range in.WithoutNextAction() {
		names = append(names, p.Name)
	}
	// Household has only completed rows of mine and open rows of Ana: an open task, so it is not listed.
	if !slices.Equal(names, []string{"Garage"}) {
		t.Fatalf("without next action = %v", names)
	}
}
