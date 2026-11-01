package themes

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

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
