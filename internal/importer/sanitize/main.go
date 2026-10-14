// Command sanitize turns a real export into a test fixture (OpenSpec change
// named-importers, design D5): titles, notes, names, people, user ids, email
// addresses and file names are replaced by deterministic placeholders, while the
// structure the importer reads (columns, row types, indent, dates, priorities,
// recurrence strings, statuses, the BOM and preambles) stays as it was.
//
//	go run ./internal/importer/sanitize <in> <out>
//
// <in> is a CSV, a ZIP of CSVs (Todoist backup) or a Things main.sqlite. Nothing
// imports this package, so it is never part of the server binary. Review every
// output before committing it.
package main

import (
	"archive/zip"
	"bytes"
	"database/sql"
	"encoding/csv"
	"fmt"
	"io"
	"os"
	"path"
	"regexp"
	"strings"

	_ "modernc.org/sqlite"
)

func main() {
	if len(os.Args) != 3 {
		fmt.Fprintln(os.Stderr, "usage: sanitize <in> <out>")
		os.Exit(2)
	}
	if err := run(os.Args[1], os.Args[2]); err != nil {
		fmt.Fprintln(os.Stderr, "sanitize:", err)
		os.Exit(1)
	}
}

func run(in, out string) error {
	data, err := os.ReadFile(in)
	if err != nil {
		return err
	}
	s := newScrubber()
	switch {
	case bytes.HasPrefix(data, []byte("PK\x03\x04")):
		b, err := s.zip(data)
		if err != nil {
			return err
		}
		return os.WriteFile(out, b, 0o644)
	case bytes.HasPrefix(data, []byte("SQLite format 3\x00")):
		return s.sqlite(in, out)
	default:
		b, err := s.csvFile(data)
		if err != nil {
			return err
		}
		return os.WriteFile(out, b, 0o644)
	}
}

// scrubber hands out stable placeholders: the same input always maps to the same
// output within one run, so references (parents, labels, projects) still match.
type scrubber struct {
	seen  map[string]map[string]string
	count map[string]int
}

func newScrubber() *scrubber {
	return &scrubber{seen: map[string]map[string]string{}, count: map[string]int{}}
}

func (s *scrubber) get(kind, value string, mk func(n int) string) string {
	if value == "" {
		return ""
	}
	m := s.seen[kind]
	if m == nil {
		m = map[string]string{}
		s.seen[kind] = m
	}
	if v, ok := m[value]; ok {
		return v
	}
	s.count[kind]++
	v := mk(s.count[kind])
	m[value] = v
	return v
}

func (s *scrubber) text(kind, value string) string {
	return s.get(kind, value, func(n int) string { return fmt.Sprintf("%s %d", kind, n) })
}

var (
	emailRe     = regexp.MustCompile(`[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}`)
	personRe    = regexp.MustCompile(`^(.*) \((\d+)\)$`) // Todoist "Name (userid)"
	labelRe     = regexp.MustCompile(`(^|\s)@([\p{L}\p{N}_-]+)`)
	linearIDRe  = regexp.MustCompile(`\b[A-Z][A-Z0-9]*-(\d+)\b`)
	todoistFile = regexp.MustCompile(`^(.*) \[([^\]]+)\]\.csv$`)
)

// email maps an address to userN@example.test; the first address seen becomes
// owner@example.test, so fixtures can model "assigned to the importer".
func (s *scrubber) email(v string) string {
	return s.get("email", strings.ToLower(v), func(n int) string {
		if n == 1 {
			return "owner@example.test"
		}
		return fmt.Sprintf("user%d@example.test", n)
	})
}

// prose replaces free text, keeping @label tokens (as placeholders) and line breaks.
func (s *scrubber) prose(kind, v string) string {
	if strings.TrimSpace(v) == "" {
		return v
	}
	var labels []string
	for _, m := range labelRe.FindAllStringSubmatch(v, -1) {
		labels = append(labels, "@"+s.labelName(m[2]))
	}
	out := s.text(kind, v)
	if len(labels) > 0 {
		out += " " + strings.Join(labels, " ")
	}
	return out
}

func (s *scrubber) labelName(v string) string {
	return s.get("label", strings.ToLower(v), func(n int) string { return fmt.Sprintf("label%d", n) })
}

func (s *scrubber) labelList(v string, sep string) string {
	if strings.TrimSpace(v) == "" {
		return v
	}
	parts := strings.Split(v, strings.TrimSpace(sep))
	for i, p := range parts {
		parts[i] = s.labelName(strings.TrimSpace(p))
	}
	return strings.Join(parts, sep)
}

func (s *scrubber) id(kind, v string) string {
	if v == "" {
		return v
	}
	return s.get("id:"+kind, v, func(n int) string { return fmt.Sprintf("%s%06d", kind, n) })
}

