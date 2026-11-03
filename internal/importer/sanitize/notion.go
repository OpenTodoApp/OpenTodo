package main

import (
	"archive/zip"
	"bytes"
	"encoding/csv"
	"io"
	"net/url"
	"path"
	"regexp"
	"strings"
)

// ---- ZIP (Notion Markdown & CSV export) ----

// A Notion export's columns are its owner's own properties, so values are
// scrubbed by what they look like: dates, numbers, Yes/No and common status
// and priority words stay (the importer reads them), anything else becomes a
// placeholder, the same one for the same text everywhere in the export, so
// select options, relations and page titles still match. Page ids stay.

var (
	notionCSV    = regexp.MustCompile(`^(.*) ([0-9a-f]{32})(_all)?\.csv$`)
	notionMD     = regexp.MustCompile(`^(.*) ([0-9a-f]{32})\.md$`)
	notionIDTail = regexp.MustCompile(` ([0-9a-f]{32})((?:_all)?\.[a-z]+)?$`)
	notionRel    = regexp.MustCompile(`^(.*?) \(([^()]*)\)$`)
	notionKeepRe = regexp.MustCompile(`^(?:\d+(?:[.,]\d+)?|[A-Z][a-z]+ \d{1,2}, \d{4}.*|\d{1,4}[/-]\d{1,2}[/-]\d{1,4}.*|P\d)$`)
	mdPrefix     = regexp.MustCompile(`^(\s*(?:#{1,6} |[-*+] \[[ x]\]\s+|[-*+] |\d+\. |> )?)(.*)$`)
)

// notionWords are option values that carry no personal data and that the
// importer reads (status and priority words, checkboxes).
var notionWords = map[string]bool{"yes": true, "no": true, "done": true, "complete": true, "completed": true, "archived": true,
	"not started": true, "in progress": true, "next up": true, "high": true, "medium": true, "low": true, "urgent": true}

func isNotionZip(names []string) bool {
	for _, n := range names {
		if notionCSV.MatchString(path.Base(n)) {
			return true
		}
	}
	return false
}

// notionValue scrubs one cell or property value.
func (s *scrubber) notionValue(v string) string {
	t := strings.TrimSpace(v)
	if t == "" || notionKeepRe.MatchString(t) || notionWords[strings.ToLower(strings.Trim(t, " 🔥"))] {
		return v
	}
	if strings.Contains(t, " → ") {
		return v // a date range
	}
	parts := strings.Split(t, ", ")
	for i, p := range parts {
		if m := notionRel.FindStringSubmatch(p); m != nil {
			parts[i] = s.text("Page", m[1]) + " (" + s.notionLink(m[2]) + ")"
			continue
		}
		parts[i] = s.text("Value", p)
	}
	return strings.Join(parts, ", ")
}

// notionLink keeps a link's page id and replaces its names.
func (s *scrubber) notionLink(link string) string {
	if strings.HasPrefix(link, "http") {
		if u, err := url.Parse(link); err == nil {
			return u.Scheme + "://" + u.Host + u.Path + "?" + u.RawQuery
		}
		return link
	}
	plain, err := url.PathUnescape(link)
	if err != nil {
		plain = link
	}
	segs := strings.Split(plain, "/")
	for i, seg := range segs {
		segs[i] = s.notionName(seg)
	}
	return (&url.URL{Path: strings.Join(segs, "/")}).EscapedPath()
}

// notionName scrubs a file or folder name, keeping its id and extension.
func (s *scrubber) notionName(seg string) string {
	if seg == "" || seg == "." || seg == ".." {
		return seg
	}
	if m := notionIDTail.FindStringSubmatchIndex(seg); m != nil {
		return s.text("Page", seg[:m[0]]) + seg[m[0]:]
	}
	ext := path.Ext(seg)
	return s.text("Page", strings.TrimSuffix(seg, ext)) + ext
}

// notionCSVFile scrubs a database CSV: the header stays, every cell is scrubbed.
func (s *scrubber) notionCSVFile(data []byte) ([]byte, error) {
	bom := bytes.HasPrefix(data, []byte("\xef\xbb\xbf"))
	r := csv.NewReader(bytes.NewReader(bytes.TrimPrefix(data, []byte("\xef\xbb\xbf"))))
	r.FieldsPerRecord = -1
	r.LazyQuotes = true
	recs, err := r.ReadAll()
	if err != nil {
		return nil, err
	}
	for i := 1; i < len(recs); i++ {
		for j := range recs[i] {
			if j == 0 {
				recs[i][j] = s.text("Page", strings.TrimSpace(recs[i][j]))
			} else {
				recs[i][j] = s.notionValue(recs[i][j])
			}
		}
	}
	var buf bytes.Buffer
	if bom {
		buf.WriteString("\xef\xbb\xbf")
	}
	w := csv.NewWriter(&buf)
	w.UseCRLF = true
	if err := w.WriteAll(recs); err != nil {
		return nil, err
	}
	return bytes.TrimSuffix(buf.Bytes(), []byte("\r\n")), nil
}

// notionPage scrubs a row page: the title, the property values and the
// text of each body line, keeping headings, list and checklist markers.
func (s *scrubber) notionPage(data []byte) []byte {
	lines := strings.Split(string(data), "\n")
	inProps := false
	for i, l := range lines {
		switch {
		case i == 0 && strings.HasPrefix(l, "# "):
			lines[i] = "# " + s.text("Page", strings.TrimSpace(l[2:]))
			inProps = true
		case inProps && strings.TrimSpace(l) == "" && i == 1:
		case inProps && strings.Contains(l, ": "):
			name, v, _ := strings.Cut(l, ": ")
			lines[i] = name + ": " + s.notionValue(v)
		default:
			inProps = false
			m := mdPrefix.FindStringSubmatch(l)
			if strings.TrimSpace(m[2]) == "" || strings.HasPrefix(strings.TrimSpace(m[2]), "<") || strings.TrimSpace(m[2]) == "---" {
				continue
			}
			lines[i] = m[1] + s.text("Line", m[2])
		}
	}
	return []byte(strings.Join(lines, "\n"))
}

func allZips(names []string) bool {
	for _, n := range names {
		if !strings.HasSuffix(strings.ToLower(n), ".zip") {
			return false
		}
	}
	return len(names) > 0
}

// notionZip rewrites a Notion export: every path segment keeps its id, CSVs
// and pages are scrubbed, other files become placeholders, and a "Part-N"
// ZIP inside is rewritten the same way.
func (s *scrubber) notionZip(zr *zip.Reader) ([]byte, error) {
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
		base := path.Base(name)
		switch {
		case strings.HasSuffix(strings.ToLower(name), ".zip"):
			if b, err = s.zip(b); err != nil {
				return nil, err
			}
		case notionCSV.MatchString(base):
			if b, err = s.notionCSVFile(b); err != nil {
				return nil, err
			}
			name = s.notionPath(name)
		case notionMD.MatchString(base):
			b = s.notionPage(b)
			name = s.notionPath(name)
		default:
			b = []byte(s.text("File content", base) + "\n")
			name = s.notionPath(name)
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

// notionPath scrubs every segment of an entry name except the export's own
// top folders ("Private & Shared", "Export-<uuid>").
func (s *scrubber) notionPath(name string) string {
	segs := strings.Split(name, "/")
	for i, seg := range segs {
		if seg == "Private & Shared" || strings.HasPrefix(seg, "Export-") {
			continue
		}
		segs[i] = s.notionName(seg)
	}
	return strings.Join(segs, "/")
}
