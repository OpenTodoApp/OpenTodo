package importer

import (
	"encoding/json"
	"os"
	"regexp"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/recurrence"
	"github.com/OpenTodoApp/opentodo/internal/recurrence/recurrence10"
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
			} else if err := recurrence10.Check(recurrence.Compatible(rule, ""), ""); err != nil {
				t.Errorf("%s %q: stored rule not read by 1.0: %v", c.Lang, c.Text, err)
			}
		default:
			if due == nil || due.Date != c.Date || due.Time != c.Time {
				t.Errorf("%s %q: due %+v, want %s %s", c.Lang, c.Text, due, c.Date, c.Time)
			}
		}
	}
	for _, l := range []string{"en", "de", "fr", "it", "es", "pt", "nl", "zh"} {
		if !langs[l] {
			t.Errorf("no vector for %s", l)
		}
	}
}

// A language's words only count in that language: the Dutch ordinals and
// connectors must not be read in another language's recurring phrase.
func TestRecurringWordsStayInTheirLanguage(t *testing.T) {
	fr := nlpVocabs["fr"]
	for _, s := range []string{"chaque 1e lundi", "chaque laatste vendredi"} {
		if rule, ok := fr.recurring("fr", s); ok {
			t.Errorf("fr %q = %q, want not understood", s, rule)
		}
	}
	nl := nlpVocabs["nl"]
	for _, s := range []string{"elke 1e zondag", "elke laatste vrijdag"} {
		if _, ok := nl.recurring("nl", s); !ok {
			t.Errorf("nl %q is not understood", s)
		}
	}
}

// A Chinese date or rule read from a user's export never panics, and a date it
// accepts is always a real YYYY-MM-DD with an HH:MM time or none.
func FuzzTodoistDateChinese(f *testing.F) {
	for _, s := range []string{"明天 15:00", "2026年11月21日 下午3点", "每月最后一个周五", "周一、三、五", "99999999年1月1日", "十十十十月", "下午99:99"} {
		f.Add(s)
	}
	ref := time.Date(2026, 11, 17, 9, 0, 0, 0, time.UTC)
	f.Fuzz(func(t *testing.T, s string) {
		d, _, err := todoistDate(s, "zh", ref)
		if err != nil || d == nil {
			return
		}
		if _, perr := time.Parse("2006-01-02", d.Date); perr != nil || (d.Time != "" && !regexp.MustCompile(`^\d{2}:\d{2}$`).MatchString(d.Time)) {
			t.Fatalf("%q gave %+v", s, d)
		}
	})
}
