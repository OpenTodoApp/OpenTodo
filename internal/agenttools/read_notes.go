package agenttools

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	"github.com/OpenTodoApp/opentodo/internal/notesearch"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Note read tools (OpenSpec change notes-overview, design D12): list_notes,
// search_notes and get_note over the three sources of notes, a task's note, a
// project's note and a standalone note. Text is what plain-text readers show
// (sync.PlainText: the Markdown projection, then the pending appends), always
// inside untrusted_text. Nothing is stored: the search runs in this call's
// memory over the rows it read.
//
// "Updated" is the note's body clock (the greatest clock among description,
// notes_doc and the appends, as body_version) and, for a note whose body was
// never written, its creation time. A standalone note's title, label or
// project change does not move it: the materialised reads carry no per-field
// clocks, and the body clock is one query for every note.

// NoteListDefault is the default number of notes list_notes returns.
const NoteListDefault = 50

// UntitledNote is the title a standalone note without one reads as.
const UntitledNote = "Untitled note"

var (
	noteSourceProp = map[string]any{"type": "string", "enum": []string{"all", "note", "task", "project"}, "default": "all",
		"description": "Which notes: note (standalone notes), task (task notes), project (project notes) or all (default)."}
	noteProjectProp = map[string]any{"type": "string", "description": "Only notes of this project (see list_projects): its standalone notes, its tasks' notes and its own note."}
	noteLabelProp   = map[string]any{"type": "string", "description": "Only notes carrying this label (id, or name case-insensitive); project notes carry none."}
	noteLimitProp   = map[string]any{"type": "integer", "minimum": 1, "maximum": MaxItems, "description": "Maximum number of notes to return (default 50, maximum 200)."}
	noteKindProp    = map[string]any{"type": "string", "enum": []string{"note", "task", "project"}, "default": "note",
		"description": "What id names: a standalone note (default), a task (its note) or a project (its note)."}
)

func init() {
	register(tool{
		def: readDef("list_notes", "List notes",
			"List notes, newest change first: standalone notes, task notes (a task with a description; completed tasks are marked) and project notes (archived projects are marked). Each has a short preview; get_note returns the whole text. Deleted notes are left out. Paged: pass next_cursor back as cursor.",
			object(nil, map[string]any{
				"source":     noteSourceProp,
				"project_id": noteProjectProp,
				"label_id":   noteLabelProp,
				"limit":      noteLimitProp,
				"cursor":     cursorProp,
			})),
		read: (*Registry).listNotes,
	})
	register(tool{
		def: readDef("search_notes", "Search notes",
			"Find notes whose title and text contain every word of the query (case and accents ignored; quote a phrase to match it as one), title matches first, then the most matched words, then the newest. Each result has a snippet around the first match, with the matched words marked. Not available on an end-to-end encrypted account.",
			object([]string{"query"}, map[string]any{
				"query":      map[string]any{"type": "string", "minLength": 1, "maxLength": 500, "description": "Words to look for."},
				"source":     noteSourceProp,
				"project_id": noteProjectProp,
				"label_id":   noteLabelProp,
				"limit":      noteLimitProp,
				"cursor":     cursorProp,
			})),
		readC: (*Registry).searchNotes,
	})
	register(tool{
		def: readDef("get_note", "Get a note",
			"Get one note: its title, its Markdown text, the text appended to it that no device has merged yet (oldest first), project, labels, body_version (pass it to update_note as base_version) and when it last changed.",
			object([]string{"id"}, map[string]any{
				"id":   map[string]any{"type": "string", "description": "Note id (or the task or project id with kind)."},
				"kind": noteKindProp,
			})),
		read: (*Registry).getNote,
	})
}

// noteRow is one note of any source, read once per call.
type noteRow struct {
	kind, id  string
	title     string // as shown: placeholder for ciphertext, marker when relayed
	text      string // sync.PlainText as shown
	plainT    string // title for matching ("" when ciphertext)
	plainX    string // text for matching ("" when ciphertext)
	projectID string
	labels    []string
	updated   int64
	encrypted bool
	completed bool
	archived  bool
}

// noteText is a note's user-written content in a list or search result.
type noteText struct {
	Title   string               `json:"title"`
	Preview *string              `json:"preview,omitempty"`
	Snippet []notesearch.Segment `json:"snippet,omitempty"`
}

type noteOut struct {
	Kind      string   `json:"kind"`
	ID        string   `json:"id"`
	Untrusted noteText `json:"untrusted_text"`
	ProjectID *string  `json:"project_id"`
	LabelIDs  []string `json:"label_ids"`
	UpdatedAt *string  `json:"updated_at"`
	// Encrypted marks a note whose text is end-to-end encrypted: the server
	// shows the placeholder instead.
	Encrypted bool `json:"encrypted"`
	Completed bool `json:"completed,omitempty"`
	Archived  bool `json:"archived,omitempty"`
}

