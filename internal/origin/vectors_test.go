package origin

import (
	"encoding/json"
	"os"
	"testing"
)

type vector struct {
	Name  string  `json:"name"`
	URL   string  `json:"url"`
	Title string  `json:"title"`
	Want  *Origin `json:"want"`
}

func readVectors(t *testing.T) []vector {
	t.Helper()
	raw, err := os.ReadFile("testdata/origin_vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Cases []vector `json:"cases"`
	}
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	return f.Cases
}

// TestVectors runs every shared vector (web/src/lib/origin.test.ts runs the
// same file through originFromUrl).
func TestVectors(t *testing.T) {
	t.Parallel()
	cases := readVectors(t)
	if len(cases) != 21 {
		t.Fatalf("vector count %d, want 21 (keep web/src/lib/origin.test.ts in step)", len(cases))
	}
	for _, c := range cases {
		got, err := FromURL(c.URL, c.Title)
		if c.Want == nil {
			if err == nil {
				t.Errorf("%s: FromURL(%q) = %+v, want an error", c.Name, c.URL, got)
			}
			if _, ok := Recognize(c.URL); ok {
				t.Errorf("%s: Recognize accepted %q", c.Name, c.URL)
			}
			continue
		}
		if err != nil || got != *c.Want {
			t.Errorf("%s: FromURL(%q) = %+v, %v; want %+v", c.Name, c.URL, got, err, *c.Want)
			continue
		}
		if err := got.Validate(); err != nil {
			t.Errorf("%s: derived origin invalid: %v", c.Name, err)
		}
		r, ok := Recognize(c.URL)
		if ok != (c.Want.Kind == KindIssue) || (ok && (r.Provider != c.Want.Provider || r.ID != c.Want.ID)) {
			t.Errorf("%s: Recognize = %+v, %v", c.Name, r, ok)
		}
	}
}
