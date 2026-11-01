package filter

import (
	"encoding/json"
	"os"
	"slices"
	"testing"
)

type evalVectors struct {
	Today     string                       `json:"today"`
	WeekStart int                          `json:"week_start"`
	Labels    []map[string]any             `json:"labels"`
	Projects  []map[string]any             `json:"projects"`
	Fields    []map[string]any             `json:"fields"`
	Tracked   map[string]int               `json:"tracked"`
	Tasks     []map[string]json.RawMessage `json:"tasks"`
	Cases     []struct {
		Query    string   `json:"query"`
		IDs      []string `json:"ids"`
		Warnings int      `json:"warnings"`
	} `json:"cases"`
}

func rowsOf(list []map[string]any) []Row {
	out := []Row{}
	for _, m := range list {
		r := Row{}
		for k, v := range m {
			b, _ := json.Marshal(v)
			r[k] = b
		}
		out = append(out, r)
	}
	return out
}

// taskRow fills the defaults a materialised task row has.
func taskRow(m map[string]json.RawMessage) Row {
	r := Row{"labels": json.RawMessage("[]"), "priority": json.RawMessage("4"), "created_at": json.RawMessage("1792454400000"),
		"completed_at": json.RawMessage("null"), "deleted_at": json.RawMessage("null"), "due": json.RawMessage("null"), "description": json.RawMessage(`""`)}
	for k, v := range m {
		r[k] = v
	}
	return r
}

// TestEvaluateVectors: the server's evaluator lists the same tasks as
// web/src/lib/filter/evaluate.ts for every query of evaluate.vectors.json.
func TestEvaluateVectors(t *testing.T) {
	raw, err := os.ReadFile("../../web/src/lib/filter/evaluate.vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var v evalVectors
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	if len(v.Cases) < 50 {
		t.Fatalf("only %d cases", len(v.Cases))
	}
	var tasks []Row
	for _, m := range v.Tasks {
		tasks = append(tasks, taskRow(m))
	}
	ctx := Context{Today: v.Today, WeekStart: v.WeekStart, Labels: rowsOf(v.Labels), Projects: rowsOf(v.Projects), Fields: rowsOf(v.Fields), Tasks: tasks, Tracked: v.Tracked}
	for _, c := range v.Cases {
		pred, warnings, err := Evaluate(c.Query, ctx)
		if err != nil {
			t.Errorf("%q: %v", c.Query, err)
			continue
		}
		got := []string{}
		for _, task := range tasks {
			if pred(task) {
				got = append(got, str(task, "id"))
			}
		}
		want := c.IDs
		if want == nil {
			want = []string{}
		}
		if !slices.Equal(got, want) {
			t.Errorf("%q: %v, want %v", c.Query, got, want)
		}
		if len(warnings) != c.Warnings {
			t.Errorf("%q: warnings %v", c.Query, warnings)
		}
	}
	if _, _, err := Evaluate("due before:", ctx); err == nil {
		t.Fatal("an invalid query compiled")
	}
}
