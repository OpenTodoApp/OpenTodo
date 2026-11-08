package importer

import (
	"errors"
	"fmt"
	"io"
	"net/url"
	"path"
	"regexp"
	"strings"
	"time"
	"unicode"
)

// Notion: the "Markdown & CSV" export ZIP (OpenSpec change
// migration-everywhere, design D2 and D3). Each database is a CSV named
// "<name> <32 hex id>.csv", newer exports add "<name> <id>_all.csv" with every
// row and property; each row's page is a Markdown file
// "<title> <id>.md" in a folder named after the database. Columns are the
// database's own properties, so the preview proposes a column for each role
// and the user can change it (Options.Columns). A bare CSV is never detected
// as Notion's, but the format can be chosen for it.

const notionFormat = "notion-csv"

// Column roles of a Notion database (design D3).
const (
	RoleStatus   = "status"
	RoleDue      = "due"
	RoleLabels   = "labels"
	RolePriority = "priority"
	RoleProject  = "project"
	RoleNotes    = "notes"
)

// NotionRoles lists the roles in the order the preview shows them.
var NotionRoles = []string{RoleStatus, RoleDue, RoleLabels, RolePriority, RoleProject, RoleNotes}

// notionGuesses are the column names each role is guessed from, in the six
// app languages, most specific first.
var notionGuesses = map[string][]string{
	RoleStatus: {"status", "done", "completed", "complete", "state", "erledigt", "fait", "terminé", "statut", "fatto", "completato",
		"stato", "hecho", "completado", "estado", "feito", "concluído"},
	RoleDue: {"due", "due date", "deadline", "fällig", "fälligkeit", "fällig am", "échéance", "date limite", "scadenza", "vencimiento",
		"fecha límite", "prazo", "data de vencimento", "date", "datum", "data", "fecha"},
	RoleLabels:   {"tags", "labels", "tag", "label", "etiketten", "schlagwörter", "étiquettes", "etichette", "etiquetas"},
	RolePriority: {"priority", "priorität", "priorité", "priorità", "prioridad", "prioridade"},
	RoleProject: {"project", "projects", "projekt", "projekte", "projet", "projets", "progetto", "progetti", "proyecto", "proyectos",
		"projeto", "projetos"},
	RoleNotes: {"notes", "description", "note", "notizen", "beschreibung", "remarques", "descrizione", "notas", "descripción",
		"descrição", "notizie"},
}

// notionStructure are columns the import reads for the hierarchy itself.
var notionStructure = map[string]bool{"parent item": true, "sub-item": true, "sub-items": true}

var (
	notionCSVName = regexp.MustCompile(`^(.*) ([0-9a-f]{32})(_all)?\.csv$`)
	notionPageID  = regexp.MustCompile(`([0-9a-f]{32})(?:\.[a-z]+)?$`)
	notionMDName  = regexp.MustCompile(`^(.*) ([0-9a-f]{32})\.md$`)
	notionRelLink = regexp.MustCompile(`^(.*?) \(([^()]*(?:\([^()]*\)[^()]*)*)\)$`)
)

type notionProfile struct{}

func (notionProfile) Name() string { return notionFormat }
func (notionProfile) Description() string {
	return "Notion: the Markdown & CSV export ZIP of a task database"
}

// Detect never claims a bare CSV: a Notion export is recognised as a ZIP by
// its file names (isNotionArchive).
func (notionProfile) Detect([]byte) bool { return false }

// isNotionArchive reports whether an archive holds Notion database CSVs.
func isNotionArchive(entries []archiveEntry) bool {
	for _, e := range entries {
		if notionCSVName.MatchString(path.Base(e.name)) {
			return true
		}
	}
	return false
}

// notionDB is one database of the export.
type notionDB struct {
	name, id, dir string
	data          []byte
}

// notionDatabases picks one CSV per database id, _all.csv over the view's.
func notionDatabases(entries []archiveEntry) []notionDB {
	byID := map[string]int{}
	var out []notionDB
	for _, e := range entries {
		m := notionCSVName.FindStringSubmatch(path.Base(e.name))
		if m == nil {
			continue
		}
		db := notionDB{name: strings.TrimSpace(m[1]), id: m[2], dir: path.Dir(e.name), data: e.data}
		if i, ok := byID[db.id]; ok {
			if m[3] != "" {
				out[i] = db
			}
			continue
		}
		byID[db.id] = len(out)
		out = append(out, db)
	}
	return out
}

