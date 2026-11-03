package importer

import (
	"bytes"
	"crypto/sha256"
	"encoding/csv"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"
	"unicode/utf16"

	"github.com/OpenTodoApp/opentodo/internal/timetrack"
)

// OmniFocus: the CSV from File → Export → CSV (or CSV UTF-16) on a Mac, or
// Database Settings → Export to CSV on iPhone and iPad (OpenSpec change
// migration-everywhere, design D2). One row per visible project and action;
// the Task ID is the item's place in the outline ("3", "3.2", "3.2.1"), not a
// stable id. OmniFocus 2 writes Context, OmniFocus 3 and 4 also Tags, and 4.7
// inserts Planned Date. Dates are UTC ("2026-11-03 17:00:00 +0000"). Folders,
// repeat rules and attachments are not in the file. Verified against an
// OmniFocus 2 export and the OmniFocus 3 and 4.7 layouts.

const omnifocusFormat = "omnifocus-csv"

type omnifocusProfile struct{}

func (omnifocusProfile) Name() string { return omnifocusFormat }
func (omnifocusProfile) Description() string {
	return "OmniFocus: the CSV from File → Export"
}

// omnifocusText decodes a UTF-16 export (the "CSV UTF-16" choice) and drops a
// UTF-8 BOM.
func omnifocusText(data []byte) []byte {
	var big bool
	switch {
	case bytes.HasPrefix(data, []byte{0xFF, 0xFE}):
	case bytes.HasPrefix(data, []byte{0xFE, 0xFF}):
		big = true
	default:
		return trimBOM(data)
	}
	data = data[2:]
	units := make([]uint16, 0, len(data)/2)
	for i := 0; i+1 < len(data); i += 2 {
		if big {
			units = append(units, uint16(data[i])<<8|uint16(data[i+1]))
		} else {
			units = append(units, uint16(data[i+1])<<8|uint16(data[i]))
		}
	}
	return []byte(string(utf16.Decode(units)))
}

// Detect accepts a header starting Task ID, Type, Name, Status, Project that
// also has Context or Tags.
func (omnifocusProfile) Detect(data []byte) bool {
	if len(data) > 64<<10 {
		data = data[:64<<10] // the header is all Detect reads
	}
	h := csvHeader(omnifocusText(data))
	if len(h) < 6 || h[0] != "Task ID" || h[1] != "Type" || h[2] != "Name" || h[3] != "Status" || h[4] != "Project" {
		return false
	}
	for _, c := range h[5:] {
		if c == "Context" || c == "Tags" {
			return true
		}
	}
	return false
}

type ofRecord struct {
	line int
	get  func(string) string
}

func (omnifocusProfile) Read(rd io.Reader, opts Options) (*Parsed, error) {
	data, err := io.ReadAll(rd)
	if err != nil {
		return nil, err
	}
	r := csv.NewReader(bytes.NewReader(omnifocusText(data)))
	r.FieldsPerRecord = -1
	r.LazyQuotes = true
	header, err := r.Read()
	if err != nil {
		return nil, &FileError{fmt.Sprintf("cannot read the CSV header: %v", err)}
	}
	col := map[string]int{}
	for i, h := range header {
		col[strings.TrimSpace(h)] = i
	}
	out := &Parsed{Notes: []string{"OmniFocus's CSV has no repeat rules, folders or attachments; repeating actions arrive without their repeat"}}
	var recs []ofRecord
	for {
		rec, err := r.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			var pe *csv.ParseError
			if errors.As(err, &pe) {
				out.Rows = append(out.Rows, Row{Line: pe.StartLine, Kind: KindTask, Err: fmt.Sprintf("unreadable CSV record: %v", pe.Err)})
				continue
			}
			return nil, &FileError{fmt.Sprintf("cannot read the CSV file: %v", err)}
		}
		if allBlank(rec) {
			continue
		}
		line, _ := r.FieldPos(0)
		recs = append(recs, ofRecord{line: line, get: func(c string) string {
			if i, ok := col[c]; ok && i < len(rec) {
				return strings.TrimSpace(rec[i])
			}
			return ""
		}})
		if len(recs) > MaxRows {
			return nil, ErrTooManyRows
		}
	}
	of := &ofReader{loc: opts.Location(), out: out, kind: map[string]string{}, source: map[string]string{}}
	of.sources(recs)
	for _, rc := range recs {
		of.row(rc)
	}
	return out, nil
}

type ofReader struct {
	loc *time.Location
	out *Parsed
	// kind and source are each Task ID's row type and source id.
	kind, source map[string]string
}

// ofParent is the Task ID of an item's parent in the outline ("" at the top).
func ofParent(id string) string {
	if i := strings.LastIndex(id, "."); i > 0 {
		return id[:i]
	}
	return ""
}

