package httpapi

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"sort"
	"strings"
	"testing"
)

var statusCode = regexp.MustCompile(`\d{3}`)

// errorCodeRows reads the "Error codes" section of docs/api.md: each code named
// in the first column of a table row, with the statuses in its second column.
func errorCodeRows(doc string) map[string][]string {
	out := map[string][]string{}
	in := false
	for _, l := range strings.Split(doc, "\n") {
		if strings.HasPrefix(l, "#") {
			in = strings.TrimSpace(strings.TrimLeft(l, "#")) == "Error codes"
			continue
		}
		if !in || !strings.HasPrefix(l, "| `") {
			continue
		}
		cells := strings.Split(l, "|")
		if len(cells) < 4 {
			continue
		}
		statuses := statusCode.FindAllString(cells[2], -1)
		for _, m := range docSpan.FindAllStringSubmatch(cells[1], -1) {
			out[m[1]] = append(out[m[1]], statuses...)
		}
	}
	return out
}

// The error code table of docs/api.md lists exactly the codes the client knows
// (web/src/lib/i18n/server-error-codes.json, which TestErrorCodesFixture keeps
// equal to the codes this package sends), each with every status the v1 surface
// snapshot records for it (OpenSpec change docs-1-0).
func TestAPIDocsErrorCodes(t *testing.T) {
	raw, err := os.ReadFile("../../docs/api.md")
	if err != nil {
		t.Fatal(err)
	}
	var known []string
	b, err := os.ReadFile(errorCodesFixture)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(b, &known); err != nil {
		t.Fatal(err)
	}
	var surface struct {
		Errors map[string][]string `json:"errors"`
	}
	b, err = os.ReadFile(filepath.Join("testdata", "v1_surface.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(b, &surface); err != nil {
		t.Fatal(err)
	}
	for _, p := range errorCodeProblems(errorCodeRows(string(raw)), known, surface.Errors) {
		t.Error(p)
	}
}

func errorCodeProblems(rows map[string][]string, known []string, surface map[string][]string) []string {
	var out []string
	listed := map[string]bool{}
	for _, c := range known {
		listed[c] = true
		if _, ok := rows[c]; !ok {
			out = append(out, "docs/api.md: error code "+c+" is missing from the Error codes table")
			continue
		}
		for _, st := range surface[c] {
			if st != "listed" && !slices.Contains(rows[c], st) {
				out = append(out, "docs/api.md: error code "+c+" is also answered with "+st+"; add it to its status column")
			}
		}
	}
	for c := range rows {
		if !listed[c] {
			out = append(out, "docs/api.md: the Error codes table lists "+c+", which is not in "+errorCodesFixture)
		}
	}
	sort.Strings(out)
	return out
}

func TestAPIDocsErrorCodesBothWays(t *testing.T) {
	rows := errorCodeRows("## Errors\n\n### Error codes\n\n| Code | Status | Where |\n| --- | --- | --- |\n| `a`, `b` | 400 | x |\n| `gone` | 404 | y |\n\n## Next\n\n| `c` | 409 | z |\n")
	got := errorCodeProblems(rows, []string{"a", "b", "telegram_chat_invalid"}, map[string][]string{"a": {"400", "listed"}, "b": {"400", "422", "listed"}})
	want := []string{
		"docs/api.md: error code b is also answered with 422; add it to its status column",
		"docs/api.md: error code telegram_chat_invalid is missing from the Error codes table",
		"docs/api.md: the Error codes table lists gone, which is not in " + errorCodesFixture,
	}
	if strings.Join(got, "\n") != strings.Join(want, "\n") {
		t.Fatalf("got\n%s\nwant\n%s", strings.Join(got, "\n"), strings.Join(want, "\n"))
	}
}
