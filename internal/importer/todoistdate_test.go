package importer

import (
	"encoding/json"
	"os"
	"testing"
	"time"
)

// Shared vectors for Todoist's localised date strings (named-importers D7).
func TestTodoistDateVectors(t *testing.T) {
	raw, err := os.ReadFile("testdata/todoist_dates.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Lang, Text, Ref, Date, Time, Rule string
		Error                             bool
	}
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatal(err)
	}
	langs := map[string]bool{}
	for _, c := range cases {
		langs[c.Lang] = true
		ref, _ := time.Parse("2006-01-02", c.Ref)
		due, rule, err := todoistDate(c.Text, c.Lang, ref)
		switch {
		case c.Error:
			if err == nil {
				t.Errorf("%s %q: want an error, got %+v %q", c.Lang, c.Text, due, rule)
			}
		case err != nil:
			t.Errorf("%s %q: %v", c.Lang, c.Text, err)
		case c.Rule != "":
			if rule != c.Rule {
				t.Errorf("%s %q: rule %q, want %q", c.Lang, c.Text, rule, c.Rule)
			}
		default:
			if due == nil || due.Date != c.Date || due.Time != c.Time {
				t.Errorf("%s %q: due %+v, want %s %s", c.Lang, c.Text, due, c.Date, c.Time)
			}
		}
	}
	for _, l := range []string{"en", "de", "fr", "it", "es", "pt"} {
		if !langs[l] {
			t.Errorf("no vector for %s", l)
		}
	}
}