type noteQuery struct {
	source, projectID, label string
	limit                    int
	cursor                   string
}

func parseNoteQuery(a args) (noteQuery, error) {
	var q noteQuery
	var err error
	if q.source, err = a.str("source"); err != nil {
		return q, err
	}
	switch q.source {
	case "":
		q.source = "all"
	case "all", "note", "task", "project":
	default:
		return q, argErr("source: must be all, note, task or project")
	}
	if q.projectID, err = a.str("project_id"); err != nil {
		return q, err
	}
	if q.label, err = a.str("label_id"); err != nil {
		return q, err
	}
	n, ok, err := a.integer("limit")
	if err != nil {
		return q, err
	}
	q.limit = NoteListDefault
	if ok {
		if n < 1 {
			return q, argErr("limit: must be at least 1")
		}
		q.limit = min(n, MaxItems)
	}
	q.cursor, err = a.str("cursor")
	return q, err
}

// versionTS reads the clock of a body version ("ts:device", "0").
func versionTS(v string) int64 {
	ts, _ := strconv.ParseInt(strings.SplitN(v, ":", 2)[0], 10, 64)
	return ts
}

func labelList(e opsync.Entity) []string {
	var out []string
	_ = json.Unmarshal(e["labels"], &out)
	if out == nil {
		out = []string{}
	}
	return out
}

// shownAppends returns the pending appends as a reader sees them: the
// placeholder for ciphertext, or a relay marker on a relayed read.
func (r *Registry) shownAppends(entity, id string, list []opsync.PendingAppend) ([]opsync.PendingAppend, bool) {
	out := make([]opsync.PendingAppend, 0, len(list))
	enc := false
	for _, a := range list {
		text := a.Text
		if e2ee.IsCiphertext(text) {
			if r.mark != nil {
				text = r.mark.mark(entity, id, opsync.AppendPrefix+a.ID, text)
			} else {
				enc = true
				text = e2ee.Placeholder
			}
		}
		out = append(out, opsync.PendingAppend{ID: a.ID, Text: text})
	}
	return out, enc
}

// plainAppends is the appends' text for matching: ciphertext left out.
func plainAppends(list []opsync.PendingAppend) []opsync.PendingAppend {
	out := []opsync.PendingAppend{}
	for _, a := range list {
		if !e2ee.IsCiphertext(a.Text) {
			out = append(out, a)
		}
	}
	return out
}

// noteRowOf builds the row of one entity with its body info.
func (r *Registry) noteRowOf(kind, id, titleField string, e opsync.Entity, info opsync.BodyInfo) noteRow {
	apps, encApps := r.shownAppends(kind, id, info.Appends)
	row := noteRow{kind: kind, id: id, title: str(e, titleField), text: opsync.PlainText(str(e, "description"), apps),
		plainT: plainOrEmpty(e, titleField), plainX: opsync.PlainText(plainOrEmpty(e, "description"), plainAppends(info.Appends)),
		updated:   versionTS(info.Version),
		encrypted: encApps || e2ee.IsCiphertext(rawStr(e, titleField)) || e2ee.IsCiphertext(rawStr(e, "description"))}
	if row.updated == 0 {
		row.updated = int64(num(e, "created_at"))
	}
	if kind == "note" && rawStr(e, "title") == "" {
		row.title, row.plainT = UntitledNote, ""
	}
	return row
}

// liveNotes returns the user's live standalone notes outside projects kept
// away from assistants or deleted (snap.projects holds the visible ones).
func (r *Registry) liveNotes(ctx context.Context, userID string, snap *snapshot) ([]opsync.Entity, error) {
	list, err := r.list(ctx, userID, "note", false)
	if err != nil {
		return nil, err
	}
	out := list[:0]
	for _, n := range list {
		if pid := rawStr(n, "project_id"); pid != "" {
			if _, ok := snap.projects[pid]; !ok {
				continue
			}
		}
		out = append(out, n)
	}
	return out, nil
}

