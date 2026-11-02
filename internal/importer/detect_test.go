package importer

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Every fixture kept with the tests is read in the format it was read in before
// a new profile joined Profiles (data-import "Existing fixtures keep their
// format"): a named format's fixtures live in testdata/<format>/, and the
// generic fixtures are listed here. A new profile that steals another
// format's file fails this test with the fixture's name.
func TestDetectEveryFixture(t *testing.T) {
	generic := map[string]string{
		"testdata/tasks.csv":          "csv",
		"testdata/items.json":         "json-items",
		"testdata/lists.json":         "json-lists",
		"testdata/generic.json":       "json-generic",
		"testdata/template/trip.json": "opentodo",
	}
	dirs, err := filepath.Glob("testdata/*")
	if err != nil {
		t.Fatal(err)
	}
	cases := map[string]string{}
	for k, v := range generic {
		cases[k] = v
	}
	known := map[string]bool{}
	for _, n := range ProfileNames() {
		known[n] = true
	}
	for _, dir := range dirs {
		info, err := os.Stat(dir)
		if err != nil || !info.IsDir() || !known[filepath.Base(dir)] {
			continue
		}
		files, _ := filepath.Glob(filepath.Join(dir, "*"))
		for _, f := range files {
			if strings.HasSuffix(f, ".golden.json") || strings.HasSuffix(f, ".md") {
				continue
			}
			cases[f] = filepath.Base(dir)
		}
	}
	if len(cases) < 25 {
		t.Fatalf("only %d fixtures found", len(cases))
	}
	for path, want := range cases {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		opts := Options{}
		if err := opts.Normalize(); err != nil {
			t.Fatal(err)
		}
		opts.tempDir = t.TempDir()
		opts.fileName = filepath.Base(path)
		parsed, err := Parse(data, opts)
		if err != nil {
			t.Errorf("%s: %v", path, err)
			continue
		}
		if parsed.Format != want {
			t.Errorf("%s: detected as %s, want %s", path, parsed.Format, want)
		}
	}
}
