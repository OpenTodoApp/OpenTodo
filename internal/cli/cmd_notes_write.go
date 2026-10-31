package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	"github.com/OpenTodoApp/opentodo/internal/ids"
)

// Note writes (notes-overview D12, D13). Every write goes through the REST
// routes; --dry-run prints them, --read-only refuses them. On an encrypted
// account every text value is sealed here for its entity, id and field.

// ifMatch is the version check of a replacement: the body version read.
func ifMatch(version string) map[string]string {
	return map[string]string{"If-Match": `"` + version + `"`}
}

// standaloneRows reads the live standalone notes and their projects.
func (s *noteSession) standaloneRows(ctx context.Context) ([]noteRow, []project, error) {
	return s.loadNotes(ctx, "note")
}

// rowFromResponse turns a write's response into a row; a dry run's stand-in
// response keeps the planned values.
func (s *noteSession) rowFromResponse(kind string, raw []byte, fallback noteRow) noteRow {
	r, err := s.rowOf(kind, raw)
	if err != nil || r.id == "" || strings.HasPrefix(r.id, "(planned") {
		return fallback
	}
	return r
}

type noteFields struct {
	title, project, body, bodyFile, key string
	labels                              stringList
}

func notesAdd(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("notes add", g)
	var f noteFields
	fs.StringVar(&f.project, "project", "", "project name or id")
	fs.Var(&f.labels, "label", "label name or id (repeatable)")
	fs.StringVar(&f.body, "body", "", "the note's text (Markdown)")
	fs.StringVar(&f.bodyFile, "body-file", "", "read the text from a file, - for standard input")
	fs.StringVar(&f.key, "idempotency-key", "", "retry-safe create")
	pos, err := a.parse(g, fs, "notes add", protectDashText(args))
	if err != nil {
		return a.helpOr("notes", err)
	}
	set := visited(fs)
	title := strings.TrimSpace(strings.Join(undashAll(pos), " "))
	if title == "" {
		return usageErr("usage: ot notes add <title> [--project <ref>] [--label <l>]... [--body <text> | --body-file <path|->] [--idempotency-key <key>]")
	}
	body, _, err := a.readBody(f.body, f.bodyFile, set["body"], set["body-file"], "--body and --body-file")
	if err != nil {
		return err
	}
	headers, err := idempotencyHeaders(set["idempotency-key"], f.key)
	if err != nil {
		return err
	}
	s, err := a.notesConnect(ctx, g)
	if err != nil {
		return err
	}
	if err := s.requireKey(); err != nil {
		return err
	}
	create := map[string]any{"title": title, "description": body, "labels": []string{}, "project_id": nil}
	if f.project != "" {
		projects, err := s.projects(ctx)
		if err != nil {
			return err
		}
		p, err := findProject(projects, undash(f.project))
		if err != nil {
			return err
		}
		create["project_id"] = p.ID
	}
	if len(f.labels) > 0 {
		lids, err := s.resolveLabels(ctx, undashAll(f.labels))
		if err != nil {
			return err
		}
		create["labels"] = lids
	}
	if s.encrypted {
		// The server chooses a created note's id, and a sealed value names its
		// id: create the note without text, then write the sealed text.
		create["title"], create["description"] = "", ""
	}
	raw, _, err := s.c.do(ctx, http.MethodPost, "/notes", create, headers)
	if err != nil {
		return err
	}
	planned := noteRow{kind: "note", title: title, description: body, appends: []pendingAppend{}, labels: []string{}, bodyVersion: "0"}
	r := s.rowFromResponse("note", raw, planned)
	if s.encrypted {
		var created noteBody
		_ = json.Unmarshal(raw, &created)
		patch := map[string]any{}
		if patch["title"], err = s.seal("note", created.ID, "title", title); err != nil {
			return err
		}
		if patch["description"], err = s.seal("note", created.ID, "description", body); err != nil {
			return err
		}
		version := created.BodyVersion
		if version == "" {
			version = "0"
		}
		out, _, err := s.c.do(ctx, http.MethodPatch, "/notes/"+url.PathEscape(created.ID), patch, ifMatch(version))
		if err != nil {
			return err
		}
		planned.id = created.ID
		r = s.rowFromResponse("note", out, planned)
	}
	if g.json {
		return a.printJSON(r.textOut())
	}
	fmt.Fprintln(a.Stdout, r.id)
	return nil
}