// sources gives each row a source id that survives a new export: the Task ID
// is a position, so the id is a digest of the item's path of names (its
// project and parent actions), numbered when two items share one.
func (of *ofReader) sources(recs []ofRecord) {
	names := map[string]string{}
	for _, rc := range recs {
		names[rc.get("Task ID")] = rc.get("Name")
	}
	seen := map[string]int{}
	for _, rc := range recs {
		id := rc.get("Task ID")
		var path []string
		for cur := id; cur != ""; cur = ofParent(cur) {
			path = append([]string{names[cur]}, path...)
		}
		key := strings.ToLower(rc.get("Type")) + "\x00" + strings.Join(path, "\x00")
		seen[key]++
		if seen[key] > 1 {
			key += fmt.Sprintf("\x00%d", seen[key])
		}
		sum := sha256.Sum256([]byte(key))
		of.source[id] = "omnifocus:" + hex.EncodeToString(sum[:8])
		of.kind[id] = strings.ToLower(rc.get("Type"))
	}
}

func (of *ofReader) row(rc ofRecord) {
	id := rc.get("Task ID")
	typ := strings.ToLower(rc.get("Type"))
	status := strings.ToLower(rc.get("Status"))
	if typ == "project" {
		row := Row{Line: rc.line, Kind: KindProject, SourceID: of.source[id], Title: rc.get("Name"), Description: rc.get("Notes")}
		if row.Title == "" {
			row.fail("project name is required")
		}
		switch status {
		case "done", "completed", "dropped":
			row.Archived = true
			row.warn("%s project imported as an archived project", status)
		case "inactive", "on hold":
			row.warn("project on hold in OmniFocus; imported as an active project")
		}
		of.out.Rows = append(of.out.Rows, row)
		return
	}
	row := Row{Line: rc.line, Kind: KindTask, SourceID: of.source[id], Title: rc.get("Name"), Description: rc.get("Notes")}
	row.Origin = importedOrigin("omnifocus", row.SourceID)
	if row.Title == "" {
		row.fail("title is required")
	}
	if typ != "action" && typ != "inbox" && typ != "" {
		row.warn("row type %q imported as an action", rc.get("Type"))
	}
	// The parent in the outline: a project holds the task, an action is its parent.
	for p := ofParent(id); p != ""; p = ofParent(p) {
		if of.kind[p] == "project" {
			row.ProjectSourceID = of.source[p]
			break
		}
		if of.kind[p] != "" && row.ParentSourceID == "" {
			row.ParentSourceID = of.source[p]
		}
	}
	if row.ProjectSourceID == "" && row.ParentSourceID == "" && rc.get("Project") != "" && typ != "inbox" {
		row.warn("its project %q is not in the file; imported without a project", rc.get("Project"))
	}
	labels := splitList(rc.get("Tags"))
	if ctx := rc.get("Context"); ctx != "" {
		labels = append(labels, ctx)
	}
	row.Labels = dedupeNames(labels)
	of.dates(&row, rc)
	if d := rc.get("Duration"); d != "" {
		if m, ok := timetrack.ParseDuration(d); ok && m > 0 {
			row.EstimateMinutes = m
		} else {
			row.warn("duration %q not understood; imported without an estimate", d)
		}
	}
	if truthy(rc.get("Flagged")) {
		row.Priority = 1
	}
	if status == "dropped" {
		row.Completed = true
		row.warn("dropped in OmniFocus; imported as completed")
	}
	of.out.Rows = append(of.out.Rows, row)
}

// dates reads the UTC times into the import's time zone: the due date keeps
// its time, the start (defer) date is a day. With a Planned Date (OmniFocus
// 4.7) the planned day is when the task is due and the due date its deadline.
func (of *ofReader) dates(row *Row, rc ofRecord) {
	read := func(column string) (time.Time, bool) {
		v := rc.get(column)
		if v == "" {
			return time.Time{}, false
		}
		for _, layout := range []string{"2006-01-02 15:04:05 -0700", "2006-01-02 15:04:05", "2006-01-02"} {
			if t, err := time.Parse(layout, v); err == nil {
				return t.In(of.loc), true
			}
		}
		row.warn("%s %q not understood; imported without it", strings.ToLower(column), v)
		return time.Time{}, false
	}
	due := func(t time.Time) *Due {
		d := &Due{Date: t.Format("2006-01-02"), Time: t.Format("15:04")}
		if d.Time == "00:00" {
			d.Time = "" // a day without a time
		}
		return d
	}
	if t, ok := read("Due Date"); ok {
		row.Due = due(t)
	}
	if t, ok := read("Planned Date"); ok {
		if row.Due != nil {
			row.Deadline = row.Due.Date
		}
		row.Due = due(t)
	}
	if t, ok := read("Start Date"); ok {
		row.Start = t.Format("2006-01-02")
	}
	if t, ok := read("Completion Date"); ok {
		row.Completed = true
		row.CompletedAt = t.UnixMilli()
	}
}
