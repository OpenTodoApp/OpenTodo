package importer

import (
	"bytes"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"

	"github.com/pixari/opentodo/internal/origin"
)

// Linear's workspace CSV export (OpenSpec change named-importers): one row per
// issue. Workflow statuses become sections, so the imported project's board shows
// the same columns; completion comes from the Completed and Canceled timestamps
// because the CSV carries status names, not their type.

const linearFormat = "linear-csv"

type linearProfile struct{}

func (linearProfile) Name() string        { return linearFormat }
func (linearProfile) Description() string { return "Linear: the workspace CSV export" }

func (linearProfile) Detect(data []byte) bool {
	h := csvHeader(data)
	have := map[string]bool{}
	for _, c := range h {
		have[c] = true
	}
	for _, c := range []string{"ID", "Team", "Title", "Status", "Priority", "UUID"} {
		if !have[c] {
			return false
		}
	}
	return true
}

var linearPriority = map[string]int{"urgent": 1, "high": 2, "medium": 3, "low": 4, "no priority": 4, "": 0}

// linearDropped are columns that carry data the importer cannot hold.
var linearDropped = []struct{ col, what string }{
	{"Cycle Number", "cycle"}, {"Project Milestone", "milestone"},
	{"Initiatives", "initiatives"}, {"SLA Status", "SLA"}, {"Related to", "relations"},
	{"Duplicate of", "duplicate link"},
}

func (linearProfile) Read(rd io.Reader, opts Options) (*Parsed, error) {
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
	for i, h := range header {
		col[strings.TrimSpace(h)] = i
	}
	out := &Parsed{}
	loc := opts.Location()
	projects := map[string]bool{}
	me := strings.ToLower(strings.TrimSpace(opts.importerEmail))
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
		get := func(c string) string {
			if i, ok := col[c]; ok && i < len(rec) {
				return strings.TrimSpace(rec[i])
			}
			return ""
		}
		projSource, projName := "", get("Project")
		if projName != "" {
			id := get("Project ID")
			if id == "" {
				id = projName
			}
			projSource = "linear:project:" + id
		} else if team := get("Team"); team != "" {
			projSource, projName = "linear:team:"+team, team
		}
		if projSource != "" && !projects[projSource] {
			projects[projSource] = true
			out.Rows = append(out.Rows, Row{Line: line, Kind: KindProject, SourceID: projSource, Title: projName})
			out.ViewHints = append(out.ViewHints, ViewHint{ProjectSourceID: projSource, View: "board"})
		}
		ident := get("ID")
		row := Row{Line: line, Kind: KindTask, SourceID: "linear:" + ident, ProjectSourceID: projSource, SectionName: get("Status")}
		if ident == "" {
			row.SourceID = fmt.Sprintf("linear:line:%d", line)
		} else if o := (origin.Origin{Kind: origin.KindIssue, Provider: "linear", ID: ident}); o.Validate() == nil {
			// The identifier is the task's origin (task-origin); the export has no URL.
			row.Origin = &o
		}
		row.Title = get("Title")
		if row.Title == "" {
			row.fail("title is required")
		}
		row.Description = ident
		if d := get("Description"); d != "" {
			row.Description = strings.TrimSpace(ident + "\n\n" + d)
		}
		if p, ok := linearPriority[strings.ToLower(get("Priority"))]; ok {
			row.Priority = p
		} else {
			row.warn("priority %q not recognised; imported as p4", get("Priority"))
		}
		row.Labels = splitList(get("Labels"))
		if d := get("Due Date"); d != "" {
			due, err := parseDue(d, loc)
			if err != nil {
				row.warn("due date %q not understood; imported without a due date", d)
			} else {
				row.Due = due
			}
		}
		if p := get("Parent issue"); p != "" {
			if f := strings.Fields(p); len(f) > 0 {
				row.ParentSourceID = "linear:" + f[0]
			}
		}
		// "Blocked by" lists issue identifiers (task-dependencies D10); the final
		// relations pass resolves the ones in this file.
		for _, ref := range strings.FieldsFunc(get("Blocked by"), func(r rune) bool { return r == ',' || r == ';' || r == ' ' }) {
			if ref = strings.TrimSpace(ref); ref != "" {
				row.BlockedBySourceIDs = append(row.BlockedBySourceIDs, "linear:"+ref)
			}
		}
		if ts := get("Completed"); ts != "" {
			row.Completed = true
			if at, err := parseTimestamp(ts, loc); err == nil {
				row.CompletedAt = at
			}
		}
		if ts := get("Canceled"); ts != "" {
			row.Completed = true
			row.Labels = append(row.Labels, "canceled")
			if at, err := parseTimestamp(ts, loc); err == nil && row.CompletedAt == 0 {
				row.CompletedAt = at
			}
		}
		if at, err := parseTimestamp(get("Created"), loc); err == nil {
			row.CreatedAt = at
		}
		if a := strings.ToLower(get("Assignee")); a != "" {
			if me != "" && a == me {
				row.AssignSelf = true
			} else {
				row.warn("assignee dropped (only your own account can be assigned by an import)")
			}
		}
		// The estimate (points) becomes a number field "Estimate" on the issue's
		// project (more-importers D4).
		if e := get("Estimate"); e != "" {
			if n, err := strconv.ParseFloat(e, 64); err == nil {
				row.Fields = append(row.Fields, FieldValue{Name: "Estimate", Type: FieldNumber, Value: n})
			} else {
				row.warn("estimate %q not understood; dropped", e)
			}
		}
		for _, d := range linearDropped {
			if get(d.col) != "" {
				row.warn("%s dropped (not supported)", d.what)
			}
		}
		out.Rows = append(out.Rows, row)
		if len(out.Rows) > MaxRows {
			return nil, ErrTooManyRows
		}
	}
	return out, nil
}