func notesEdit(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("notes edit", g)
	var f noteFields
	fs.StringVar(&f.title, "title", "", "new title")
	fs.StringVar(&f.project, "project", "", "project name or id; none makes it a personal note")
	fs.Var(&f.labels, "label", "label name or id (repeatable; replaces the list; none clears)")
	fs.StringVar(&f.body, "body", "", "replace the text (Markdown)")
	fs.StringVar(&f.bodyFile, "body-file", "", "replace the text with a file's, - for standard input")
	pos, err := a.parse(g, fs, "notes edit", protectDashText(args))
	if err != nil {
		return a.helpOr("notes", err)
	}
	set := visited(fs)
	if len(pos) == 0 {
		return usageErr("usage: ot notes edit <ref> [--title <t>] [--project <ref|none>] [--label <l>]... [--body <text> | --body-file <path|->]")
	}
	body, hasBody, err := a.readBody(f.body, f.bodyFile, set["body"], set["body-file"], "--body and --body-file")
	if err != nil {
		return err
	}
	if !hasBody && !set["title"] && !set["project"] && !set["label"] {
		return usageErr("nothing to change: give --title, --project, --label, --body or --body-file")
	}
	s, err := a.notesConnect(ctx, g)
	if err != nil {
		return err
	}
	if hasBody || set["title"] {
		if err := s.requireKey(); err != nil {
			return err
		}
	}
	rows, projects, err := s.standaloneRows(ctx)
	if err != nil {
		return err
	}
	n, err := resolveNote(rows, strings.Join(undashAll(pos), " "))
	if err != nil {
		return err
	}
	a.target(pos[0], n.id, n.shownTitle(), "updated")
	patch, err := s.notePatch(ctx, n, projects, f, set, body, hasBody)
	if err != nil {
		return err
	}
	var headers map[string]string
	if hasBody {
		headers = ifMatch(n.bodyVersion)
	}
	raw, _, err := s.c.do(ctx, http.MethodPatch, "/notes/"+url.PathEscape(n.id), patch, headers)
	if err != nil {
		return err
	}
	r := s.rowFromResponse("note", raw, *n)
	if g.json {
		return a.printJSON(r.textOut())
	}
	fmt.Fprintf(a.Stdout, "updated  %s  %s\n", shortID(r.id), r.shownTitle())
	return nil
}

// notePatch builds the PATCH body of `ot notes edit`.
func (s *noteSession) notePatch(ctx context.Context, n *noteRow, projects []project, f noteFields, set map[string]bool, body string, hasBody bool) (map[string]any, error) {
	patch := map[string]any{}
	var err error
	if set["title"] {
		if patch["title"], err = s.seal("note", n.id, "title", strings.TrimSpace(undash(f.title))); err != nil {
			return nil, err
		}
	}
	if hasBody {
		if patch["description"], err = s.seal("note", n.id, "description", body); err != nil {
			return nil, err
		}
	}
	if set["project"] {
		ref := undash(f.project)
		if strings.EqualFold(ref, "none") {
			patch["project_id"] = nil
		} else {
			p, err := findProject(projects, ref)
			if err != nil {
				return nil, err
			}
			patch["project_id"] = p.ID
		}
	}
	if set["label"] {
		labels := undashAll(f.labels)
		if len(labels) == 1 && strings.EqualFold(labels[0], "none") {
			patch["labels"] = []string{}
		} else if patch["labels"], err = s.resolveLabels(ctx, labels); err != nil {
			return nil, err
		}
	}
	return patch, nil
}