func (s *scrubber) person(v string) string {
	if m := personRe.FindStringSubmatch(v); m != nil {
		return fmt.Sprintf("%s (%s)", s.text("Person", m[1]), s.get("userid", m[2], func(n int) string { return fmt.Sprintf("%d", 1000000+n) }))
	}
	if emailRe.MatchString(v) {
		return s.email(v)
	}
	return s.text("Person", v)
}

// ---- CSV ----

func (s *scrubber) csvFile(data []byte) ([]byte, error) {
	bom := bytes.HasPrefix(data, []byte("\xef\xbb\xbf"))
	body := bytes.TrimPrefix(data, []byte("\xef\xbb\xbf"))
	r := csv.NewReader(bytes.NewReader(body))
	r.FieldsPerRecord = -1
	r.LazyQuotes = true
	recs, err := r.ReadAll()
	if err != nil {
		return nil, err
	}
	hi := headerIndex(recs)
	if hi < 0 {
		return nil, fmt.Errorf("no known header (Todoist, TickTick or Linear)")
	}
	header := recs[hi]
	col := map[string]int{}
	for i, h := range header {
		col[strings.TrimSpace(h)] = i
	}
	rule := rulesFor(header)
	for ri := hi + 1; ri < len(recs); ri++ {
		rec := recs[ri]
		for name, f := range rule {
			if i, ok := col[name]; ok && i < len(rec) {
				rec[i] = f(s, rec[i])
			}
		}
	}
	var buf bytes.Buffer
	if bom {
		buf.WriteString("\xef\xbb\xbf")
	}
	w := csv.NewWriter(&buf)
	w.UseCRLF = bytes.Contains(body, []byte("\r\n"))
	if err := w.WriteAll(recs); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// headerIndex finds the header record, after any preamble (TickTick).
func headerIndex(recs [][]string) int {
	for i, r := range recs {
		if len(r) == 0 {
			continue
		}
		switch strings.TrimSpace(r[0]) {
		case "TYPE", "Folder Name", "ID":
			return i
		}
	}
	return -1
}

type fieldRule map[string]func(*scrubber, string) string

func rulesFor(header []string) fieldRule {
	switch strings.TrimSpace(header[0]) {
	case "TYPE": // Todoist
		return fieldRule{
			"CONTENT": func(s *scrubber, v string) string {
				if strings.HasPrefix(v, "view_style=") {
					return v
				}
				return s.prose("Task", v)
			},
			"DESCRIPTION": func(s *scrubber, v string) string { return s.prose("Notes", v) },
			"AUTHOR":      func(s *scrubber, v string) string { return s.person(v) },
			"RESPONSIBLE": func(s *scrubber, v string) string { return s.person(v) },
		}
	case "Folder Name": // TickTick
		return fieldRule{
			"Folder Name": func(s *scrubber, v string) string { return s.text("Folder", v) },
			"List Name":   func(s *scrubber, v string) string { return s.text("List", v) },
			"Title":       func(s *scrubber, v string) string { return s.text("Task", v) },
			"Content":     func(s *scrubber, v string) string { return s.checklist(v) },
			"Tags":        func(s *scrubber, v string) string { return s.labelList(v, ", ") },
			"Column Name": func(s *scrubber, v string) string { return s.text("Column", v) },
			"taskId":      func(s *scrubber, v string) string { return s.id("t", v) },
			"parentId":    func(s *scrubber, v string) string { return s.id("t", v) },
		}
	default: // Linear
		ident := func(s *scrubber, v string) string {
			return linearIDRe.ReplaceAllStringFunc(v, func(m string) string {
				return "ENG-" + linearIDRe.FindStringSubmatch(m)[1]
			})
		}
		return fieldRule{
			"ID":                   ident,
			"Parent issue":         ident,
			"Related to":           ident,
			"Blocked by":           ident,
			"Duplicate of":         ident,
			"Team":                 func(s *scrubber, v string) string { return s.text("Team", v) },
			"Title":                func(s *scrubber, v string) string { return s.text("Issue", v) },
			"Description":          func(s *scrubber, v string) string { return s.prose("Notes", v) },
			"Project ID":           func(s *scrubber, v string) string { return s.uuid(v) },
			"Project":              func(s *scrubber, v string) string { return s.text("Project", v) },
			"Creator":              func(s *scrubber, v string) string { return s.person(v) },
			"Assignee":             func(s *scrubber, v string) string { return s.person(v) },
			"Labels":               func(s *scrubber, v string) string { return s.labelList(v, ", ") },
			"Cycle Name":           func(s *scrubber, v string) string { return s.text("Cycle", v) },
			"Initiatives":          func(s *scrubber, v string) string { return s.text("Initiative", v) },
			"Project Milestone ID": func(s *scrubber, v string) string { return s.uuid(v) },
			"Project Milestone":    func(s *scrubber, v string) string { return s.text("Milestone", v) },
			"UUID":                 func(s *scrubber, v string) string { return s.uuid(v) },
		}
	}
}

// checklist keeps TickTick checklist markers ("▫"/"▪" item lines) while
// replacing each item's text.
func (s *scrubber) checklist(v string) string {
	if strings.TrimSpace(v) == "" {
		return v
	}
	lines := strings.Split(v, "\n")
	for i, l := range lines {
		t := strings.TrimSpace(l)
		if t == "" {
			continue
		}
		prefix := ""
		for _, m := range []string{"▫", "▪", "- [ ]", "- [x]"} {
			if strings.HasPrefix(t, m) {
				prefix = m + " "
				break
			}
		}
		lines[i] = prefix + s.text("Item", t)
	}
	return strings.Join(lines, "\n")
}

func (s *scrubber) uuid(v string) string {
	if v == "" {
		return v
	}
	return s.get("uuid", v, func(n int) string { return fmt.Sprintf("00000000-0000-4000-8000-%012d", n) })
}

// ---- ZIP (Todoist backup) ----

func (s *scrubber) zip(data []byte) ([]byte, error) {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for _, f := range zr.File {
		rc, err := f.Open()
		if err != nil {
			return nil, err
		}
		b, err := io.ReadAll(rc)
		rc.Close()
		if err != nil {
			return nil, err
		}
		name := f.Name
		if strings.HasSuffix(strings.ToLower(name), ".csv") {
			if b, err = s.csvFile(b); err != nil {
				return nil, fmt.Errorf("%s: %w", name, err)
			}
			dir, base := path.Split(name)
			if m := todoistFile.FindStringSubmatch(base); m != nil {
				base = fmt.Sprintf("%s [%s].csv", s.text("Project", m[1]), s.id("p", m[2]))
			} else {
				base = s.text("File", base) + ".csv"
			}
			name = dir + base
		}
		w, err := zw.CreateHeader(&zip.FileHeader{Name: name, Method: zip.Deflate, Modified: f.Modified})
		if err != nil {
			return nil, err
		}
		if _, err := w.Write(b); err != nil {
			return nil, err
		}
	}
	if err := zw.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// ---- SQLite (Things) ----

func (s *scrubber) sqlite(in, out string) error {
	src, err := os.ReadFile(in)
	if err != nil {
		return err
	}
	if err := os.WriteFile(out, src, 0o644); err != nil {
		return err
	}
	db, err := sql.Open("sqlite", out)
	if err != nil {
		return err
	}
	defer db.Close()
	type col struct{ table, column, kind string }
	cols := []col{
		{"TMTask", "title", "Item"}, {"TMTask", "notes", "Notes"},
		{"TMArea", "title", "Area"}, {"TMTag", "title", "Tag"}, {"TMTag", "shortcut", "Key"},
		{"TMChecklistItem", "title", "Item"},
		{"TMContact", "displayName", "Person"}, {"TMContact", "firstName", "Person"},
		{"TMContact", "lastName", "Person"}, {"TMContact", "emails", "Email"},
		{"TMSmartList", "title", "List"},
	}
	for _, c := range cols {
		if err := s.scrubColumn(db, c.table, c.column, c.kind); err != nil {
			return fmt.Errorf("%s.%s: %w", c.table, c.column, err)
		}
	}
	// Secrets and caches that could hold personal data.
	for _, q := range []string{
		"UPDATE TMSettings SET uriSchemeAuthenticationToken = NULL",
		"UPDATE TMTask SET cachedTags = NULL, notesSync = NULL",
		"UPDATE TMArea SET cachedTags = NULL",
		"DELETE FROM BSSyncronyMetadata",
		"DELETE FROM ThingsTouch_ExtensionCommandStore_Commands",
	} {
		if _, err := db.Exec(q); err != nil && !strings.Contains(err.Error(), "no such") {
			return fmt.Errorf("%s: %w", q, err)
		}
	}
	if _, err := db.Exec("PRAGMA journal_mode=DELETE"); err != nil {
		return err
	}
	_, err = db.Exec("VACUUM")
	return err
}

func (s *scrubber) scrubColumn(db *sql.DB, table, column, kind string) error {
	rows, err := db.Query(fmt.Sprintf(`SELECT rowid, "%s" FROM "%s" WHERE "%s" IS NOT NULL AND "%s" != ''`, column, table, column, column))
	if err != nil {
		if strings.Contains(err.Error(), "no such") {
			return nil
		}
		return err
	}
	type upd struct {
		id int64
		v  string
	}
	var ups []upd
	for rows.Next() {
		var id int64
		var v string
		if err := rows.Scan(&id, &v); err != nil {
			rows.Close()
			return err
		}
		ups = append(ups, upd{id, s.text(kind, v)})
	}
	rows.Close()
	for _, u := range ups {
		if _, err := db.Exec(fmt.Sprintf(`UPDATE "%s" SET "%s" = ? WHERE rowid = ?`, table, column), u.v, u.id); err != nil {
			return err
		}
	}
	return nil
}
