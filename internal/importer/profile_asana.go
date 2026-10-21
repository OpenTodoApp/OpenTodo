package importer

import (
	"bytes"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"path"
	"strconv"
	"strings"
)

// Asana: a project's CSV export (project menu → Export → CSV; OpenSpec change
// more-importers). One file is one project; Section/Column becomes sections,
// Parent task subtasks by name, and every column Asana does not document becomes
// a custom field whose type is inferred from its values (D3).

const asanaFormat = "asana-csv"

type asanaProfile struct{}

func (asanaProfile) Name() string        { return asanaFormat }
func (asanaProfile) Description() string { return "Asana: a project's CSV export" }

func (asanaProfile) Detect(data []byte) bool {
	have := map[string]bool{}
	for _, c := range csvHeader(data) {
		have[c] = true
	}
	for _, c := range []string{"Task ID", "Created At", "Completed At", "Last Modified", "Name", "Section/Column", "Assignee", "Due Date", "Parent task"} {
		if !have[c] {
			return false
		}
	}
	return true
}

// asanaColumns are the columns Asana documents; every other one is a custom field.
var asanaColumns = map[string]bool{
	"Task ID": true, "Created At": true, "Completed At": true, "Last Modified": true, "Name": true,
	"Section/Column": true, "Assignee": true, "Assignee Email": true, "Start Date": true, "Due Date": true,
	"Due Time": true, "Tags": true, "Notes": true, "Projects": true, "Parent task": true,
	"Blocked By (Dependencies)": true, "Blocking (Dependencies)": true, "Priority": true, "Collaborators": true,
}

var asanaPriority = map[string]int{"high": 1, "medium": 2, "low": 3}

func (asanaProfile) Read(rd io.Reader, opts Options) (*Parsed, error) {
	data, err := io.ReadAll(rd)
	if err != nil {
		return nil, err
	}
	r := csv.NewReader(bytes.NewReader(data))
	r.FieldsPerRecord = -1
	r.LazyQuotes = true
	header, err := r.Read()
	if err != nil {
		return nil, &FileError{fmt.Sprintf("cannot read the CSV header: %v", err)}
	}
	col := map[string]int{}
	var custom []string
	for i, h := range header {
		h = strings.TrimSpace(h)
		col[h] = i
		if !asanaColumns[h] && h != "" {
			custom = append(custom, h)
		}
	}
	type record struct {
		line int
		get  func(string) string
	}
	var recs []record
	var errRows []Row
	for {
		rec, err := r.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			var pe *csv.ParseError
			if errors.As(err, &pe) {
				errRows = append(errRows, Row{Line: pe.StartLine, Kind: KindTask, Err: fmt.Sprintf("unreadable CSV record: %v", pe.Err)})
				continue
			}
			return nil, &FileError{fmt.Sprintf("cannot read the CSV file: %v", err)}
		}
		if allBlank(rec) {
			continue
		}
		line, _ := r.FieldPos(0)
		recs = append(recs, record{line: line, get: func(c string) string {
			if i, ok := col[c]; ok && i < len(rec) {
				return strings.TrimSpace(rec[i])
			}
			return ""
		}})
		if len(recs) > MaxRows {
			return nil, ErrTooManyRows
		}
	}
	out := &Parsed{}
	loc := opts.Location()
	me := strings.ToLower(strings.TrimSpace(opts.importerEmail))

	// One file is one project: named after the archive entry or the uploaded
	// file, else the target.
	projSource := ""
	if file := firstNonEmpty(opts.entryName, opts.fileName); strings.TrimSpace(file) != "" {
		name := strings.TrimSuffix(path.Base(file), path.Ext(file))
		projSource = "asana:project:" + name
		out.Rows = append(out.Rows, Row{Line: 1, Kind: KindProject, SourceID: projSource, Title: name})
	}
	allColumns := len(recs) > 0
	byName := map[string]string{} // lower name → source id, first occurrence
	byID := map[string]bool{}
	for _, rc := range recs {
		id := rc.get("Task ID")
		if id != "" {
			byID[id] = true
		}
		if n := strings.ToLower(rc.get("Name")); n != "" {
			if _, ok := byName[n]; !ok && id != "" {
				byName[n] = "asana:" + id
			}
		}
		if rc.get("Section/Column") == "" {
			allColumns = false
		}
	}
	if allColumns && projSource != "" {
		out.ViewHints = append(out.ViewHints, ViewHint{ProjectSourceID: projSource, View: "board"})
	}
	fieldTypes := asanaFieldTypes(custom, func(yield func(func(string) string)) {
		for _, rc := range recs {
			yield(rc.get)
		}
	})
	otherProjects := false
	for _, rc := range recs {
		get := rc.get
		row := Row{Line: rc.line, Kind: KindTask, ProjectSourceID: projSource, SectionName: get("Section/Column")}
		if id := get("Task ID"); id != "" {
			row.SourceID = "asana:" + id
		} else {
			row.SourceID = fmt.Sprintf("asana:line:%d", rc.line)
		}
		row.Origin = importedOrigin("asana", row.SourceID)
		row.Title = get("Name")
		if row.Title == "" {
			row.fail("name is required")
		}
		row.Description = get("Notes")
		row.Labels = splitList(get("Tags"))
		if p := get("Parent task"); p != "" {
			if src, ok := byName[strings.ToLower(p)]; ok && src != row.SourceID {
				row.ParentSourceID = src
			} else {
				row.warn("parent task %q is not in this file; imported as a top-level task", p)
			}
		}
		if d := get("Due Date"); d != "" {
			if t := get("Due Time"); t != "" && len(d) == 10 {
				d += " " + t
			}
			due, err := parseDue(d, loc)
			if err != nil {
				row.warn("due date %q not understood; imported without a due date", get("Due Date"))
			} else {
				row.Due = due
			}
		}
		if s := get("Start Date"); s != "" {
			if d, err := parseDue(s, loc); err == nil && d != nil {
				row.Start = d.Date
			} else {
				row.warn("start date %q not understood; dropped", s)
			}
		}
		if ts := get("Completed At"); ts != "" {
			row.Completed = true
			if at, err := parseTimestamp(ts, loc); err == nil {
				row.CompletedAt = at
			}
		}
		if at, err := parseTimestamp(get("Created At"), loc); err == nil {
			row.CreatedAt = at
		}
		if p := get("Priority"); p != "" {
			if v, ok := asanaPriority[strings.ToLower(p)]; ok {
				row.Priority = v
			} else {
				row.warn("priority %q not recognised; imported as p4", p)
			}
		}
		assignee, email := strings.ToLower(get("Assignee")), strings.ToLower(get("Assignee Email"))
		if me != "" && (assignee == me || email == me) {
			row.AssignSelf = true
		} else if assignee != "" || email != "" {
			row.warn("assignee dropped (only your own account can be assigned by an import)")
		}
		if get("Collaborators") != "" {
			row.warn("collaborators dropped (an import cannot share a task)")
		}
		if get("Projects") != "" {
			otherProjects = true
		}
		for _, ref := range splitList(get("Blocked By (Dependencies)")) {
			if byID[ref] {
				row.BlockedBySourceIDs = append(row.BlockedBySourceIDs, "asana:"+ref)
			} else if src, ok := byName[strings.ToLower(ref)]; ok {
				row.BlockedBySourceIDs = append(row.BlockedBySourceIDs, src)
			} else {
				row.BlockedBySourceIDs = append(row.BlockedBySourceIDs, "asana:"+ref)
			}
		}
		for _, c := range custom {
			if v := get(c); v != "" {
				if fv, ok := asanaFieldValue(c, fieldTypes[c], v); ok {
					row.Fields = append(row.Fields, fv)
				}
			}
		}
		out.Rows = append(out.Rows, row)
	}
	out.Rows = append(out.Rows, errRows...)
	if otherProjects {
		out.Notes = append(out.Notes, "the Projects column names other Asana projects; one file is imported as one project, so they are not created")
	}
	return out, nil
}

