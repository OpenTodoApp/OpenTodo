package themes

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"testing"
)

// TestTemplatesAreValid: the theme templates the web app makes (template.test.ts
// writes OpenTodo Light's and Dark's into testdata/template) are documents the
// server accepts once their notes and trailing commas are taken out, as written and
// with every commented value line set.
func TestTemplatesAreValid(t *testing.T) {
	files, _ := filepath.Glob("testdata/template/*.jsonc")
	if len(files) != 2 {
		t.Fatalf("found %d templates, want OpenTodo Light's and Dark's", len(files))
	}
	uncomment := regexp.MustCompile(`(?m)^(\s*)// (".*)$`)
	for _, f := range files {
		raw, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		for name, text := range map[string][]byte{"as written": raw, "uncommented": uncomment.ReplaceAll(raw, []byte("$1$2"))} {
			doc := stripJSONC(text)
			var v map[string]any
			if err := json.Unmarshal(doc, &v); err != nil {
				t.Fatalf("%s %s: %v", f, name, err)
			}
			if v["$schema"] == nil {
				t.Errorf("%s %s: no $schema", f, name)
			}
			if err := Validate(doc); err != nil {
				t.Errorf("%s %s: %v", f, name, err)
			}
		}
	}
}

// stripJSONC drops // comments outside strings and commas before a closing bracket,
// as the web app's theme file reader does (web/src/lib/theme/jsonc.ts).
func stripJSONC(src []byte) []byte {
	var out []byte
	inString := false
	for i := 0; i < len(src); i++ {
		c := src[i]
		switch {
		case inString:
			out = append(out, c)
			if c == '\\' && i+1 < len(src) {
				i++
				out = append(out, src[i])
			} else if c == '"' {
				inString = false
			}
		case c == '"':
			inString = true
			out = append(out, c)
		case c == '/' && i+1 < len(src) && src[i+1] == '/':
			for i < len(src) && src[i] != '\n' {
				i++
			}
			i--
		default:
			out = append(out, c)
		}
	}
	return regexp.MustCompile(`,(\s*[}\]])`).ReplaceAll(out, []byte("$1"))
}

// TestSharedExamples reads the documents the web app's format.test.ts reads and
// requires the same answer for each (theme-engine D1, docs/contracts.md).
func TestSharedExamples(t *testing.T) {
	raw, err := os.ReadFile("testdata/expected.json")
	if err != nil {
		t.Fatal(err)
	}
	var expected map[string]string
	if err := json.Unmarshal(raw, &expected); err != nil {
		t.Fatal(err)
	}
	files, _ := filepath.Glob("testdata/*/*.json")
	if len(files) != len(expected) {
		t.Fatalf("%d example files but %d entries in expected.json", len(files), len(expected))
	}
	for file, want := range expected {
		doc, err := os.ReadFile(filepath.Join("testdata", file))
		if err != nil {
			t.Fatal(err)
		}
		got := "ok"
		if err := Validate(doc); err != nil {
			got = Code(err)
		}
		if got != want {
			t.Errorf("%s: the server answers %s, the shared examples say %s", file, got, want)
		}
	}
}

func TestMigrateKeepsFormatOne(t *testing.T) {
	doc, _ := os.ReadFile("testdata/valid/full.json")
	if string(Migrate(doc)) != string(doc) {
		t.Fatal("format 1 must migrate to itself")
	}
}

func TestSizeIsCheckedFirst(t *testing.T) {
	big := make([]byte, MaxBytes+1)
	if Code(Validate(big)) != "size" {
		t.Fatal("want size")
	}
}

func TestRefusalNamesThePath(t *testing.T) {
	doc, _ := os.ReadFile("testdata/invalid/css-var.json")
	err := Validate(doc)
	e, ok := err.(*Error)
	if !ok || e.Path != "tokens.muted" || e.Error() == "" {
		t.Fatalf("got %v", err)
	}
}

// TestBuiltinDocumentsAreValid: every theme the web app ships (OpenTodo's two and
// the built-in catalogue, theme-catalogue) is a document the server accepts too.
func TestBuiltinDocumentsAreValid(t *testing.T) {
	files, _ := filepath.Glob("../../web/src/lib/theme/builtin/*.json")
	if len(files) < 16 {
		t.Fatalf("found %d built-in documents, want the 16 shipped", len(files))
	}
	for _, f := range files {
		doc, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		if err := Validate(doc); err != nil {
			t.Errorf("%s: %v", filepath.Base(f), err)
		}
	}
}