// collectNotes reads every note of the query's source and filters.
func (r *Registry) collectNotes(ctx context.Context, userID string, q noteQuery) ([]noteRow, error) {
	snap, err := r.load(ctx, userID)
	if err != nil {
		return nil, err
	}
	var labels map[string]bool
	if q.label != "" {
		labels = snap.labelIDs(q.label)
	}
	keep := func(pid string, ls []string) bool {
		if q.projectID != "" && pid != q.projectID {
			return false
		}
		return labels == nil || hasAny(ls, labels)
	}
	var rows []noteRow
	infos := func(entity string) (map[string]opsync.BodyInfo, error) {
		return r.sync.BodyInfos(ctx, userID, entity, "")
	}
	if q.source == "all" || q.source == "note" {
		notes, err := r.liveNotes(ctx, userID, snap)
		if err != nil {
			return nil, err
		}
		bi, err := infos("note")
		if err != nil {
			return nil, err
		}
		for _, n := range notes {
			id := rawStr(n, "id")
			row := r.noteRowOf("note", id, "title", n, bi[id])
			row.projectID, row.labels = rawStr(n, "project_id"), labelList(n)
			if keep(row.projectID, row.labels) {
				rows = append(rows, row)
			}
		}
	}
	if q.source == "all" || q.source == "task" {
		bi, err := infos("task")
		if err != nil {
			return nil, err
		}
		for _, t := range snap.tasks {
			id := rawStr(t, "id")
			if !snap.visible(t, true) || (rawStr(t, "description") == "" && len(bi[id].Appends) == 0) {
				continue
			}
			row := r.noteRowOf("task", id, "title", t, bi[id])
			row.projectID, row.labels, row.completed = rawStr(t, "project_id"), labelList(t), !isOpen(t)
			if keep(row.projectID, row.labels) {
				rows = append(rows, row)
			}
		}
	}
	if q.source == "all" || q.source == "project" {
		bi, err := infos("project")
		if err != nil {
			return nil, err
		}
		for _, p := range snap.projList {
			id := rawStr(p, "id")
			if rawStr(p, "description") == "" && len(bi[id].Appends) == 0 {
				continue
			}
			row := r.noteRowOf("project", id, "name", p, bi[id])
			row.projectID, row.labels, row.archived = id, []string{}, boolean(p, "archived")
			if keep(row.projectID, nil) && labels == nil {
				rows = append(rows, row)
			}
		}
	}
	return rows, nil
}

// preview is the start of a note's text without Markdown, about one snippet
// long. A relayed read keeps the whole text: a marker cannot be cut, so the
// device decrypts the value and the preview is all of it.
func (r *Registry) preview(text string) *string {
	if r.mark != nil && strings.Contains(text, markOpen) {
		return &text
	}
	var b strings.Builder
	for _, s := range notesearch.Snippet(text, nil, notesearch.DefaultSnippet) {
		b.WriteString(s.Text)
	}
	out := b.String()
	return &out
}

func (row noteRow) out() noteOut {
	o := noteOut{Kind: row.kind, ID: row.id, Untrusted: noteText{Title: row.title}, LabelIDs: row.labels,
		UpdatedAt: isoTime(float64(row.updated)), Encrypted: row.encrypted, Completed: row.completed, Archived: row.archived}
	if row.projectID != "" {
		pid := row.projectID
		o.ProjectID = &pid
	}
	return o
}

func (r *Registry) listNotes(ctx context.Context, userID string, a args) (map[string]any, error) {
	if err := a.only("", "source", "project_id", "label_id", "limit", "cursor"); err != nil {
		return nil, err
	}
	q, err := parseNoteQuery(a)
	if err != nil {
		return nil, err
	}
	return r.notesPayload(ctx, userID, q)
}

func (r *Registry) notesPayload(ctx context.Context, userID string, q noteQuery) (map[string]any, error) {
	rows, err := r.collectNotes(ctx, userID, q)
	if err != nil {
		return nil, err
	}
	items := make([]keyed[noteOut], 0, len(rows))
	for _, row := range rows {
		o := row.out()
		o.Untrusted.Preview = r.preview(row.text)
		items = append(items, keyed[noteOut]{key: sortableFloat(-float64(row.updated)), id: row.kind + ":" + row.id, v: o})
	}
	list, next, err := page(items, q.cursor, q.limit)
	if err != nil {
		return nil, err
	}
	return map[string]any{"notes": list, "next_cursor": nullable(next), "server_time": r.serverTime()}, nil
}

// ---- search_notes ----

func searchEncryptedErr() *ToolError {
	return toolErr("encryption_enabled", "this account uses end-to-end encryption: the server cannot search note text it cannot read, and searching through the user's device would send every note through it. Search in the app, or connect through ot mcp --decrypt, which searches on the user's machine; list_notes and get_note still work.")
}