// asanaFieldTypes infers each custom column's type from all its values: numbers,
// Yes/No, dates, at most ten distinct texts (a choice), otherwise text.
func asanaFieldTypes(columns []string, each func(func(func(string) string))) map[string]string {
	type stats struct {
		num, check, date, total int
		distinct              map[string]bool
	}
	st := map[string]*stats{}
	for _, c := range columns {
		st[c] = &stats{distinct: map[string]bool{}}
	}
	each(func(get func(string) string) {
		for _, c := range columns {
			v := get(c)
			if v == "" {
				continue
			}
			s := st[c]
			s.total++
			s.distinct[v] = true
			if _, err := strconv.ParseFloat(strings.ReplaceAll(v, ",", ""), 64); err == nil {
				s.num++
			}
			switch strings.ToLower(v) {
			case "yes", "no", "true", "false":
				s.check++
			}
			if len(v) == 10 && validDate(v) {
				s.date++
			}
		}
	})
	out := map[string]string{}
	for c, s := range st {
		switch {
		case s.total == 0:
			out[c] = FieldText
		case s.num == s.total:
			out[c] = FieldNumber
		case s.check == s.total:
			out[c] = FieldCheckbox
		case s.date == s.total:
			out[c] = FieldDate
		case len(s.distinct) <= 10:
			out[c] = FieldChoice
		default:
			out[c] = FieldText
		}
	}
	return out
}

func asanaFieldValue(name, typ, v string) (FieldValue, bool) {
	switch typ {
	case FieldNumber:
		n, err := strconv.ParseFloat(strings.ReplaceAll(v, ",", ""), 64)
		return FieldValue{name, typ, n}, err == nil
	case FieldCheckbox:
		l := strings.ToLower(v)
		return FieldValue{name, typ, l == "yes" || l == "true"}, true
	}
	return FieldValue{name, typ, v}, true
}
