package importer

import (
	"archive/zip"
	"bytes"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/recurrence"
)

// Fuzz targets for imports (wave 2 of the 2026-10 audit, Z1): any signed-in
// person uploads these files. Whatever the bytes, reading them must not panic,
// stays within the row limit, and gives rows whose values the planner can turn
// into valid ops.

var fuzzDateRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

func importSeeds(f *testing.F) [][]byte {
	var out [][]byte
	_ = filepath.WalkDir("testdata", func(p string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() || strings.HasSuffix(p, ".golden.json") {
			return nil
		}
		if b, err := os.ReadFile(p); err == nil && len(b) <= 1<<20 {
			out = append(out, b)
		}
		return nil
	})
	if len(out) == 0 {
		f.Fatal("no import fixtures")
	}
	return out
}

func checkParsed(t *testing.T, p *Parsed, err error) {
	t.Helper()
	if err != nil {
		return // a refusal is fine; a panic is not
	}
	if len(p.Rows) > MaxRows {
		t.Fatalf("%d rows, more than MaxRows", len(p.Rows))
	}
	for i, r := range p.Rows {
		if r.Priority < 0 || r.Priority > 4 {
			t.Fatalf("row %d: priority %d", i, r.Priority)
		}
		if r.Due != nil && r.Err == "" {
			if !fuzzDateRe.MatchString(r.Due.Date) {
				t.Fatalf("row %d: due %q", i, r.Due.Date)
			}
			if _, err := time.Parse("2006-01-02", r.Due.Date); err != nil {
				t.Fatalf("row %d: due %q is not a date", i, r.Due.Date)
			}
		}
		if r.Recurrence != "" && r.Err == "" {
			if c, err := recurrence.Canonicalize(r.Recurrence); err != nil || c != r.Recurrence {
				t.Fatalf("row %d: recurrence %q is not canonical (%q, %v)", i, r.Recurrence, c, err)
			}
		}
		for _, l := range r.Links {
			u, err := url.Parse(l.URL)
			if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
				t.Fatalf("row %d: link %q", i, l.URL)
			}
		}
		if strings.Contains(r.File, "..") || strings.Contains(r.File, "/") {
			t.Fatalf("row %d: file %q", i, r.File)
		}
	}
}

// FuzzParse reads a file the way an upload is read: detected, or forced to one
// of the profiles (format selects it by index).
func FuzzParse(f *testing.F) {
	for _, b := range importSeeds(f) {
		f.Add(b, uint8(255))
	}
	f.Add([]byte("title,due,priority\n\"a\"\"b\",2026-02-30,9\n"), uint8(255))
	f.Add([]byte(`{"tasks":[{"title":"x","due":"tomorrow","recurrence":"every 0 days"}]}`), uint8(255))
	names := ProfileNames()
	f.Fuzz(func(t *testing.T, data []byte, format uint8) {
		opts := Options{exportedAt: time.Date(2026, 10, 26, 12, 0, 0, 0, time.UTC), maxBytes: 4 << 20}
		if int(format) < len(names) {
			opts.Format = names[format]
		}
		p, err := Parse(data, opts)
		checkParsed(t, p, err)
	})
}

// FuzzReadArchive: a ZIP never yields an entry outside the archive, or more
// unpacked bytes or entries than the limits allow.
func FuzzReadArchive(f *testing.F) {
	for _, b := range importSeeds(f) {
		if isZip(b) {
			f.Add(b)
		}
	}
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for _, name := range []string{"a.csv", "dir/b.csv", "../c.csv", "__MACOSX/d", ".hidden"} {
		w, _ := zw.Create(name)
		_, _ = w.Write([]byte("title\nx\n"))
	}
	_ = zw.Close()
	f.Add(buf.Bytes())
	const maxBytes = 64 << 10
	f.Fuzz(func(t *testing.T, data []byte) {
		entries, err := readArchive(data, maxBytes)
		if err != nil {
			return
		}
		if len(entries) == 0 || len(entries) > MaxArchiveEntries {
			t.Fatalf("%d entries", len(entries))
		}
		var total int64
		for _, e := range entries {
			if strings.HasPrefix(e.name, "/") || strings.Contains(e.name, "\\") || containsDotDot(e.name) {
				t.Fatalf("unsafe entry %q accepted", e.name)
			}
			total += int64(len(e.data))
		}
		if total > maxBytes*archiveExpansion {
			t.Fatalf("%d bytes unpacked, over the limit", total)
		}
	})
}