// parseNotionArchive reads every database of a Notion export with the row
// pages beside them.
func parseNotionArchive(entries []archiveEntry, opts Options) (*Parsed, error) {
	if opts.Format != "" && opts.Format != notionFormat {
		return nil, &FileError{fmt.Sprintf("format %s does not match the archive (a Notion export)", opts.Format)}
	}
	pages := map[string]archiveEntry{}
	for _, e := range entries {
		if strings.HasSuffix(e.name, ".md") {
			pages[e.name] = e
		}
	}
	nr := &notionReader{opts: opts, loc: opts.Location(), out: &Parsed{}}
	dbs := notionDatabases(entries)
	if err := nr.checkColumns(dbs); err != nil {
		return nil, err
	}
	for _, db := range dbs {
		if err := nr.database(db, pages); err != nil {
			return nil, fmt.Errorf("%s: %w", db.name, err)
		}
		if len(nr.out.Rows) > MaxRows {
			return nil, ErrTooManyRows
		}
	}
	nr.finish()
	nr.out.Format = notionFormat
	return nr.out, nil
}

func (notionProfile) Read(r io.Reader, opts Options) (*Parsed, error) {
	data, err := io.ReadAll(r)
	if err != nil {
		return nil, err
	}
	name := strings.TrimSuffix(path.Base(firstNonEmpty(opts.entryName, opts.fileName)), path.Ext(firstNonEmpty(opts.entryName, opts.fileName)))
	id := ""
	if m := regexp.MustCompile(`^(.*) ([0-9a-f]{32})(_all)?$`).FindStringSubmatch(name); m != nil {
		name, id = m[1], m[2]
	}
	if strings.TrimSpace(name) == "" {
		name = "Notion"
	}
	nr := &notionReader{opts: opts, loc: opts.Location(), out: &Parsed{}}
	db := notionDB{name: name, id: id, data: data}
	if err := nr.checkColumns([]notionDB{db}); err != nil {
		return nil, err
	}
	if err := nr.database(db, nil); err != nil {
		return nil, err
	}
	nr.finish()
	return nr.out, nil
}

type notionReader struct {
	opts Options
	loc  *time.Location
	out  *Parsed
	line int
	// roles is the mapping in use, the first database's guesses where the
	// user chose nothing; available lists every column of the file.
	roles     map[string]*string
	available []string
	dropped   []string
	// dayFirst is set while a database whose due column writes dates day
	// first (16/12/2026) is read.
	dayFirst bool
}

// notionCSV reads a database CSV into its header and records.
func notionCSV(data []byte) ([]string, [][]string, error) {
	r := newCSVReader(trimBOM(data))
	r.FieldsPerRecord = -1
	r.LazyQuotes = true
	var recs [][]string
	header, err := r.Read()
	if err != nil {
		return nil, nil, csvFailure(err, "header")
	}
	for i := range header {
		header[i] = strings.TrimSpace(header[i])
	}
	for {
		rec, err := r.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, nil, csvFailure(err, "file")
		}
		if !allBlank(rec) {
			recs = append(recs, rec)
		}
		if len(recs) > MaxRows {
			return nil, nil, ErrTooManyRows
		}
	}
	return header, recs, nil
}

// checkColumns settles the roles: the user's choices, checked against the
// file's columns, and guesses for the rest.
func (nr *notionReader) checkColumns(dbs []notionDB) error {
	have := map[string]bool{}
	var first []string
	var firstRecs [][]string
	for i, db := range dbs {
		header, recs, err := notionCSV(db.data)
		if err != nil {
			return err
		}
		if i == 0 {
			first, firstRecs = header, recs
		}
		for j, h := range header {
			if j > 0 && !have[h] && !notionStructure[strings.ToLower(h)] {
				have[h] = true
				nr.available = append(nr.available, h)
			}
		}
	}
	for _, role := range NotionRoles {
		if col := nr.opts.Columns[role]; col != nil && !have[*col] {
			return &OptionError{fmt.Sprintf("columns: the file has no column %q (its columns: %s)", *col, strings.Join(nr.available, ", "))}
		}
	}
	guessed := notionGuess(first, firstRecs)
	nr.roles = map[string]*string{}
	for _, role := range NotionRoles {
		if col, chosen := nr.opts.Columns[role]; chosen {
			nr.roles[role] = col
		} else {
			nr.roles[role] = guessed[role]
		}
	}
	return nil
}

// notionKey is a column name reduced for guessing: lower case, without emoji
// and punctuation around it.
func notionKey(s string) string {
	return strings.ToLower(strings.TrimFunc(s, func(r rune) bool { return !unicode.IsLetter(r) && !unicode.IsDigit(r) }))
}

