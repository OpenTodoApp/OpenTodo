package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	"github.com/OpenTodoApp/opentodo/internal/e2ee/crypt"
	"github.com/OpenTodoApp/opentodo/internal/notesearch"
)

// Notes in the CLI (OpenSpec change notes-overview, design D12, D13): `ot
// notes` lists, searches, shows and writes the three sources of notes (task
// notes, project notes and standalone notes) through the REST routes, and `ot
// task note` reads and writes one task's note. Text is Markdown: what a note
// shows is its description followed by its pending appends; a replacement
// carries the body version it read (If-Match), an append never replaces
// anything. Search runs here, over what the API returned (internal/notesearch).
// On an end-to-end encrypted account the text is decrypted and sealed on this
// machine with the key `ot encryption unlock` stored, as `ot vault` does.

// untitledNote is what a standalone note without a title reads as.
const untitledNote = "Untitled note"

// encryptedText stands for a value this machine cannot decrypt.
const encryptedText = "(encrypted)"

func cmdNotes(a *App, ctx context.Context, g *globalFlags, args []string) error {
	if len(args) == 0 || strings.HasPrefix(args[0], "-") {
		return notesList(a, ctx, g, args, "notes list")
	}
	sub, rest := args[0], args[1:]
	switch sub {
	case "list", "ls":
		return notesList(a, ctx, g, rest, "notes list")
	case "search":
		return notesList(a, ctx, g, rest, "notes search")
	case "show":
		return notesShow(a, ctx, g, rest)
	case "add", "create":
		return notesAdd(a, ctx, g, rest)
	case "edit":
		return notesEdit(a, ctx, g, rest)
	case "append":
		return notesAppend(a, ctx, g, rest)
	case "rm", "delete":
		return notesRm(a, ctx, g, rest)
	case "to-task":
		return notesToTask(a, ctx, g, rest)
	}
	return usageErr("unknown notes command %q (expected list, search, show, add, edit, append, rm or to-task)", sub)
}

// cmdTask is the `task` group; `note` is its first command (the top-level
// task commands stay as they are).
func cmdTask(a *App, ctx context.Context, g *globalFlags, args []string) error {
	if len(args) == 0 {
		return usageErr("usage: ot task note <ref> [--set <text> | --file <path|-> | --append <text> | --clear]")
	}
	switch args[0] {
	case "note":
		return taskNote(a, ctx, g, args[1:])
	case "-h", "-help", "--help":
		a.printCommandUsage("task")
		return nil
	}
	return usageErr("unknown task command %q (expected note)", args[0])
}

// ---- text helpers ----

type pendingAppend struct {
	ID   string `json:"id"`
	Text string `json:"text"`
}

// plainText is what plain-text readers show of a note (internal/sync
// PlainText, which the CLI does not link): the description, then each
// pending append, a blank line between.
func plainText(description string, appends []pendingAppend) string {
	parts := make([]string, 0, len(appends)+1)
	if strings.TrimSpace(description) != "" {
		parts = append(parts, strings.TrimRight(description, "\n"))
	}
	for _, ap := range appends {
		parts = append(parts, strings.TrimRight(ap.Text, "\n"))
	}
	return strings.Join(parts, "\n\n")
}

// versionTS is the clock of a body version ("<ts>:<device>", or "0").
func versionTS(v string) int64 {
	ts, _ := strconv.ParseInt(strings.SplitN(v, ":", 2)[0], 10, 64)
	return ts
}

// dashMark protects command-line words that start with a dash but are text
// ("- decided: ship Friday", "---"), which the flag package would read as an
// unknown flag. undash removes it again from positionals and flag values.
const dashMark = "\x00"

func protectDashText(args []string) []string {
	out := make([]string, len(args))
	for i, arg := range args {
		out[i] = arg
		if len(arg) < 2 || arg[0] != '-' || arg == "--" {
			continue
		}
		name := strings.TrimPrefix(strings.TrimPrefix(arg, "-"), "-")
		name, _, _ = strings.Cut(name, "=")
		if name == "" || name[0] == '-' || strings.ContainsAny(name, " \t\r\n") {
			out[i] = dashMark + arg
		}
	}
	return out
}

func undash(s string) string { return strings.TrimPrefix(s, dashMark) }

func undashAll(list []string) []string {
	for i := range list {
		list[i] = undash(list[i])
	}
	return list
}

