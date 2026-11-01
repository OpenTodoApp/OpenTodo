package sync

import (
	"context"
	"os"
	"slices"
	"strings"
	"testing"
)

// themeDoc is one of the shared valid examples of internal/themes.
func themeDoc(t *testing.T) string {
	t.Helper()
	b, err := os.ReadFile("../themes/testdata/valid/seeds-only-dark.json")
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

// themes "Custom themes are synced per user": a valid document is accepted, a
// value of 20 KB or one whose canvas is url(x) is refused as invalid.
func TestThemeDocValidation(t *testing.T) {
	doc := themeDoc(t)
	if err := Validate(op("x", "theme", "th1", "doc", doc, 100, "A")); err != nil {
		t.Fatalf("valid document refused: %v", err)
	}
	if err := Validate(op("x", "theme", "th1", "doc", `null`, 100, "A")); err != nil {
		t.Fatalf("null refused: %v", err)
	}
	big := strings.Replace(doc, `"name": "Example Dark",`, `"name": "Example Dark", "padding": "`+strings.Repeat("x", 20*1024)+`",`, 1)
	urlCanvas := strings.Replace(doc, `"canvas": "#1e2127"`, `"canvas": "url(x)"`, 1)
	for name, v := range map[string]string{"20 KB": big, "url canvas": urlCanvas, "string": `"#000000"`, "array": `[]`, "number": `1`} {
		if err := Validate(op("x", "theme", "th1", "doc", v, 100, "A")); err == nil {
			t.Errorf("%s was accepted", name)
		}
	}
}

// A theme is personal and its id unique on the server: it never reaches a
// project member, another account cannot write its id, and the document
// converges whole on the later save.
func TestThemeIsPersonalAndUnique(t *testing.T) {
	ctx := context.Background()
	f := newSharing(t)
	f.add("alice", "bob", "editor")
	doc := themeDoc(t)
	later := strings.Replace(doc, `"accent": "#61afef"`, `"accent": "#c678dd"`, 1)
	f.apply("alice", "A", f.op("theme", "th-a", "doc", doc), f.op("theme", "th-a", "created_at", `1`))
	ops, _ := f.pullAll("bob", "B", 0)
	for _, o := range ops {
		if o.Entity == "theme" {
			t.Fatalf("bob received a theme op: %+v", o)
		}
	}
	if res := f.apply("bob", "B", f.op("theme", "th-a", "doc", later)); res.Applied != 0 {
		t.Fatalf("bob wrote alice's theme id: %+v", res)
	}
	if got := f.scopesOf("theme", "th-a"); !slices.Equal(got, []string{"user:alice"}) {
		t.Fatalf("theme lives in %v", got)
	}

	s := newTestService(t)
	mustApply(t, s, "u1", op("a1", "theme", "th1", "doc", later, 300, "laptop"))
	mustApply(t, s, "u1", op("b1", "theme", "th1", "doc", doc, 250, "phone"))
	e, err := s.Get(ctx, "u1", "theme", "th1")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(e["doc"]), "#c678dd") {
		t.Fatalf("doc = %s, want the later save", e["doc"])
	}
}
