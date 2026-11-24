package filter

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

// TestWildcardVectors: web/src/lib/filter/wildcards.vectors.json is shared with
// web/src/lib/filter/names.test.ts (filter-wildcards).
func TestWildcardVectors(t *testing.T) {
	raw, err := os.ReadFile("../../web/src/lib/filter/wildcards.vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var v struct {
		Matches []struct {
			Pattern, Name string
			Match         bool
		}
		// Literals: a real name as the web app writes it (Query), which must
		// read back as that name and not as Other.
		Literals []struct{ Name, Query, Other string }
	}
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	if len(v.Matches) < 40 || len(v.Literals) < 7 {
		t.Fatalf("only %d matches and %d literals", len(v.Matches), len(v.Literals))
	}
	for _, c := range v.Matches {
		got := idsNamed(map[string][]string{nameKey(c.Name): {"x"}}, c.Pattern) != nil
		if got != c.Match {
			t.Errorf("%q against %q: %v, want %v", c.Pattern, c.Name, got, c.Match)
		}
	}
	for _, c := range v.Literals {
		n, err := ParseQuery(c.Query)
		if err != nil || n.Kind != KindLabel {
			t.Fatalf("%q: %+v %v", c.Query, n, err)
		}
		got := idsNamed(map[string][]string{nameKey(c.Name): {"name"}, nameKey(c.Other): {"other"}}, n.Name)
		if len(got) != 1 || got[0] != "name" {
			t.Errorf("%q: %v, want only %q", c.Query, got, c.Name)
		}
	}
}

// TestWildcardTokens: a quoted name keeps `\*` and `\\` escaped, other quoted text does not.
func TestWildcardTokens(t *testing.T) {
	for q, want := range map[string]string{`@"to\*do"`: `to\*do`, `@to\*do`: `to\*do`, `@"a\\*"`: `a\\*`, `@"x\"y"`: `x"y`, `#"Client *"`: "Client *", `##W*`: "W*", `section: "R\*"`: `R\*`, `section: R*`: "R*"} {
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