// readBody returns the text of --body/--set (inline) or --body-file/--file
// (a path, - for standard input); has is false when neither was given.
func (a *App) readBody(inline, file string, inlineSet, fileSet bool, names string) (string, bool, error) {
	switch {
	case inlineSet && fileSet:
		return "", false, usageErr("give only one of %s", names)
	case inlineSet:
		return undash(inline), true, nil
	case !fileSet:
		return "", false, nil
	}
	file = undash(file)
	var raw []byte
	var err error
	if file == "-" {
		raw, err = io.ReadAll(a.in)
	} else {
		raw, err = os.ReadFile(file)
	}
	if err != nil {
		return "", false, usageErr("cannot read %s: %v", file, err)
	}
	return string(raw), true, nil
}

// ---- the session: client and key ----

// noteSession is the client of a notes command and, for an encrypted account,
// the key (nil while the profile is locked or its key is stale).
type noteSession struct {
	c         *client
	encrypted bool
	state     string
	key       []byte
	labelList []label
}

func (a *App) notesConnect(ctx context.Context, g *globalFlags) (*noteSession, error) {
	c, t, err := a.connect(g)
	if err != nil {
		return nil, err
	}
	state, _, key, _, err := a.keyState(ctx, c, t.Profile)
	if err != nil {
		return nil, err
	}
	s := &noteSession{c: c, state: state, encrypted: state != "not_encrypted"}
	if state == "unlocked" {
		s.key = key
	}
	return s, nil
}

// requireKey refuses a text write on an encrypted account without a usable
// key, before anything is sent (exit 5 encryption_enabled).
func (s *noteSession) requireKey() error {
	if !s.encrypted || s.key != nil {
		return nil
	}
	msg := "this account uses end-to-end encryption and the account key is not on this machine; run `ot encryption unlock`, then run the command again. Nothing was sent."
	if s.state == "stale" {
		msg = "this account uses end-to-end encryption and the stored account key is out of date (the passphrase or key changed); run `ot encryption unlock` again. Nothing was sent."
	}
	return &exitError{code: ExitNotPermitted, jsonCode: "encryption_enabled", msg: msg}
}

// open returns the plaintext of a stored value; ok is false for ciphertext
// this machine cannot decrypt.
func (s *noteSession) open(entity, id, field, v string) (string, bool) {
	if !e2ee.IsCiphertext(v) {
		return v, true
	}
	if s.key == nil {
		return "", false
	}
	pt, err := crypt.Open(s.key, entity, id, field, v)
	return pt, err == nil
}

// seal encrypts a content value for an encrypted account; plaintext otherwise.
func (s *noteSession) seal(entity, id, field, pt string) (string, error) {
	if !s.encrypted {
		return pt, nil
	}
	if err := s.requireKey(); err != nil {
		return "", err
	}
	return crypt.Seal(s.key, entity, id, field, pt)
}

// projects returns the projects with their names decrypted where possible.
func (s *noteSession) projects(ctx context.Context) ([]project, error) {
	list, err := s.c.projects(ctx)
	if err != nil {
		return nil, err
	}
	for i := range list {
		if pt, ok := s.open("project", list[i].ID, "name", list[i].Name); ok {
			list[i].Name = pt
		} else {
			list[i].Name = encryptedText
		}
	}
	return list, nil
}

// labels returns the labels with their names decrypted where possible.
func (s *noteSession) labels(ctx context.Context) ([]label, error) {
	if s.labelList != nil {
		return s.labelList, nil
	}
	list, err := s.c.labels(ctx)
	if err != nil {
		return nil, err
	}
	for i := range list {
		if pt, ok := s.open("label", list[i].ID, "name", list[i].Name); ok {
			list[i].Name = pt
		}
	}
	s.labelList = list
	return list, nil
}

// findLabel matches a label id, or a name ignoring case.
func findLabel(list []label, ref string) (string, bool) {
	for _, l := range list {
		if l.ID == ref {
			return l.ID, true
		}
	}
	for _, l := range list {
		if strings.EqualFold(strings.TrimSpace(l.Name), strings.TrimSpace(ref)) {
			return l.ID, true
		}
	}
	return "", false
}