// notionGuess proposes a column per role: by name first, then by values (a
// Yes/No column is a status, a column of dates the due date).
func notionGuess(header []string, recs [][]string) map[string]*string {
	out := map[string]*string{}
	used := map[int]bool{0: true}
	for i, h := range header {
		if notionStructure[strings.ToLower(h)] {
			used[i] = true
		}
	}
	for _, role := range NotionRoles {
		for _, name := range notionGuesses[role] {
			for i, h := range header {
				if !used[i] && notionKey(h) == name {
					col := h
					out[role], used[i] = &col, true
					break
				}
			}
			if out[role] != nil {
				break
			}
		}
	}
	values := func(i int) []string {
		var vs []string
		for _, r := range recs {
			if i < len(r) && strings.TrimSpace(r[i]) != "" {
				vs = append(vs, strings.TrimSpace(r[i]))
			}
		}
		return vs
	}
	for i, h := range header {
		if used[i] {
			continue
		}
		vs := values(i)
		if len(vs) == 0 {
			continue
		}
		key := notionKey(h)
		if out[RoleStatus] == nil && allValues(vs, func(v string) bool { return v == "Yes" || v == "No" }) {
			col := h
			out[RoleStatus], used[i] = &col, true
			continue
		}
		if out[RoleDue] == nil && !strings.Contains(key, "created") && !strings.Contains(key, "edited") && !strings.Contains(key, "updated") &&
			allValues(vs, func(v string) bool { _, _, ok := notionDate(v, notionDayFirst(v)); return ok }) {
			col := h
			out[RoleDue], used[i] = &col, true
		}
	}
	return out
}

func allValues(vs []string, ok func(string) bool) bool {
	for _, v := range vs {
		if !ok(v) {
			return false
		}
	}
	return true
}

// database reads one database: a project named after it, one task per row.
func (nr *notionReader) database(db notionDB, pages map[string]archiveEntry) error {
	header, recs, err := notionCSV(db.data)
	if err != nil {
		return err
	}
	if len(header) == 0 || header[0] == "" {
		return &FileError{"the CSV has no title column"}
	}
	col := map[string]int{}
	for i, h := range header {
		if _, ok := col[h]; !ok {
			col[h] = i
		}
	}
	mapped := map[string]bool{}
	for _, c := range nr.roles {
		if c != nil {
			mapped[*c] = true
		}
	}
	for i, h := range header {
		if i > 0 && !mapped[h] && !notionStructure[strings.ToLower(h)] && !containsFold(nr.dropped, h) {
			nr.dropped = append(nr.dropped, h)
		}
	}
	nr.line++
	project := "notion:db:" + firstNonEmpty(db.id, db.name)
	nr.out.Rows = append(nr.out.Rows, Row{Line: nr.line, Kind: KindProject, SourceID: project, Title: db.name})
	nr.dayFirst = false
	if c := nr.roles[RoleDue]; c != nil {
		if i, ok := col[*c]; ok {
			for _, rec := range recs {
				if i < len(rec) && notionDayFirst(rec[i]) {
					nr.dayFirst = true
				}
			}
		}
	}
	byTitle := notionPagesByTitle(db, pages)
	type pending struct {
		row    Row
		parent string
	}
	var rows []pending
	titleSource := map[string]string{}
	for li, rec := range recs {
		get := func(c string) string {
			if i, ok := col[c]; ok && i < len(rec) {
				return strings.TrimSpace(rec[i])
			}
			return ""
		}
		title := strings.TrimSpace(rec[0])
		row := Row{Line: li + 2, Kind: KindTask, Title: title, ProjectSourceID: project, File: db.name}
		page, ok := byTitle[title]
		if ok && page.id != "" {
			row.SourceID = "notion:" + page.id
			row.Origin = importedOrigin("notion", row.SourceID)
			row.Description = page.body(header)
		} else {
			row.SourceID = fmt.Sprintf("notion:%s:line:%d", firstNonEmpty(db.id, db.name), li+2)
		}
		if _, dup := titleSource[title]; !dup {
			titleSource[title] = row.SourceID
		}
		if title == "" {
			row.fail("the title column is empty")
		}
		nr.roles2row(&row, get)
		rows = append(rows, pending{row: row, parent: get("Parent item")})
	}
	for _, p := range rows {
		row := p.row
		if p.parent != "" {
			row.ParentSourceID = notionRelation(p.parent, titleSource)
			if row.ParentSourceID == "" {
				row.warn("parent item %q is not in this database; imported as a top-level task", notionRelName(p.parent))
			}
		}
		nr.line++
		row.Line = nr.line
		nr.out.Rows = append(nr.out.Rows, row)
	}
	return nil
}