// appendResult is the server's answer to an append (schema note_append).
type appendResult struct {
	Entity      string `json:"entity"`
	EntityID    string `json:"entity_id"`
	AppendID    string `json:"append_id"`
	BodyVersion string `json:"body_version"`
}

// sendAppend posts one append with an id chosen here, so an encrypted
// account's text can be sealed for its field appends.<id> first.
func (a *App) sendAppend(ctx context.Context, g *globalFlags, s *noteSession, entity, id, path, text string) error {
	aid := ids.New()
	sealed, err := s.seal(entity, id, "appends."+aid, text)
	if err != nil {
		return err
	}
	raw, _, err := s.c.do(ctx, http.MethodPost, path, map[string]any{"id": aid, "text": sealed}, nil)
	if err != nil {
		return err
	}
	res := appendResult{Entity: entity, EntityID: id, AppendID: aid}
	_ = json.Unmarshal(raw, &res)
	if res.EntityID == "" {
		res.Entity, res.EntityID, res.AppendID = entity, id, aid
	}
	if g.json {
		return a.printJSON(res)
	}
	fmt.Fprintf(a.Stdout, "appended  %s  %s\n", shortID(res.EntityID), res.AppendID)
	return nil
}

func notesAppend(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("notes append", g)
	bodyFile := fs.String("body-file", "", "read the text from a file, - for standard input")
	pos, err := a.parse(g, fs, "notes append", protectDashText(args))
	if err != nil {
		return a.helpOr("notes", err)
	}
	pos = undashAll(pos)
	set := visited(fs)
	if len(pos) == 0 {
		return usageErr("usage: ot notes append <ref> <text> | --body-file <path|->")
	}
	text, _, err := a.readBody(strings.Join(pos[1:], " "), *bodyFile, len(pos) > 1, set["body-file"], "<text> and --body-file")
	if err != nil {
		return err
	}
	if strings.TrimSpace(text) == "" {
		return usageErr("nothing to append: give the text or --body-file")
	}
	s, err := a.notesConnect(ctx, g)
	if err != nil {
		return err
	}
	if err := s.requireKey(); err != nil {
		return err
	}
	rows, _, err := s.standaloneRows(ctx)
	if err != nil {
		return err
	}
	n, err := resolveNote(rows, pos[0])
	if err != nil {
		return err
	}
	a.target(pos[0], n.id, n.shownTitle(), "appended")
	return a.sendAppend(ctx, g, s, "note", n.id, "/notes/"+url.PathEscape(n.id)+"/append", text)
}

func notesRm(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("notes rm", g)
	yes := fs.Bool("yes", false, "do not ask for confirmation")
	fs.BoolVar(yes, "y", false, "do not ask for confirmation")
	refs, err := a.parse(g, fs, "notes rm", args)
	if err != nil {
		return a.helpOr("notes", err)
	}
	if len(refs) == 0 {
		return usageErr("usage: ot notes rm <ref>... [--yes]")
	}
	s, err := a.notesConnect(ctx, g)
	if err != nil {
		return err
	}
	rows, projects, err := s.standaloneRows(ctx)
	if err != nil {
		return err
	}
	var targets []*noteRow
	refOf := map[string]string{}
	for _, ref := range refs {
		n, err := resolveNote(rows, ref)
		if err != nil {
			return err
		}
		if _, seen := refOf[n.id]; !seen {
			refOf[n.id] = ref
			targets = append(targets, n)
		}
	}
	// Off a terminal or with --json, a.parse already refused without --yes.
	if !*yes && !a.dryRun() {
		for _, n := range targets {
			fmt.Fprintf(a.Stderr, "  %s  %s\n", shortID(n.id), n.shownTitle())
		}
		ok, err := a.confirm(fmt.Sprintf("Move %d note(s) to the Trash?", len(targets)))
		if err != nil {
			return err
		}
		if !ok {
			return usageErr("aborted")
		}
	}
	names := map[string]string{}
	for _, p := range projects {
		names[p.ID] = p.Name
	}
	results := make([]json.RawMessage, 0, len(targets))
	for _, n := range targets {
		a.target(refOf[n.id], n.id, n.shownTitle(), "deleted")
		if err := s.c.delete(ctx, "/notes/"+url.PathEscape(n.id)); err != nil {
			return err
		}
		raw, _ := json.Marshal(n.summary(names))
		results = append(results, withStatus(raw, refOf[n.id], "deleted"))
		if !g.json {
			fmt.Fprintf(a.Stdout, "deleted  %s  %s\n", shortID(n.id), n.shownTitle())
		}
	}
	if g.json {
		if len(results) == 1 {
			return a.printJSON(results[0])
		}
		return a.printRawList(results)
	}
	return nil
}