// resolveLabels turns --label values into ids. On a plaintext account a name
// that matches nothing creates the label, as for tasks; on an encrypted one
// the CLI creates none (a name would reach the server readable): use the app.
func (s *noteSession) resolveLabels(ctx context.Context, refs []string) ([]string, error) {
	if !s.encrypted {
		return s.c.resolveLabels(ctx, refs)
	}
	list, err := s.labels(ctx)
	if err != nil {
		return nil, err
	}
	out := []string{}
	for _, ref := range refs {
		id, ok := findLabel(list, ref)
		if !ok {
			return nil, usageErr("no label %q; on an end-to-end encrypted account create labels in the app", ref)
		}
		out = append(out, id)
	}
	return out, nil
}

// ---- rows: one note of any source ----

// noteRow is a note as the CLI shows it, decrypted where possible.
type noteRow struct {
	kind, id    string
	title       string
	titleLocked bool
	description string
	appends     []pendingAppend
	projectID   string
	labels      []string
	bodyVersion string
	updated     int64
	encrypted   bool // some text could not be decrypted
	searchText  string
	completed   bool
	archived    bool
	notesDoc    json.RawMessage
	raw         json.RawMessage
}

func (r *noteRow) text() string { return plainText(r.description, r.appends) }

func (r *noteRow) shownTitle() string {
	switch {
	case r.titleLocked:
		return encryptedText
	case strings.TrimSpace(r.title) == "" && r.kind == "note":
		return untitledNote
	}
	return r.title
}