// roles2row applies the mapped columns to a row.
func (nr *notionReader) roles2row(row *Row, get func(string) string) {
	val := func(role string) string {
		if c := nr.roles[role]; c != nil {
			return get(*c)
		}
		return ""
	}
	if v := val(RoleStatus); v != "" && notionDone(v) {
		row.Completed = true
	}
	if v := val(RoleDue); v != "" {
		start, due, ok := notionDate(v, nr.dayFirst)
		if !ok {
			row.warn("date %q not understood; imported without it", v)
		} else {
			row.Due = due
			if start != nil {
				row.Start = start.Date
			}
		}
	}
	if v := val(RoleLabels); v != "" {
		for _, l := range strings.Split(v, ",") {
			if l = strings.TrimSpace(l); l != "" {
				row.Labels = append(row.Labels, notionRelName(l))
			}
		}
		row.Labels = dedupeNames(row.Labels)
	}
	if v := val(RolePriority); v != "" {
		if p := notionPriority(v); p > 0 {
			row.Priority = p
		} else {
			row.warn("priority %q not understood; imported without it", v)
		}
	}
	if v := val(RoleProject); v != "" {
		names := strings.Split(v, ", ")
		row.ProjectName, row.ProjectSourceID = notionRelName(names[0]), ""
		if len(names) > 1 {
			row.warn("in several projects; imported into %q", row.ProjectName)
		}
	}
	if v := val(RoleNotes); v != "" {
		row.Description = strings.TrimSpace(v + "\n\n" + row.Description)
	}
}

// finish adds the file-level notes and the preview's column mapping.
func (nr *notionReader) finish() {
	if len(nr.dropped) > 0 {
		nr.out.Notes = append(nr.out.Notes, "columns not imported: "+strings.Join(nr.dropped, ", "))
	}
	nr.out.Roles = nr.roles
	nr.out.Available = nr.available
	var mapped []string
	for _, role := range NotionRoles {
		if c := nr.roles[role]; c != nil {
			mapped = append(mapped, *c)
		}
	}
	nr.out.Recognised, nr.out.Ignored = mapped, nr.dropped
}

// notionRelName is the name of a relation value "Name (link)".
func notionRelName(v string) string {
	if m := notionRelLink.FindStringSubmatch(strings.TrimSpace(v)); m != nil {
		return strings.TrimSpace(m[1])
	}
	return strings.TrimSpace(v)
}

// notionRelation resolves a relation value to a row's source id: by the page
// id at the end of its link, else by its name.
func notionRelation(v string, byTitle map[string]string) string {
	first := strings.TrimSpace(v)
	if m := notionRelLink.FindStringSubmatch(first); m != nil {
		link, _ := url.PathUnescape(m[2])
		if id := notionPageID.FindStringSubmatch(strings.SplitN(link, "?", 2)[0]); id != nil {
			for _, src := range byTitle {
				if src == "notion:"+id[1] {
					return src
				}
			}
		}
		return byTitle[strings.TrimSpace(m[1])]
	}
	return byTitle[first]
}

// notionPage is a row's Markdown page.
type notionPage struct {
	id, text string
}

// body is the page without its title heading and property lines: the
// description of the task.
func (p notionPage) body(header []string) string {
	lines := strings.Split(strings.ReplaceAll(p.text, "\r\n", "\n"), "\n")
	i := 0
	if i < len(lines) && strings.HasPrefix(lines[i], "# ") {
		i++
	}
	for i < len(lines) && strings.TrimSpace(lines[i]) == "" {
		i++
	}
	props := map[string]bool{}
	for _, h := range header {
		props[h] = true
	}
	j := i
	for j < len(lines) {
		name, _, ok := strings.Cut(lines[j], ": ")
		if !ok || !props[name] {
			break
		}
		j++
	}
	return strings.TrimSpace(strings.Join(lines[j:], "\n"))
}

// notionPagesByTitle finds the row pages of a database: Markdown files in the
// folder named after it (with or without its id), keyed by their title. A
// title that two pages share matches neither.
func notionPagesByTitle(db notionDB, pages map[string]archiveEntry) map[string]notionPage {
	out := map[string]notionPage{}
	shared := map[string]bool{}
	for name, e := range pages {
		dir := path.Dir(name)
		if dir != path.Join(db.dir, db.name) && dir != path.Join(db.dir, db.name+" "+db.id) {
			continue
		}
		m := notionMDName.FindStringSubmatch(path.Base(name))
		if m == nil {
			continue
		}
		text := string(e.data)
		title := m[1]
		if first, _, _ := strings.Cut(text, "\n"); strings.HasPrefix(first, "# ") {
			title = strings.TrimSpace(strings.TrimPrefix(first, "# "))
		}
		if _, dup := out[title]; dup {
			shared[title] = true
		}
		out[title] = notionPage{id: m[2], text: text}
	}
	for t := range shared {
		delete(out, t)
	}
	return out
}