func (r *Registry) searchNotes(ctx context.Context, c Caller, a args) (map[string]any, error) {
	if c.Encrypted {
		return nil, searchEncryptedErr()
	}
	query, _, err := a.text("query", true, 500)
	if err != nil {
		return nil, err
	}
	if err := a.only("", "query", "source", "project_id", "label_id", "limit", "cursor"); err != nil {
		return nil, err
	}
	q, err := parseNoteQuery(a)
	if err != nil {
		return nil, err
	}
	rows, err := r.collectNotes(ctx, c.UserID, q)
	if err != nil {
		return nil, err
	}
	byKey := make(map[string]noteRow, len(rows))
	notes := make([]notesearch.Note, 0, len(rows))
	for _, row := range rows {
		k := row.kind + ":" + row.id
		byKey[k] = row
		notes = append(notes, notesearch.Note{Key: k, Title: row.plainT, Text: row.plainX, Updated: row.updated})
	}
	terms := notesearch.ParseQuery(query)
	hits := notesearch.Rank(notes, query)
	items := make([]keyed[noteOut], 0, len(hits))
	for i, h := range hits {
		row := byKey[h.Note.Key]
		o := row.out()
		o.Untrusted.Snippet = notesearch.Snippet(row.plainX, terms, notesearch.DefaultSnippet)
		items = append(items, keyed[noteOut]{key: fmt.Sprintf("%08d", i), id: h.Note.Key, v: o})
	}
	list, next, err := page(items, q.cursor, q.limit)
	if err != nil {
		return nil, err
	}
	return map[string]any{"notes": list, "next_cursor": nullable(next), "server_time": r.serverTime()}, nil
}

// ---- get_note ----

// ErrNoteNotFound is get_note's answer for an id that is unknown, deleted or
// not visible to the user (indistinguishable on purpose).
var ErrNoteNotFound = &ToolError{Message: "note not found"}

type appendText struct {
	ID   string `json:"id"`
	Text string `json:"text"`
}

type noteDetailText struct {
	Title    string       `json:"title"`
	Text     string       `json:"text"`
	Appended []appendText `json:"appended"`
}

type noteDetail struct {
	Kind        string         `json:"kind"`
	ID          string         `json:"id"`
	Untrusted   noteDetailText `json:"untrusted_text"`
	ProjectID   *string        `json:"project_id"`
	LabelIDs    []string       `json:"label_ids"`
	BodyVersion string         `json:"body_version"`
	UpdatedAt   *string        `json:"updated_at"`
	Encrypted   bool           `json:"encrypted"`
	Completed   bool           `json:"completed,omitempty"`
	Archived    bool           `json:"archived,omitempty"`
}

func (r *Registry) getNote(ctx context.Context, userID string, a args) (map[string]any, error) {
	if err := a.only("", "id", "kind"); err != nil {
		return nil, err
	}
	id, err := a.str("id")
	if err != nil {
		return nil, err
	}
	if id == "" {
		return nil, argErr("id: the note id is required")
	}
	kind, err := a.str("kind")
	if err != nil {
		return nil, err
	}
	return r.noteDetail(ctx, userID, kind, id)
}

// noteDetail is get_note's payload, or ErrNoteNotFound.
func (r *Registry) noteDetail(ctx context.Context, userID, kind, id string) (map[string]any, error) {
	snap, err := r.load(ctx, userID)
	if err != nil {
		return nil, err
	}
	var e opsync.Entity
	titleField := "title"
	switch kind {
	case "", "note":
		kind = "note"
		notes, err := r.liveNotes(ctx, userID, snap)
		if err != nil {
			return nil, err
		}
		for _, n := range notes {
			if rawStr(n, "id") == id {
				e = n
			}
		}
	case "task":
		if t := snap.task(id); t != nil && snap.visible(t, true) {
			e = t
		}
	case "project":
		e, titleField = snap.projects[id], "name"
	default:
		return nil, argErr("kind: must be note, task or project")
	}
	if e == nil {
		return nil, ErrNoteNotFound
	}
	infos, err := r.sync.BodyInfos(ctx, userID, kind, id)
	if err != nil {
		return nil, err
	}
	info := infos[id]
	row := r.noteRowOf(kind, id, titleField, e, info)
	apps, _ := r.shownAppends(kind, id, info.Appends)
	d := noteDetail{Kind: kind, ID: id, Untrusted: noteDetailText{Title: row.title, Text: str(e, "description"), Appended: []appendText{}},
		LabelIDs: labelList(e), BodyVersion: info.Version, UpdatedAt: isoTime(float64(row.updated)), Encrypted: row.encrypted}
	if d.BodyVersion == "" {
		d.BodyVersion = opsync.FormatBodyVersion(0, "")
	}
	for _, ap := range apps {
		d.Untrusted.Appended = append(d.Untrusted.Appended, appendText{ID: ap.ID, Text: ap.Text})
	}
	pid := rawStr(e, "project_id")
	switch kind {
	case "task":
		d.Completed = !isOpen(e)
	case "project":
		pid, d.LabelIDs, d.Archived = id, []string{}, boolean(e, "archived")
	}
	if pid != "" {
		d.ProjectID = &pid
	}
	return map[string]any{"note": d, "server_time": r.serverTime()}, nil
}
