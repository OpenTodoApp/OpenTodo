package timetrack

import (
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/e2ee"
)

// Header is the fixed part of the CSV header; custom field columns follow.
var Header = []string{"date", "start", "end", "minutes", "task", "project", "labels", "note"}

// BOM starts the file so spreadsheets read it as UTF-8.
const BOM = "\ufeff"

// Task is the part of a task the CSV reads. Fields maps a custom field
// definition id to its value (string, float64 or bool).
type Task struct {
	ID        string         `json:"id"`
	Title     string         `json:"title"`
	ProjectID string         `json:"project_id"`
	Labels    []string       `json:"labels"`
	Fields    map[string]any `json:"fields"`
	DeletedAt *int64         `json:"deleted_at"`
}

// Project is a project's id, name and deletion state.
type Project struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	DeletedAt *int64 `json:"deleted_at"`
}

// Label is a label's id and name.
type Label struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// Field is a custom field definition.
type Field struct {
	ID        string  `json:"id"`
	ProjectID string  `json:"project_id"`
	Name      string  `json:"name"`
	Position  float64 `json:"position"`
	DeletedAt *int64  `json:"deleted_at"`
}

// CSVInput is everything one export reads. From and To are inclusive logical
// days ("" for open).
type CSVInput struct {
	Entries  []Entry
	Tasks    []Task
	Projects []Project
	Labels   []Label
	Fields   []Field
	Loc      *time.Location
	DayStart int
	Now      int64
	From, To string
}

// Encrypted is what the CSV and the MCP tool show for a ciphertext text
// (design D8): the server holds no key, and a device shows it for a value it
// could not decrypt.
const Encrypted = "[encrypted]"

// Display is s, or Encrypted when s is a ciphertext envelope.
func Display(s string) string {
	if e2ee.IsCiphertext(s) {
		return Encrypted
	}
	return s
}

// Rows selects the entries of the export: live entries of live tasks (not in
// a trashed project) that started on a logical day in [From, To], oldest first.
func Rows(in CSVInput) []Entry {
	tasks := map[string]Task{}
	for _, t := range in.Tasks {
		tasks[t.ID] = t
	}
	trashed := map[string]bool{}
	for _, p := range in.Projects {
		if p.DeletedAt != nil {
			trashed[p.ID] = true
		}
	}
	var out []Entry
	for _, e := range in.Entries {
		t, ok := tasks[e.TaskID]
		if !e.Live() || !ok || t.DeletedAt != nil || trashed[t.ProjectID] {
			continue
		}
		day := DayOf(e.StartedAt, in.Loc, in.DayStart)
		if (in.From != "" && day < in.From) || (in.To != "" && day > in.To) {
			continue
		}
		out = append(out, e)
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].StartedAt != out[j].StartedAt {
			return out[i].StartedAt < out[j].StartedAt
		}
		return out[i].ID < out[j].ID
	})
	return out
}

// CSV writes the export (design D8): a BOM, the header, then one row per
// entry from Rows. Custom field columns are the union of the live fields of
// every project present, by name, in the order their projects first appear
// and the project's field order. Lines end with CRLF (RFC 4180).
func CSV(in CSVInput) string {
	display := Display
	rows := Rows(in)
	tasks := map[string]Task{}
	for _, t := range in.Tasks {
		tasks[t.ID] = t
	}
	projects := map[string]string{}
	for _, p := range in.Projects {
		projects[p.ID] = p.Name
	}
	labels := map[string]string{}
	for _, l := range in.Labels {
		labels[l.ID] = l.Name
	}
	byProject := map[string][]Field{}
	for _, f := range in.Fields {
		if f.DeletedAt == nil {
			byProject[f.ProjectID] = append(byProject[f.ProjectID], f)
		}
	}
	for _, fs := range byProject {
		sort.SliceStable(fs, func(i, j int) bool {
			if fs[i].Position != fs[j].Position {
				return fs[i].Position < fs[j].Position
			}
			return fs[i].ID < fs[j].ID
		})
	}
	var columns []string
	seenCol := map[string]bool{}
	seenProject := map[string]bool{}
	for _, e := range rows {
		pid := tasks[e.TaskID].ProjectID
		if seenProject[pid] {
			continue
		}
		seenProject[pid] = true
		for _, f := range byProject[pid] {
			name := display(f.Name)
			if !seenCol[name] {
				seenCol[name] = true
				columns = append(columns, name)
			}
		}
	}
	var b strings.Builder
	b.WriteString(BOM)
	writeLine(&b, append(append([]string{}, Header...), columns...))
	for _, e := range rows {
		t := tasks[e.TaskID]
		end := ""
		if e.EndedAt != nil {
			end = ClockOf(*e.EndedAt, in.Loc)
		}
		var names []string
		for _, id := range t.Labels {
			if n, ok := labels[id]; ok {
				names = append(names, display(n))
			}
		}
		cells := []string{
			DayOf(e.StartedAt, in.Loc, in.DayStart), ClockOf(e.StartedAt, in.Loc), end,
			strconv.Itoa(MinutesOf(e, in.Now)), display(t.Title), display(projects[t.ProjectID]),
			strings.Join(names, ";"), display(e.Note),
		}
		values := map[string]string{}
		for _, f := range byProject[t.ProjectID] {
			if v, ok := t.Fields[f.ID]; ok {
				values[display(f.Name)] = fieldText(v, display)
			}
		}
		for _, c := range columns {
			cells = append(cells, values[c])
		}
		writeLine(&b, cells)
	}
	return b.String()
}

// ClockOf is the wall time HH:MM of an instant in loc.
func ClockOf(ms int64, loc *time.Location) string {
	if loc == nil {
		loc = time.UTC
	}
	return time.UnixMilli(ms).In(loc).Format("15:04")
}

// fieldText is a custom field value as a cell: text as is, a number in its
// shortest form, a checkbox as true or false.
func fieldText(v any, display func(string) string) string {
	switch x := v.(type) {
	case string:
		return display(x)
	case float64:
		return strconv.FormatFloat(x, 'f', -1, 64)
	case bool:
		return strconv.FormatBool(x)
	}
	return ""
}

func writeLine(b *strings.Builder, cells []string) {
	for i, c := range cells {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteString(Cell(c))
	}
	b.WriteString("\r\n")
}

// Cell quotes one cell (RFC 4180) and defuses spreadsheet formulas: a text
// starting with = + - @ or a tab gets a leading apostrophe, so a title another
// member wrote never runs as a formula in the reader's spreadsheet.
// (A signed number such as -5 stays as it is.)
func Cell(s string) string {
	if s != "" && strings.ContainsRune("=+-@\t\r", rune(s[0])) && !signedNumber.MatchString(s) {
		s = "'" + s
	}
	if strings.ContainsAny(s, ",\"\r\n") {
		return `"` + strings.ReplaceAll(s, `"`, `""`) + `"`
	}
	return s
}

var signedNumber = regexp.MustCompile(`^[+-][0-9]+(\.[0-9]+)?$`)
