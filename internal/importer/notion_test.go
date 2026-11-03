package importer

import (
	"errors"
	"strings"
	"testing"
)

// A bare CSV with Name and Status is not taken for Notion's, but the format
// can be chosen for it; the database is then named after the file.
func TestNotionBareCSV(t *testing.T) {
	csv := []byte("Name,Status,Due\nWater plants,Done,\"October 29, 2026\"\nCall mum,Not started,\n")
	p, err := Detect(csv, "")
	if err == nil && p.Name() == notionFormat {
		t.Fatal("a bare CSV was detected as notion-csv")
	}
	parsed, err := parseWith(t, csv, func(o *Options) { o.Format = notionFormat; o.fileName = "Chores 0123456789abcdef0123456789abcdef.csv" })
	if err != nil || parsed.Format != notionFormat {
		t.Fatalf("%v %v", parsed, err)
	}
	if parsed.Rows[0].Kind != KindProject || parsed.Rows[0].Title != "Chores" {
		t.Fatalf("project = %+v", parsed.Rows[0])
	}
	if water := parsed.Rows[1]; !water.Completed || water.Due == nil || water.Due.Date != "2026-10-29" {
		t.Fatalf("row = %+v", water)
	}
}

func TestNotionColumnOptions(t *testing.T) {
	csv := []byte("Name,Status,Due,Do date\nA,Done,\"October 29, 2026\",\"November 2, 2026\"\n")
	force := func(cols map[string]*string) func(*Options) {
		return func(o *Options) { o.Format = notionFormat; o.Columns = cols }
	}
	doDate, none := "Do date", (*string)(nil)
	p, err := parseWith(t, csv, force(map[string]*string{RoleDue: &doDate, RoleStatus: none}))
	if err != nil {
		t.Fatal(err)
	}
	if r := p.Rows[1]; r.Completed || r.Due == nil || r.Due.Date != "2026-11-02" {
		t.Fatalf("row = %+v", r)
	}
	if !strings.Contains(strings.Join(p.Notes, "|"), "Status") {
		t.Fatalf("notes = %v (Status is no longer imported)", p.Notes)
	}
	missing := "Deadline"
	_, err = parseWith(t, csv, force(map[string]*string{RoleDue: &missing}))
	var oe *OptionError
	if !errors.As(err, &oe) || !strings.Contains(err.Error(), `"Deadline"`) {
		t.Fatalf("unknown column: %v", err)
	}
	o := Options{Columns: map[string]*string{"colour": &missing}}
	if err := o.Normalize(); err == nil {
		t.Fatal("an unknown role was accepted")
	}
}

func TestNotionDates(t *testing.T) {
	for in, want := range map[string]string{
		"October 29, 2026":                        "2026-10-29",
		"October 29, 2026 3:00 PM":                "2026-10-29 15:00",
		"12/20/2025 11:59 PM (PST)":               "2025-12-20 23:59",
		"2026-10-29":                              "2026-10-29",
		"November 2, 2026 → November 6, 2026":     "2026-11-02..2026-11-06",
		"September 23, 2023 → September 23, 2023": "2023-09-23",
	} {
		start, due, ok := notionDate(in, false)
		got := ""
		if ok {
			got = due.Date
			if due.Time != "" {
				got += " " + due.Time
			}
			if start != nil {
				got = start.Date + ".." + got
			}
		}
		if got != want {
			t.Errorf("%q: got %q, want %q", in, got, want)
		}
	}
	if _, due, ok := notionDate("12/01/2026", true); !ok || due.Date != "2026-01-12" {
		t.Errorf("day first: %v %v", due, ok)
	}
	if p := notionPriority("High 🔥"); p != 1 {
		t.Errorf("priority = %d", p)
	}
}

// A ZIP of several CSVs read as Notion names the dropped columns once.
func TestNotionForcedOnArchiveNotesOnce(t *testing.T) {
	z := zipOf(t, map[string]string{"a.csv": "Name,Owner\nx,y\n", "b.csv": "Name,Owner\nz,w\n"})
	p, err := parseWith(t, z, func(o *Options) { o.Format = notionFormat })
	if err != nil {
		t.Fatal(err)
	}
	if len(p.Notes) != 1 {
		t.Fatalf("notes = %v", p.Notes)
	}
}
