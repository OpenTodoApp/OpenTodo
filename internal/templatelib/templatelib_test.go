package templatelib

import (
	"os"
	"testing"
)

// The embedded copy is the web app's library, byte for byte (make templates writes both).
func TestLibraryIsTheWebCopy(t *testing.T) {
	web, err := os.ReadFile("../../web/src/generated/templates.json")
	if err != nil {
		t.Fatal(err)
	}
	if string(web) != string(libraryJSON) {
		t.Fatal("internal/templatelib/library.json differs from web/src/generated/templates.json: run make templates")
	}
}

// The same offsets as web/src/lib/templateLibrary.test.ts.
func TestResolveOffset(t *testing.T) {
	for _, c := range [][3]string{
		{"+0d", "2026-01-31", "2026-01-31"}, {"+2d", "2026-01-31", "2026-02-02"}, {"+1w", "2026-01-31", "2026-02-07"},
		{"+1m", "2026-01-31", "2026-02-28"}, {"+1m", "2028-01-31", "2028-02-29"}, {"+12m", "2026-03-15", "2027-03-15"},
		{"+11m", "2026-03-31", "2027-02-28"},
	} {
		if got, err := ResolveOffset(c[0], c[1]); err != nil || got != c[2] {
			t.Errorf("%s from %s: %s %v, want %s", c[0], c[1], got, err, c[2])
		}
	}
	if _, err := ResolveOffset("next week", "2026-01-31"); err == nil {
		t.Fatal("a word offset resolved")
	}
}

// The library's counts hold for the Go reader, and every due offset resolves.
func TestLibraryCounts(t *testing.T) {
	list, err := All()
	if err != nil || len(list) < 10 {
		t.Fatalf("%d templates, %v", len(list), err)
	}
	for _, tpl := range list {
		tasks, sections := 0, 0
		var walk func([]Task)
		walk = func(ts []Task) {
			for _, tk := range ts {
				tasks++
				if tk.Due != "" {
					if _, err := ResolveOffset(tk.Due, "2026-11-02"); err != nil {
						t.Errorf("%s: %v", tpl.Slug, err)
					}
				}
				walk(tk.Subtasks)
			}
		}
		for _, p := range tpl.Projects {
			walk(p.Tasks)
			for _, s := range p.Sections {
				sections++
				walk(s.Tasks)
			}
		}
		if tasks != tpl.Counts.Tasks || sections != tpl.Counts.Sections || len(tpl.Projects) != tpl.Counts.Projects || len(tpl.Labels) != tpl.Counts.Labels {
			t.Errorf("%s: %d tasks %d sections, counts %+v", tpl.Slug, tasks, sections, tpl.Counts)
		}
	}
	if _, ok := Find("weekly-review"); !ok {
		t.Fatal("weekly-review missing")
	}
}
