package quickadd

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

// TestSharedVectors runs web/src/lib/nlp/quickadd.vectors.json, which the web
// parser runs too (quick-add-recurrence D5).
func TestSharedVectors(t *testing.T) {
	raw, err := os.ReadFile("../../web/src/lib/nlp/quickadd.vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var file struct {
		Cases []struct {
			Name   string  `json:"name"`
			Line   string  `json:"line"`
			Ctx    Context `json:"ctx"`
			Expect struct {
				Title           string     `json:"title"`
				Due             *Due       `json:"due"`
				ProjectID       *string    `json:"projectId"`
				Labels          []string   `json:"labels"`
				Priority        *int       `json:"priority"`
				EstimateMinutes *int       `json:"estimateMinutes"`
				Recurrence      *string    `json:"recurrence"`
				Reminders       []Reminder `json:"reminders"`
			} `json:"expect"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(raw, &file); err != nil {
		t.Fatal(err)
	}
	deref := func(p *string) string {
		if p == nil {
			return ""
		}
		return *p
	}
	num := func(p *int) int {
		if p == nil {
			return 0
		}
		return *p
	}
	for _, c := range file.Cases {
		t.Run(c.Name, func(t *testing.T) {
			got := Parse(c.Line, c.Ctx)
			want := Result{Title: c.Expect.Title, Due: c.Expect.Due, ProjectID: deref(c.Expect.ProjectID), Labels: c.Expect.Labels,
				Priority: num(c.Expect.Priority), EstimateMinutes: num(c.Expect.EstimateMinutes), Recurrence: deref(c.Expect.Recurrence),
				Reminders: c.Expect.Reminders}
			got.Deadline, got.Someday, got.Evening = "", false, false
			if want.Reminders == nil {
				want.Reminders = []Reminder{}
			}
			if !reflect.DeepEqual(got, want) {
				g, _ := json.Marshal(got)
				w, _ := json.Marshal(want)
				t.Fatalf("\n got  %s\n want %s", g, w)
			}
		})
	}
}

func TestVocabularyLoads(t *testing.T) {
	for _, code := range Bundled {
		v := Vocabularies[code]
		if v == nil || len(v.Weekdays) != 7 || len(v.Months) != 12 || len(v.Every) == 0 || len(v.RemindWords) == 0 {
			t.Fatalf("%s: %+v", code, v)
		}
	}
	if got := ActiveLanguages([]string{"de-CH", "ja", "fr"}); len(got) != 3 || got[0] != "de" || got[2] != "en" {
		t.Fatalf("active = %v", got)
	}
}