// notionDoneValues are status values that mean completed (lower case).
var notionDoneValues = map[string]bool{"done": true, "complete": true, "completed": true, "yes": true, "archived": true, "closed": true,
	"erledigt": true, "fertig": true, "abgeschlossen": true, "fait": true, "terminé": true, "terminée": true, "fatto": true,
	"completato": true, "hecho": true, "completado": true, "terminado": true, "feito": true, "concluído": true, "concluido": true}

func notionDone(v string) bool { return notionDoneValues[notionKey(v)] }

// notionPriority reads High/Urgent/P1 as 1, Medium/P2 as 2, Low/P3 as 3.
func notionPriority(v string) int {
	k := notionKey(v)
	switch {
	case k == "p0" || k == "p1" || containsAny(k, "urgent", "high", "critical", "hoch", "dringend", "haute", "élevée", "alta", "alto", "crític"):
		return 1
	case k == "p2" || containsAny(k, "medium", "normal", "mittel", "moyenne", "media", "medio", "média", "médio"):
		return 2
	case k == "p3" || k == "p4" || containsAny(k, "low", "niedrig", "basse", "bassa", "baja", "bajo", "baixa", "baixo"):
		return 3
	}
	return 0
}

func containsAny(s string, subs ...string) bool {
	for _, x := range subs {
		if strings.Contains(s, x) {
			return true
		}
	}
	return false
}

var notionZone = regexp.MustCompile(`\s*\([A-Za-z0-9+:\-/ ]+\)$`)

// notionDate reads a Notion date: "October 29, 2026", "October 29, 2026
// 3:00 PM", "10/29/2026", "29/10/2026", "2026-10-29", with an optional
// "(PST)" zone (ignored: the time is kept as written), and ranges "A → B",
// which give a start (A) and a due date (B).
func notionDate(v string, dayFirst bool) (start, due *Due, ok bool) {
	v = strings.TrimSpace(v)
	if a, b, found := strings.Cut(v, " → "); found {
		s, okA := notionDay(a, dayFirst)
		d, okB := notionDay(b, dayFirst)
		if !okA || !okB {
			return nil, nil, false
		}
		if s.Date == d.Date {
			return nil, d, true
		}
		return s, d, true
	}
	d, ok := notionDay(v, dayFirst)
	return nil, d, ok
}

var notionLayouts = []struct {
	layout string
	clock  bool
}{
	{"January 2, 2006 3:04 PM", true}, {"January 2, 2006 15:04", true}, {"January 2, 2006", false},
	{"Jan 2, 2006 3:04 PM", true}, {"Jan 2, 2006", false},
	{"2006-01-02 15:04", true}, {"2006-01-02", false},
	{"01/02/2006 3:04 PM", true}, {"01/02/2006", false},
	{"2006/01/02 3:04 PM", true}, {"2006/01/02", false},
}

func notionDay(s string, dayFirst bool) (*Due, bool) {
	s = strings.TrimSpace(notionZone.ReplaceAllString(strings.TrimSpace(s), ""))
	for _, l := range notionLayouts {
		if dayFirst && strings.HasPrefix(l.layout, "01/02") {
			continue
		}
		if t, err := time.Parse(l.layout, s); err == nil {
			d := &Due{Date: t.Format("2006-01-02")}
			if l.clock {
				d.Time = t.Format("15:04")
			}
			return d, true
		}
	}
	// Day/Month/Year: a database whose dates are written day first.
	for _, l := range []struct {
		layout string
		clock  bool
	}{{"02/01/2006 15:04", true}, {"02/01/2006", false}} {
		if t, err := time.Parse(l.layout, s); err == nil {
			d := &Due{Date: t.Format("2006-01-02")}
			if l.clock {
				d.Time = t.Format("15:04")
			}
			return d, true
		}
	}
	return nil, false
}

var notionSlashDate = regexp.MustCompile(`^(\d{1,2})/(\d{1,2})/\d{4}`)

// notionDayFirst reports a date written day first: its first number cannot
// be a month (Notion's Day/Month/Year date format).
func notionDayFirst(v string) bool {
	m := notionSlashDate.FindStringSubmatch(strings.TrimSpace(v))
	return m != nil && len(m[1]) > 0 && (len(m[1]) == 2 && m[1] > "12")
}
