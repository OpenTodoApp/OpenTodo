package agenttools

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"testing"
)

// The label matching vectors, shared with the device (assistant-eval-gaps).
func TestLabelMatchVectors(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "web", "src", "lib", "assistantDevice", "labelMatch.vectors.json"))
	if err != nil {
		t.Fatal(err)
	}
	var v struct {
		Cases []struct {
			Name   string `json:"name"`
			Query  string `json:"query"`
			Filter bool   `json:"filter"`
			Search bool   `json:"search"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	if len(v.Cases) == 0 {
		t.Fatal("no cases")
	}
	for _, c := range v.Cases {
		if got := labelFilterMatches(c.Name, c.Query); got != c.Filter {
			t.Errorf("filter %q by %q = %v, want %v", c.Name, c.Query, got, c.Filter)
		}
		if got := labelSearchMatches(c.Name, c.Query); got != c.Search {
			t.Errorf("search %q by %q = %v, want %v", c.Name, c.Query, got, c.Search)
		}
	}
}

func taskIDs(t *testing.T, out map[string]any) []string {
	t.Helper()
	raw, _ := json.Marshal(out["tasks"])
	var ts []struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(raw, &ts)
	ids := []string{}
	for _, x := range ts {
		ids = append(ids, x.ID)
	}
	slices.Sort(ids)
	return ids
}

// "Show me my errands" finds the tasks labelled "errand" (the eval's
// errands-map scenario), through search_tasks and list_tasks' label, and the
// narrowed search snapshot answers as the full one.
func TestSearchAndFilterFindPluralLabels(t *testing.T) {
	f := newFixture(t)
	f.put("u1", "label", "l-errand", map[string]any{"name": "errand"})
	f.put("u1", "label", "l-home", map[string]any{"name": "Home"})
	f.task("u1", "milk", "Buy milk", map[string]any{"labels": []string{"l-errand"}})
	f.task("u1", "parcel", "Pick up the parcel", map[string]any{"labels": []string{"l-errand", "l-home"}})
	f.task("u1", "done", "Old errand", map[string]any{"labels": []string{"l-errand"}, "completed_at": 5})
	f.task("u1", "other", "Email the landlord", map[string]any{"labels": []string{"l-home"}})
	f.task("u1", "title", "Run errands in town", nil)
	c := agent("u1")
	if got := taskIDs(t, f.mustCall(c, "search_tasks", map[string]any{"query": "errands"})); !slices.Equal(got, []string{"milk", "parcel", "title"}) {
		t.Fatalf("search errands = %v", got)
	}
	if got := taskIDs(t, f.mustCall(c, "search_tasks", map[string]any{"query": "errand"})); !slices.Equal(got, []string{"milk", "parcel", "title"}) {
		t.Fatalf("search errand = %v", got)
	}
	if got := taskIDs(t, f.mustCall(c, "list_tasks", map[string]any{"label": "Errands"})); !slices.Equal(got, []string{"milk", "parcel"}) {
		t.Fatalf("list_tasks label Errands = %v", got)
	}
	if got := taskIDs(t, f.mustCall(c, "list_tasks", map[string]any{"label": "errand"})); !slices.Equal(got, []string{"milk", "parcel"}) {
		t.Fatalf("list_tasks label errand = %v", got)
	}
	if _, err := f.call(c, "list_tasks", map[string]any{"label": "errandss"}); !isArgErr(err) {
		t.Fatalf("an unknown label = %v, want an argument error", err)
	}
	ctx := context.Background()
	full, err := f.reg.load(ctx, "u1")
	if err != nil {
		t.Fatal(err)
	}
	narrow, err := f.reg.loadWith(ctx, "u1", f.reg.searchReader("u1", "errands", ""))
	if err != nil {
		t.Fatal(err)
	}
	if len(narrow.tasks) >= len(full.tasks) {
		t.Fatalf("the search snapshot holds %d of %d tasks", len(narrow.tasks), len(full.tasks))
	}
	for _, done := range []bool{false, true} {
		if got, want := searchJSON(t, narrow, "errands", done), searchJSON(t, full, "errands", done); got != want {
			t.Errorf("completed %v:\n got %s\nwant %s", done, got, want)
		}
	}
}

// list_projects carries each project's sections in board order, so an assistant
// can show one board column (the eval's board-column scenario).
func TestListProjectsCarriesSections(t *testing.T) {
	f := newFixture(t)
	f.put("u1", "project", "web", map[string]any{"name": "Website launch", "position": 1})
	f.put("u1", "project", "empty", map[string]any{"name": "Empty", "position": 2})
	f.put("u1", "section", "doing", map[string]any{"name": "In progress", "project_id": "web", "position": 2})
	f.put("u1", "section", "todo", map[string]any{"name": "To do", "project_id": "web", "position": 1})
	f.put("u1", "section", "gone", map[string]any{"name": "Old", "project_id": "web", "position": 3, "deleted_at": 9})
	out := f.mustCall(agent("u1"), "list_projects", map[string]any{})
	raw, _ := json.Marshal(out["projects"])
	var ps []struct {
		ID       string `json:"id"`
		Sections []struct {
			ID        string `json:"id"`
			FlowMode  string `json:"flow_mode"`
			Untrusted struct {
				Name string `json:"name"`
			} `json:"untrusted_text"`
		} `json:"sections"`
	}
	_ = json.Unmarshal(raw, &ps)
	if len(ps) != 2 || ps[0].ID != "web" || len(ps[0].Sections) != 2 || ps[1].Sections != nil {
		t.Fatalf("projects = %s", raw)
	}
	if s := ps[0].Sections; s[0].ID != "todo" || s[1].ID != "doing" || s[1].Untrusted.Name != "In progress" {
		t.Fatalf("sections = %+v", s)
	}
	res, err := f.reg.ProjectsResource(context.Background(), "u1")
	if err != nil {
		t.Fatal(err)
	}
	if rr, _ := json.Marshal(res["projects"]); string(rr) != string(raw) {
		t.Fatalf("opentodo://projects differs from list_projects:\n%s\n%s", rr, raw)
	}
}