func notesToTask(a *App, ctx context.Context, g *globalFlags, args []string) error {
	fs := a.flagSet("notes to-task", g)
	pos, err := a.parse(g, fs, "notes to-task", protectDashText(args))
	if err != nil {
		return a.helpOr("notes", err)
	}
	if len(pos) == 0 {
		return usageErr("usage: ot notes to-task <ref>")
	}
	s, err := a.notesConnect(ctx, g)
	if err != nil {
		return err
	}
	if err := s.requireKey(); err != nil {
		return err
	}
	rows, _, err := s.standaloneRows(ctx)
	if err != nil {
		return err
	}
	n, err := resolveNote(rows, strings.Join(undashAll(pos), " "))
	if err != nil {
		return err
	}
	a.target(pos[0], n.id, n.shownTitle(), "converted")
	var body map[string]any
	if s.encrypted {
		if body, err = s.sealedTask(n); err != nil {
			return err
		}
	}
	raw, _, err := s.c.do(ctx, http.MethodPost, "/notes/"+url.PathEscape(n.id)+"/to-task", body, nil)
	if err != nil {
		return err
	}
	if g.json {
		return a.printJSON(json.RawMessage(raw))
	}
	var t task
	_ = json.Unmarshal(raw, &t)
	fmt.Fprintln(a.Stdout, t.ID)
	return nil
}

// sealedTask is the to-task body of an encrypted account: a task id chosen
// here and the note's title, text and document sealed for it (D13). Pending
// appends are sealed for the note and the server copies them as they are, so
// a note with appends no device has merged yet is refused: open it in the app
// first.
func (s *noteSession) sealedTask(n *noteRow) (map[string]any, error) {
	if n.encrypted {
		return nil, &exitError{code: ExitNotPermitted, jsonCode: "encryption_enabled",
			msg: "this note's text does not decrypt with the stored account key; run `ot encryption unlock` again. Nothing was sent."}
	}
	if len(n.appends) > 0 {
		return nil, usageErr("this note has text appended that no device has merged yet; open it in the app once, then run `ot notes to-task` again. Nothing was sent.")
	}
	tid := ids.New()
	body := map[string]any{"task_id": tid}
	var err error
	if body["title"], err = s.seal("task", tid, "title", n.title); err != nil {
		return nil, err
	}
	if body["description"], err = s.seal("task", tid, "description", n.description); err != nil {
		return nil, err
	}
	var doc string
	if json.Unmarshal(n.notesDoc, &doc) == nil && doc != "" {
		// The document as sealed for the note, sealed again for the task; one
		// that does not open is left empty, and devices rebuild it from the
		// description (docs/sync.md "Mergeable documents" rule 3).
		body["notes_doc"] = ""
		if e2ee.IsCiphertext(doc) {
			if pt, ok := s.open("note", n.id, "notes_doc", doc); ok {
				if body["notes_doc"], err = s.seal("task", tid, "notes_doc", pt); err != nil {
					return nil, err
				}
			}
		}
	}
	return body, nil
}
