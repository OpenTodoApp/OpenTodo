package filter

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

// TestWildcardVectors: testdata/wildcards.json is shared with
// web/src/lib/filter/names.test.ts (filter-wildcards).
func TestWildcardVectors(t *testing.T) {
	raw, err := os.ReadFile("testdata/wildcards.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Pattern, Name string
		Match         bool
	}
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatal(err)
	}
	if len(cases) < 30 {
		t.Fatalf("only %d cases", len(cases))
	}
	for _, c := range cases {
		got := idsNamed(map[string][]string{nameKey(c.Name): {"x"}}, c.Pattern) != nil
		if got != c.Match {
			t.Errorf("%q against %q: %v, want %v", c.Pattern, c.Name, got, c.Match)
		}
	}
}

// TestWildcardTokens: a quoted name keeps `\*` escaped, other quoted text does not.
func TestWildcardTokens(t *testing.T) {
	for q, want := range map[string]string{`@"to\*do"`: `to\*do`, `@to\*do`: `to\*do`, `#"Client *"`: "Client *", `##W*`: "W*", `section: "R\*"`: `R\*`, `section: R*`: "R*"} {
		n, err := ParseQuery(q)
		if err != nil {
			t.Fatalf("%q: %v", q, err)
		}
		if n.Name != want {
			t.Errorf("%q: name %q, want %q", q, n.Name, want)
		}
	}
	n, err := ParseQuery(`search: "a\*"`)
	if err != nil || n.Text != "a*" {
		t.Fatalf("search text %+v %v", n, err)
	}
}

// TestWildcardLongestQuery: the longest query of stars against a long name stays linear.
func TestWildcardLongestQuery(t *testing.T) {
	pattern := strings.Repeat("a*", MaxQueryLength/2-1)
	names := map[string][]string{strings.Repeat("a", 10000): {"x"}, strings.Repeat("ab", 5000): {"y"}}
	if ids := idsNamed(names, pattern); len(ids) != 2 {
		t.Fatalf("ids %v", ids)
	}
	if ids := idsNamed(names, pattern+"c"); ids != nil {
		t.Fatalf("ids %v", ids)
	}
}
