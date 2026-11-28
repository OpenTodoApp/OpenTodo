package pushrelay

import (
	"os"
	"regexp"
	"strconv"
	"strings"
	"testing"
)

// docSection returns the table rows of one "## " section of PROTOCOL.md, each
// as its trimmed cells.
func docSection(t *testing.T, doc, heading string) [][]string {
	t.Helper()
	_, rest, ok := strings.Cut(doc, "\n## "+heading+"\n")
	if !ok {
		t.Fatalf("PROTOCOL.md has no section %q", heading)
	}
	if i := strings.Index(rest, "\n## "); i >= 0 {
		rest = rest[:i]
	}
	var rows [][]string
	for _, line := range strings.Split(rest, "\n") {
		if !strings.HasPrefix(line, "|") || strings.HasPrefix(line, "| ---") {
			continue
		}
		cells := strings.Split(strings.Trim(line, "|"), "|")
		for i := range cells {
			cells[i] = strings.TrimSpace(cells[i])
		}
		rows = append(rows, cells)
	}
	if len(rows) < 2 {
		t.Fatalf("section %q has no table", heading)
	}
	return rows[1:] // without the header
}

var codeCell = regexp.MustCompile("^`([^`]+)`$")

// TestProtocolDoc: the routes, error codes, limits and payloads in PROTOCOL.md
// are the code's.
func TestProtocolDoc(t *testing.T) {
	raw, err := os.ReadFile("PROTOCOL.md")
	if err != nil {
		t.Fatal(err)
	}
	doc := string(raw)

	var routes []string
	for _, r := range docSection(t, doc, "Routes") {
		m := codeCell.FindStringSubmatch(r[0])
		if m == nil {
			t.Fatalf("route cell %q", r[0])
		}
		routes = append(routes, m[1])
	}
	if strings.Join(routes, ",") != strings.Join(Routes(), ",") {
		t.Errorf("PROTOCOL.md routes %v, code %v", routes, Routes())
	}

	codes := map[string]int{}
	for _, r := range docSection(t, doc, "Errors") {
		m := codeCell.FindStringSubmatch(r[0])
		n, err := strconv.Atoi(r[1])
		if m == nil || err != nil {
			t.Fatalf("error row %v", r)
		}
		codes[m[1]] = n
	}
	want := ErrorCodes()
	if len(codes) != len(want) {
		t.Errorf("PROTOCOL.md lists %d error codes, the code %d", len(codes), len(want))
	}
	for c, s := range want {
		if codes[c] != s {
			t.Errorf("error %q: PROTOCOL.md %d, code %d", c, codes[c], s)
		}
	}

	var limits []Limit
	for _, r := range docSection(t, doc, "Limits") {
		n, err := strconv.Atoi(r[1])
		if err != nil {
			t.Fatalf("limit row %v", r)
		}
		limits = append(limits, Limit{r[0], n})
	}
	if len(limits) != len(Limits()) {
		t.Errorf("PROTOCOL.md lists %d limits, the code %d", len(limits), len(Limits()))
	}
	for i, l := range Limits() {
		if i >= len(limits) || limits[i] != l {
			t.Errorf("limit %d: code %+v, PROTOCOL.md %v", i, l, limits[min(i, len(limits)-1)])
		}
	}

	for _, r := range docSection(t, doc, "Payloads") {
		m := regexp.MustCompile("^`([^`]+)`$").FindStringSubmatch(r[2])
		kind := strings.Trim(r[0], "`")
		body := map[string][]byte{KindRefresh: refreshPayload, KindDue: duePayload}[kind]
		if m == nil || body == nil || m[1] != string(body) {
			t.Errorf("payload of %q in PROTOCOL.md %q, code %s", kind, r[2], body)
		}
	}
	for _, s := range []string{handleAAD, strings.TrimSuffix(signatureLabel, "\n"), handlePrefix, DefaultTopic} {
		if !strings.Contains(doc, s) {
			t.Errorf("PROTOCOL.md does not name %q", s)
		}
	}
}