// noteBody is the part of a task, project or note read that holds its text.
type noteBody struct {
	ID          string          `json:"id"`
	Title       string          `json:"title"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	ProjectID   *string         `json:"project_id"`
	Labels      []string        `json:"labels"`
	CreatedAt   float64         `json:"created_at"`
	CompletedAt *float64        `json:"completed_at"`
	DeletedAt   *float64        `json:"deleted_at"`
	Archived    bool            `json:"archived"`
	BodyVersion string          `json:"body_version"`
	Appends     []pendingAppend `json:"appends"`
	NotesDoc    json.RawMessage `json:"notes_doc"`
}

// rowOf builds the row of one read of kind note, task or project, decrypting
// its title, description and pending appends. "Updated" is the body
// version's clock (the greatest clock of description, notes_doc and the
// appends) and, for a body never written, the creation time: the REST reads
// carry no per-field clocks, so a standalone note's title or label change
// does not move it (as in list_notes).
func (s *noteSession) rowOf(kind string, raw json.RawMessage) (noteRow, error) {
	var b noteBody
	if err := json.Unmarshal(raw, &b); err != nil {
		return noteRow{}, serverErr("unexpected %s shape: %v", kind, err)
	}
	r := noteRow{kind: kind, id: b.ID, bodyVersion: b.BodyVersion, labels: b.Labels, completed: b.CompletedAt != nil,
		archived: b.Archived, notesDoc: b.NotesDoc, raw: raw}
	if r.bodyVersion == "" {
		r.bodyVersion = "0"
	}
	if r.labels == nil {
		r.labels = []string{}
	}
	titleField, title := "title", b.Title
	if kind == "project" {
		titleField, title = "name", b.Name
		r.projectID, r.labels = b.ID, []string{}
	} else if b.ProjectID != nil {
		r.projectID = *b.ProjectID
	}
	var ok bool
	if r.title, ok = s.open(kind, b.ID, titleField, title); !ok {
		r.titleLocked, r.encrypted = true, true
	}
	descOK := true
	if r.description, descOK = s.open(kind, b.ID, "description", b.Description); !descOK {
		r.description, r.encrypted = encryptedText, true
	}
	r.appends = []pendingAppend{}
	var readable []pendingAppend // what search matches: no placeholders
	for _, ap := range b.Appends {
		text, ok := s.open(kind, b.ID, "appends."+ap.ID, ap.Text)
		if !ok {
			text, r.encrypted = encryptedText, true
		} else {
			readable = append(readable, pendingAppend{ID: ap.ID, Text: text})
		}
		r.appends = append(r.appends, pendingAppend{ID: ap.ID, Text: text})
	}
	if descOK {
		r.searchText = plainText(r.description, readable)
	} else {
		r.searchText = plainText("", readable)
	}
	if r.updated = versionTS(r.bodyVersion); r.updated == 0 {
		r.updated = int64(b.CreatedAt)
	}
	return r, nil
}

// standaloneNotes reads the live standalone notes.
func (s *noteSession) standaloneNotes(ctx context.Context) ([]noteRow, error) {
	var out struct {
		Notes []json.RawMessage `json:"notes"`
	}
	if err := s.c.getJSON(ctx, "/notes", &out); err != nil {
		return nil, err
	}
	rows := make([]noteRow, 0, len(out.Notes))
	for _, raw := range out.Notes {
		var d struct {
			DeletedAt *float64 `json:"deleted_at"`
		}
		if json.Unmarshal(raw, &d) == nil && d.DeletedAt != nil {
			continue
		}
		r, err := s.rowOf("note", raw)
		if err != nil {
			return nil, err
		}
		rows = append(rows, r)
	}
	return rows, nil
}

// loadNotes reads the sources src names (note, task, project or all) and
// returns their rows (newest first) with the projects.
func (s *noteSession) loadNotes(ctx context.Context, src string) ([]noteRow, []project, error) {
	projects, err := s.projects(ctx)
	if err != nil {
		return nil, nil, err
	}
	live := map[string]bool{}
	for _, p := range projects {
		if p.DeletedAt == nil {
			live[p.ID] = true
		}
	}
	var rows []noteRow
	if src == "all" || src == "note" {
		if rows, err = s.standaloneNotes(ctx); err != nil {
			return nil, nil, err
		}
	}
	if src == "all" || src == "task" {
		tasks, err := s.c.tasks(ctx)
		if err != nil {
			return nil, nil, err
		}
		for _, t := range tasks {
			if t.DeletedAt != nil || (t.ProjectID != nil && !live[*t.ProjectID]) {
				continue
			}
			r, err := s.rowOf("task", t.Raw)
			if err != nil {
				return nil, nil, err
			}
			if strings.TrimSpace(r.text()) != "" {
				rows = append(rows, r)
			}
		}
	}
	if src == "all" || src == "project" {
		for _, p := range projects {
			if p.DeletedAt != nil {
				continue
			}
			r, err := s.rowOf("project", p.Raw)
			if err != nil {
				return nil, nil, err
			}
			r.title, r.titleLocked = p.Name, p.Name == encryptedText
			if strings.TrimSpace(r.text()) != "" {
				rows = append(rows, r)
			}
		}
	}
	sort.SliceStable(rows, func(i, j int) bool {
		if rows[i].updated != rows[j].updated {
			return rows[i].updated > rows[j].updated
		}
		return rows[i].id < rows[j].id
	})
	return rows, projects, nil
}

// resolveNote matches a full id, a unique id prefix, a title (ignoring case)
// or a unique title prefix among rows.
func resolveNote(rows []noteRow, ref string) (*noteRow, error) {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return nil, usageErr("empty note reference")
	}
	pick := func(match func(r *noteRow) bool) []*noteRow {
		var out []*noteRow
		for i := range rows {
			if match(&rows[i]) {
				out = append(out, &rows[i])
			}
		}
		return out
	}
	lower := strings.ToLower(ref)
	for _, match := range []func(r *noteRow) bool{
		func(r *noteRow) bool { return r.id == ref },
		func(r *noteRow) bool { return strings.HasPrefix(r.id, ref) },
		func(r *noteRow) bool { return !r.titleLocked && strings.ToLower(strings.TrimSpace(r.title)) == lower },
		func(r *noteRow) bool { return !r.titleLocked && strings.HasPrefix(strings.ToLower(r.title), lower) },
	} {
		found := pick(match)
		switch len(found) {
		case 0:
			continue
		case 1:
			return found[0], nil
		}
		lines := make([]string, 0, len(found))
		for _, m := range found {
			lines = append(lines, fmt.Sprintf("  %s  %s  %s", m.kind, m.id, m.shownTitle()))
		}
		return nil, usageErr("%q is ambiguous; it matches %d notes:\n%s\nUse a longer prefix or the full id.", ref, len(found), strings.Join(lines, "\n"))
	}
	return nil, usageErr("no note matches %q (see `ot notes list`)", ref)
}

// ---- output shapes (schemas note, note_text) ----

type noteSummary struct {
	Kind        string               `json:"kind"`
	ID          string               `json:"id"`
	Title       string               `json:"title"`
	ProjectID   *string              `json:"project_id"`
	Project     *string              `json:"project"`
	LabelIDs    []string             `json:"label_ids"`
	UpdatedAt   int64                `json:"updated_at"`
	BodyVersion string               `json:"body_version"`
	Encrypted   bool                 `json:"encrypted"`
	Completed   bool                 `json:"completed,omitempty"`
	Archived    bool                 `json:"archived,omitempty"`
	Snippet     []notesearch.Segment `json:"snippet,omitempty"`
}

func (r *noteRow) summary(projectName map[string]string) noteSummary {
	o := noteSummary{Kind: r.kind, ID: r.id, Title: r.shownTitle(), LabelIDs: r.labels, UpdatedAt: r.updated,
		BodyVersion: r.bodyVersion, Encrypted: r.encrypted, Completed: r.kind == "task" && r.completed, Archived: r.kind == "project" && r.archived}
	if r.projectID != "" {
		pid := r.projectID
		o.ProjectID = &pid
		if name, ok := projectName[pid]; ok {
			o.Project = &name
		}
	}
	return o
}

type noteTextOut struct {
	Kind        string          `json:"kind"`
	ID          string          `json:"id"`
	Title       string          `json:"title"`
	Text        string          `json:"text"`
	Appends     []pendingAppend `json:"appends"`
	BodyVersion string          `json:"body_version"`
	ProjectID   *string         `json:"project_id"`
	LabelIDs    []string        `json:"label_ids"`
	Encrypted   bool            `json:"encrypted"`
}

func (r *noteRow) textOut() noteTextOut {
	o := noteTextOut{Kind: r.kind, ID: r.id, Title: r.shownTitle(), Text: r.text(), Appends: r.appends,
		BodyVersion: r.bodyVersion, LabelIDs: r.labels, Encrypted: r.encrypted}
	if r.projectID != "" {
		pid := r.projectID
		o.ProjectID = &pid
	}
	return o
}

// printNoteText prints a note's Markdown (show, task note).
func (a *App) printNoteText(g *globalFlags, r *noteRow) error {
	if g.json {
		return a.printJSON(r.textOut())
	}
	if r.encrypted && r.text() == encryptedText {
		fmt.Fprintln(a.Stdout, "This note is encrypted. Run `ot encryption unlock` to read it on this machine.")
		return nil
	}
	if text := r.text(); text != "" {
		fmt.Fprintln(a.Stdout, text)
	}
	return nil
}

func kindLabel(r *noteRow) string {
	switch {
	case r.kind == "task" && r.completed:
		return "task (done)"
	case r.kind == "project" && r.archived:
		return "project (archived)"
	}
	return r.kind
}

// ---- list and search ----

type notesListFlags struct {
	source, project, label, search string
	standalone                     bool
	limit                          int
}

func notesList(a *App, ctx context.Context, g *globalFlags, args []string, name string) error {
	fs := a.flagSet(name, g)
	var f notesListFlags
	fs.StringVar(&f.source, "source", "all", "note, task, project or all")
	fs.BoolVar(&f.standalone, "standalone", false, "only standalone notes")
	fs.StringVar(&f.project, "project", "", "project name or id")
	fs.StringVar(&f.label, "label", "", "label name or id")
	if name == "notes list" {
		fs.StringVar(&f.search, "search", "", "words to look for")
	}
	fs.IntVar(&f.limit, "limit", 0, "print at most n notes")
	pos, err := a.parse(g, fs, name, protectDashText(args))
	if err != nil {
		return a.helpOr("notes", err)
	}
	pos = undashAll(pos)
	if name == "notes search" {
		if f.search = strings.TrimSpace(strings.Join(pos, " ")); f.search == "" {
			return usageErr("usage: ot notes search <text> [--source note|task|project|all] [--project <ref>] [--label <ref>] [--limit <n>]")
		}
	} else if len(pos) > 0 {
		return usageErr("usage: ot notes list [--source note|task|project|all] [--standalone] [--project <ref>] [--label <ref>] [--search <text>] [--limit <n>]")
	}
	switch f.source {
	case "all", "note", "task", "project":
	default:
		return usageErr("--source must be note, task, project or all")
	}
	if f.standalone {
		if f.source != "all" && f.source != "note" {
			return usageErr("--standalone lists standalone notes; it does not combine with --source %s", f.source)
		}
		f.source = "note"
	}
	if f.limit < 0 {
		return usageErr("--limit must be at least 1")
	}
	s, err := a.notesConnect(ctx, g)
	if err != nil {
		return err
	}
	rows, projects, err := s.loadNotes(ctx, f.source)
	if err != nil {
		return err
	}
	if rows, err = s.filterNotes(ctx, rows, projects, f); err != nil {
		return err
	}
	return a.printNotes(g, rows, projects, f)
}

// filterNotes keeps the rows of --project and --label.
func (s *noteSession) filterNotes(ctx context.Context, rows []noteRow, projects []project, f notesListFlags) ([]noteRow, error) {
	pid, lid := "", ""
	if f.project != "" {
		p, err := findProject(projects, f.project)
		if err != nil {
			return nil, err
		}
		pid = p.ID
	}
	if f.label != "" {
		list, err := s.labels(ctx)
		if err != nil {
			return nil, err
		}
		id, ok := findLabel(list, f.label)
		if !ok {
			return nil, usageErr("no label %q", f.label)
		}
		lid = id
	}
	out := rows[:0]
	for _, r := range rows {
		if pid != "" && r.projectID != pid {
			continue
		}
		if lid != "" && !containsString(r.labels, lid) {
			continue
		}
		out = append(out, r)
	}
	return out, nil
}

func containsString(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

// printNotes ranks the rows for a search, applies --limit and prints them.
func (a *App) printNotes(g *globalFlags, rows []noteRow, projects []project, f notesListFlags) error {
	names := map[string]string{}
	for _, p := range projects {
		names[p.ID] = p.Name
	}
	var snippets [][]notesearch.Segment
	if f.search != "" {
		byKey := map[string]noteRow{}
		notes := make([]notesearch.Note, 0, len(rows))
		for _, r := range rows {
			k := r.kind + ":" + r.id
			byKey[k] = r
			title, text := r.title, r.searchText
			if r.titleLocked {
				title = ""
			}
			notes = append(notes, notesearch.Note{Key: k, Title: title, Text: text, Updated: r.updated})
		}
		terms := notesearch.ParseQuery(f.search)
		ranked := make([]noteRow, 0)
		for _, h := range notesearch.Rank(notes, f.search) {
			r := byKey[h.Note.Key]
			ranked = append(ranked, r)
			snippets = append(snippets, notesearch.Snippet(r.searchText, terms, notesearch.DefaultSnippet))
		}
		rows = ranked
	}
	if f.limit > 0 && len(rows) > f.limit {
		rows = rows[:f.limit]
	}
	if g.json {
		out := make([]noteSummary, 0, len(rows))
		for i := range rows {
			o := rows[i].summary(names)
			if snippets != nil {
				o.Snippet = snippets[i]
			}
			out = append(out, o)
		}
		return a.printJSON(out)
	}
	if len(rows) == 0 {
		fmt.Fprintln(a.Stdout, "No notes.")
		return nil
	}
	header := []string{"KIND", "ID", "TITLE", "PROJECT", "UPDATED"}
	if snippets != nil {
		header = append(header, "MATCH")
	}
	tbl := newTable(header...)
	color := a.color()
	for i := range rows {
		r := &rows[i]
		project := ""
		if r.kind != "project" {
			project = names[r.projectID]
		}
		cells := []cell{{text: kindLabel(r), style: styleDim}, {text: shortID(r.id), style: styleCyan}, plain(r.shownTitle()), plain(project),
			plain(time.UnixMilli(r.updated).Local().Format("2006-01-02 15:04"))}
		if snippets != nil {
			cells = append(cells, plain(snippetText(snippets[i], color)))
		}
		tbl.add(cells...)
	}
	tbl.render(a.Stdout, color)
	return nil
}

// snippetText is a snippet on one line, matches bold when colour is on.
func snippetText(segs []notesearch.Segment, color bool) string {
	var b strings.Builder
	for _, s := range segs {
		t := strings.Join(strings.Fields(s.Text), " ")
		if strings.HasPrefix(s.Text, " ") || strings.HasPrefix(s.Text, "\n") {
			t = " " + t
		}
		if strings.HasSuffix(s.Text, " ") || strings.HasSuffix(s.Text, "\n") {
			t += " "
		}
		if s.Mark && color {
			t = styleBold + t + reset
		}
		b.WriteString(t)
	}
	return strings.TrimSpace(b.String())
}

// ---- show ----

func notesShow(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("notes show", g)
	pos, err := a.parse(g, fs, "notes show", args)
	if err != nil {
		return a.helpOr("notes", err)
	}
	if len(pos) == 0 {
		return usageErr("usage: ot notes show <ref>")
	}
	s, err := a.notesConnect(ctx, g)
	if err != nil {
		return err
	}
	rows, _, err := s.loadNotes(ctx, "all")
	if err != nil {
		return err
	}
	r, err := resolveNote(rows, strings.Join(pos, " "))
	if err != nil {
		return err
	}
	return a.printNoteText(g, r)
}
