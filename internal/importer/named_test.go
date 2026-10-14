package importer

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

var updateGolden = flag.Bool("update", false, "rewrite the golden previews of the named-format fixtures")

// namedPreview is what a golden file pins: the detected format, notes, view
// hints, totals and every row's outcome, file, warnings and reason.
type namedPreview struct {
	Format    string         `json:"format"`
	Notes     []string       `json:"notes"`
	Totals    Totals         `json:"totals"`
	ViewHints []PlanViewHint `json:"viewHints"`
	Rows      []RowResult    `json:"rows"`
	Fields    []string       `json:"fields"`
}

// previewFixture parses and plans a fixture into an empty account, with a fixed
// clock, ids and export date so the output is stable.
func previewFixture(t *testing.T, path string) namedPreview {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	opts := Options{}
	if err := opts.Normalize(); err != nil {
		t.Fatal(err)
	}
	opts.exportedAt = time.Date(2026, 9, 19, 22, 10, 0, 0, time.UTC)
	opts.importerEmail = "owner@example.test"
	opts.tempDir = t.TempDir()
	parsed, err := Parse(data, opts)
	if err != nil {
		t.Fatalf("%s: %v", path, err)
	}
	n := 0
	newID := func() string { n++; return fmt.Sprintf("id-%04d", n) }
	plan := BuildPlan(parsed, opts, &State{UserID: "user-1"}, time.Date(2026, 10, 14, 12, 0, 0, 0, time.UTC), newID)
	var fields []string
	for _, c := range plan.changes {
		var parts []string
		for _, f := range c.fields {
			if f.name == "position" || f.name == "color" {
				continue
			}
			parts = append(parts, f.name+"="+string(f.value))
		}
		fields = append(fields, c.entity+" "+c.id+": "+strings.Join(parts, " "))
	}
	return namedPreview{Format: plan.Format, Notes: plan.Notes, Totals: plan.Totals, ViewHints: plan.ViewHints, Rows: plan.Rows, Fields: fields}
}

// Real exports (sanitised, named-importers D5) import with pinned results.
func TestNamedFormatFixtures(t *testing.T) {
	for _, dir := range []string{"todoist-backup", "ticktick-csv", "linear-csv", "things-db"} {
		files, _ := filepath.Glob(filepath.Join("testdata", dir, "*"))
		for _, f := range files {
			if strings.HasSuffix(f, ".golden.json") {
				continue
			}
			t.Run(f, func(t *testing.T) {
				got, _ := json.MarshalIndent(previewFixture(t, f), "", "  ")
				golden := f + ".golden.json"
				if *updateGolden {
					if err := os.WriteFile(golden, append(got, '\n'), 0o644); err != nil {
						t.Fatal(err)
					}
				}
				want, err := os.ReadFile(golden)
				if err != nil {
					t.Fatalf("missing golden file (run go test ./internal/importer -run NamedFormat -update): %v", err)
				}
				if strings.TrimSpace(string(want)) != strings.TrimSpace(string(got)) {
					t.Fatalf("%s changed; review and rerun with -update if intended\n--- got\n%s", f, got)
				}
			})
		}
	}
}
