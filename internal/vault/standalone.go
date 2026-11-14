package vault

import (
	"fmt"
	"io/fs"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// Standalone notes in the vault (OpenSpec change vault-notes): while a vault's
// notes are on, each live note is one file in NotesDir, matched by its
// `opentodo-id`; the body merges line by line against the last-synced text.

// NotesDir is the vault's folder of standalone notes, at its root (design D1).
const NotesDir = "Notes"

// MaxNotes is the most standalone notes a vault holds (spec "Note limits").
const MaxNotes = 5000

// untitledNote names the file of a note without a title.
const untitledNote = "Untitled note"

// NoteCounts are what a sync did to standalone notes (spec "Turning notes on
// and off": written, created, changed and trashed).
type NoteCounts struct {
	Written int `json:"written"`
	Created int `json:"created"`
	Changed int `json:"changed"`
	Trashed int `json:"trashed"`
	// Notes is how many notes the vault holds after the sync.
	Notes int `json:"notes"`
}

// notesFence is the folder the project scan leaves alone: Notes/ while notes
// are on, and while files of an earlier "on" are still tracked.
func (st *State) notesFence() string {
	if st.Notes || len(st.NoteFiles) > 0 {
		return NotesDir
	}
	return ""
}

// SetNotes turns a vault's standalone notes on or off (design D5). It only
// writes the state file; the next sync applies it. Off keeps the files and
// what was last written to them, so turning notes on again matches them.
func SetNotes(dir string, on bool) (changed bool, err error) {
	st, err := LoadState(dir)
	if err != nil {
		return false, err
	}
	if st.Notes == on {
		return false, nil
	}
	st.Notes = on
	if !on {
		// The store stops following notes; turning them on again pulls once
		// from the start to catch up.
		st.NotesSeeded = false
	}
	return true, st.Save(dir)
}

// noteDoc is one file of Notes/ as read.
type noteDoc struct {
	path string
	raw  []byte
	f    *Front
}

// standalone is the notes part of one run.
type standalone struct {
	disk map[string]*noteDoc // Notes/<name>.md by path
	byID map[string]string   // note id → its file on disk (first file wins)
	// handled are notes whose file this run read and merged (or overruled):
	// their file is written from the app; others keep a changed file as it is.
	handled map[string]bool
	stale   map[string]bool // a body push that lost to a newer edit
	raced   map[string]bool // a file saved while the sync ran
	moved   map[string]string
	// pushed is the description timestamp each body write was sent with.
	pushed map[string]int64
}

func (e *engine) notesOn() bool { return e.st.Notes }

// scanStandalone reads Notes/ and checks the size of every changed file
// (spec "Note limits and encryption in the vault").
func (e *engine) scanStandalone() error {
	if !e.notesOn() {
		return nil
	}
	sn := &standalone{disk: map[string]*noteDoc{}, byID: map[string]string{}, handled: map[string]bool{},
		stale: map[string]bool{}, raced: map[string]bool{}, moved: map[string]string{}, pushed: map[string]int64{}}
	e.sn = sn
	e.rep.Notes = &NoteCounts{}
	entries, err := os.ReadDir(filepath.Join(e.o.Dir, NotesDir))
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	for _, d := range entries {
		name := d.Name()
		if d.IsDir() || !d.Type().IsRegular() || strings.HasPrefix(name, ".") || !strings.HasSuffix(name, ".md") || strings.HasSuffix(name, ".conflict.md") {
			continue
		}
		p := NotesDir + "/" + name
		b, err := os.ReadFile(filepath.Join(e.o.Dir, NotesDir, name))
		if err != nil {
			return err
		}
		f := ParseFront(string(b))
		if len(f.Body) > MaxNoteBytes {
			return &LimitError{Msg: fmt.Sprintf("%s is larger than 64 KB, the limit for a note", p)}
		}
		sn.disk[p] = &noteDoc{path: p, raw: b, f: f}
	}
	for _, p := range sortedKeys(sn.disk) {
		id := sn.disk[p].f.str("opentodo-id")
		if id == "" {
			continue
		}
		if prev, ok := sn.byID[id]; ok {
			e.rep.warn("%s has the opentodo-id of %s; it is left as it is", p, prev)
			continue
		}
		sn.byID[id] = p
	}
	return nil
}

// checkNoteLimits stops a sync, before any write or push, when the vault
// would hold more notes than MaxNotes or a note's text is over 64 KB.
func (e *engine) checkNoteLimits() error {
	if e.sn == nil {
		return nil
	}
	v := e.newView(e.app, e.sharedSet())
	n := 0
	for _, id := range e.app.IDs("note") {
		if !e.app.Get("note", id).Live() {
			continue
		}
		n++
		if len(v.text("note", id, "description")) > MaxNoteBytes {
			return &LimitError{Msg: fmt.Sprintf("the note %q is larger than 64 KB, the limit for a note", v.text("note", id, "title"))}
		}
	}
	for _, d := range e.sn.disk {
		if d.f.str("opentodo-id") == "" {
			n++
		}
	}
	if n > MaxNotes {
		return &LimitError{Msg: fmt.Sprintf("the vault would hold %d notes; the limit is %d", n, MaxNotes)}
	}
	return nil
}

// notePaths places every live note in Notes/ (design D1): its title with the
// vault's file-name rules, "Untitled note" for none, clashes numbered in
// creation order.
func notePaths(v *view) map[string]string {
	var ids []string
	for _, id := range v.s.IDs("note") {
		if v.s.Get("note", id).Live() {
			ids = append(ids, id)
		}
	}
	sort.SliceStable(ids, func(i, j int) bool {
		a, b := v.s.Get("note", ids[i]).Num("created_at"), v.s.Get("note", ids[j]).Num("created_at")
		if a != b {
			return a < b
		}
		return ids[i] < ids[j]
	})
	out := map[string]string{}
	taken := map[string]bool{}
	for _, id := range ids {
		base := untitledNote
		if t := strings.TrimSpace(v.text("note", id, "title")); t != "" {
			base = SafeName(t)
		}
		name := base
		for n := 2; taken[strings.ToLower(name)]; n++ {
			name = base + " " + strconv.Itoa(n)
		}
		taken[strings.ToLower(name)] = true
		out[id] = NotesDir + "/" + name + ".md"
	}
	return out
}

// noteLinks are the files links are rewritten against (design D4).
type noteLinks struct {
	notes    map[string]string // note id → Notes/<name>.md
	projects map[string]string // project id → its file
	byPath   map[string]string // file path → "note:<id>" or "project:<id>"
}

func newNoteLinks(notes, layout map[string]string) *noteLinks {
	l := &noteLinks{notes: notes, projects: map[string]string{}, byPath: map[string]string{}}
	for pid, p := range layout {
		if pid == "" {
			continue
		}
		l.projects[pid] = p
		l.byPath[strings.ToLower(p)] = "project:" + pid
	}
	for id, p := range notes {
		l.byPath[strings.ToLower(p)] = "note:" + id
	}
	return l
}

var (
	mdLinkRe = regexp.MustCompile(`\[((?:[^\[\]\\]|\\.)*)\]\(([^()]*)\)`)
	fenceRe  = regexp.MustCompile("^\\s{0,3}(```+|~~~+)")
	codeRe   = regexp.MustCompile("`+[^`]*`+")
)

// eachLink rewrites the address of every inline link outside code spans and
// fenced blocks; fn returns the new address and whether to replace it.
func eachLink(md string, fn func(addr string) (string, bool)) string {
	if !strings.Contains(md, "](") {
		return md
	}
	lines := strings.Split(md, "\n")
	open := ""
	for i, line := range lines {
		if open != "" {
			if strings.HasPrefix(strings.TrimLeft(line, " \t"), open) {
				open = ""
			}
			continue
		}
		if m := fenceRe.FindStringSubmatch(line); m != nil {
			open = m[1][:3]
			continue
		}
		if !strings.Contains(line, "](") {
			continue
		}
		masked := codeRe.ReplaceAllStringFunc(line, func(s string) string { return strings.Repeat(" ", len(s)) })
		var b strings.Builder
		last := 0
		for _, m := range mdLinkRe.FindAllStringSubmatchIndex(masked, -1) {
			if m[0] > 0 && masked[m[0]-1] == '!' {
				continue // an image keeps its address
			}
			addr := line[m[4]:m[5]]
			next, ok := fn(addr)
			if !ok {
				continue
			}
			b.WriteString(line[last:m[4]])
			b.WriteString(next)
			last = m[5]
		}
		if last > 0 {
			b.WriteString(line[last:])
			lines[i] = b.String()
		}
	}
	return strings.Join(lines, "\n")
}

// toFiles writes `?note=<id>` and `?project=<id>` as relative links to their
// files, when the file exists; everything else stays.
func (l *noteLinks) toFiles(md string) string {
	return eachLink(md, func(addr string) (string, bool) {
		kind, id, ok := strings.Cut(strings.TrimPrefix(addr, "?"), "=")
		if !ok || !strings.HasPrefix(addr, "?") {
			return "", false
		}
		switch kind {
		case "note":
			if p, ok := l.notes[id]; ok {
				return linkPath(path.Base(p)), true
			}
		case "project":
			if p, ok := l.projects[id]; ok {
				return linkPath("../" + p), true
			}
		}
		return "", false
	})
}

// fromFiles reads a relative link to a note's or a project's file back as the
// id form; links to anything else stay as written.
func (l *noteLinks) fromFiles(md string) string {
	return eachLink(md, func(addr string) (string, bool) {
		a := strings.TrimSuffix(strings.TrimPrefix(strings.TrimSpace(addr), "<"), ">")
		if a == "" || strings.HasPrefix(a, "?") || strings.Contains(a, "://") || strings.HasPrefix(a, "/") || !strings.HasSuffix(strings.ToLower(a), ".md") {
			return "", false
		}
		if dec, err := url.PathUnescape(a); err == nil {
			a = dec
		}
		target := l.byPath[strings.ToLower(path.Clean(path.Join(NotesDir, a)))]
		if target == "" {
			return "", false
		}
		kind, id, _ := strings.Cut(target, ":")
		return "?" + kind + "=" + id, true
	})
}

// linkPath escapes what a Markdown link address cannot hold as written.
func linkPath(p string) string {
	return strings.NewReplacer(" ", "%20", "(", "%28", ")", "%29").Replace(p)
}

// noteVals are the fields a note's file shows, in the note's value space:
// decrypted text, the body in the id form of links.
type noteVals struct {
	title, project, body string
	labels               []string
}

func readNoteVals(v *view, id string) noteVals {
	r := v.s.Get("note", id)
	labels := append([]string(nil), r.Strs("labels")...)
	sort.Strings(labels)
	return noteVals{title: v.text("note", id, "title"), project: r.Str("project_id"), body: v.text("note", id, "description"), labels: labels}
}

// noteFileVals reads a note's file. A project link that names no project file
// is reported and keeps the app's value (ok false for it).
func (e *engine) noteFileVals(m *mergeRun, d *noteDoc, app noteVals, rec NoteFileState, links *noteLinks, layout map[string]string) (noteVals, bool) {
	out := app
	if rec.Path == "" || rec.Path != d.path {
		out.title = stem(d.path)
		if out.title == untitledNote && rec.Path != "" {
			out.title = ""
		}
	}
	projOK := true
	if k := d.f.get("project"); k == nil {
		out.project = ""
	} else if pid, ok := projectOfLink(d.f.str("project"), layout); ok {
		out.project = pid
	} else {
		e.rep.warn("%s: project %q names no project file; the note stays where it is", d.path, d.f.str("project"))
		projOK = false
	}
	var labels []string
	for _, t := range d.f.strings("tags") {
		sl := slug(strings.TrimPrefix(t, "#"))
		if sl == "" {
			continue
		}
		id, ok := m.labels[sl]
		if !ok {
			id = e.labelFor(m, sl)
		}
		labels = append(labels, id)
	}
	sort.Strings(labels)
	out.labels = dedupe(labels)
	out.body = links.fromFiles(d.f.Body)
	return out, projOK
}

func dedupe(s []string) []string {
	var out []string
	for i, v := range s {
		if i == 0 || v != s[i-1] {
			out = append(out, v)
		}
	}
	return out
}

// projectOfLink resolves `[[Home]]`, `[[Work/Work]]` or a bare name to the
// project whose file it names: the Inbox (or nothing) is no project.
func projectOfLink(v string, layout map[string]string) (string, bool) {
	s := strings.TrimSpace(v)
	s = strings.TrimSuffix(strings.TrimPrefix(s, "[["), "]]")
	if i := strings.IndexAny(s, "|#"); i >= 0 {
		s = s[:i]
	}
	s = strings.TrimSuffix(strings.TrimSpace(s), ".md")
	if s == "" || strings.EqualFold(s, stem(InboxFile)) {
		return "", true
	}
	var byName []string
	for pid, p := range layout {
		if pid == "" {
			continue
		}
		full := strings.TrimSuffix(p, ".md")
		if strings.EqualFold(full, s) {
			return pid, true
		}
		if strings.EqualFold(path.Base(full), s) {
			byName = append(byName, pid)
		}
	}
	if len(byName) == 1 {
		return byName[0], true
	}
	return "", false
}

func (e *engine) viewing(project string) bool {
	for _, p := range e.st.Viewing {
		if project != "" && p == project {
			return true
		}
	}
	return false
}

// mergeStandalone turns the changed note files into note ops (spec
// "Standalone notes in the vault", "Merging a note's body", "Deleting and
// trashing note files").
func (e *engine) mergeStandalone() error {
	sn := e.sn
	if sn == nil {
		return nil
	}
	shared := e.sharedSet()
	av, bv := e.newView(e.app, shared), e.newView(e.base, shared)
	layout := av.Layout()
	m := &mergeRun{av: av, bv: bv, labels: av.labelSlugs(), newLabels: map[string]string{}}
	known := map[string]string{}
	for id, p := range notePaths(av) {
		known[id] = p
	}
	for id, p := range sn.byID {
		known[id] = p
	}
	links := newNoteLinks(known, layout)
	for _, p := range sortedKeys(sn.disk) {
		d := sn.disk[p]
		id := d.f.str("opentodo-id")
		if id == "" {
			e.createNote(m, d, links, layout)
			continue
		}
		if sn.byID[id] != p {
			continue // a copy of another note's file
		}
		app := e.app.Get("note", id)
		if app == nil {
			if _, ours := e.st.NoteFiles[id]; !ours {
				e.rep.warn("%s: opentodo-id %s is no note of this account; the file is left as it is", p, short(id))
			}
			continue
		}
		if !app.Live() {
			continue // trashed in the app: the plan handles the file
		}
		rec := e.st.NoteFiles[id]
		if rec.Path == p && rec.Hash == hashOf(d.raw) {
			continue
		}
		e.mergeNoteFile(m, d, id, rec, links, layout)
	}
	for _, id := range sortedKeys(e.st.NoteFiles) {
		rec := e.st.NoteFiles[id]
		if _, onDisk := sn.byID[id]; onDisk {
			continue
		}
		if _, err := os.Stat(filepath.Join(e.o.Dir, filepath.FromSlash(icloudPlaceholder(rec.Path)))); err == nil {
			sn.raced[id] = true
			continue
		}
		app := e.app.Get("note", id)
		if !app.Live() {
			continue
		}
		sn.handled[id] = true
		if rowEqual(e.base.Get("note", id), app) && !e.viewing(app.Str("project_id")) {
			b := e.body("note", id)
			b["deleted_at"] = e.nowMS()
			e.rep.Notes.Trashed++
			e.rep.event("trashed", rec.Path, "", "trashed the note %q: its file %s was deleted", av.text("note", id, "title"), rec.Path)
			continue
		}
		e.rep.event("restored", rec.Path, "", "restored %s: the note changed in the app since the last sync", rec.Path)
	}
	return nil
}

// createNote makes a note of a new file in Notes/ (no opentodo-id).
func (e *engine) createNote(m *mergeRun, d *noteDoc, links *noteLinks, layout map[string]string) {
	id := e.newID("note", d.path)
	vals, _ := e.noteFileVals(m, d, noteVals{}, NoteFileState{}, links, layout)
	if vals.title == untitledNote {
		vals.title = ""
	}
	if e.viewing(vals.project) {
		e.rep.warn("%s: you can only view that project; the note is not created", d.path)
		return
	}
	b := e.body("note", id)
	now := e.nowMS()
	b["title"], b["description"], b["project_id"], b["labels"] = vals.title, normBody(vals.body), nullable(vals.project), nonNil(vals.labels)
	b["position"], b["created_at"], b["deleted_at"] = float64(now), now, nil
	e.fresh["note:"+id] = true
	e.sn.byID[id] = d.path
	e.sn.handled[id] = true
	e.rep.Notes.Created++
	e.rep.event("created", d.path, "", "created the note %q from %s", vals.title, d.path)
}

func nonNil(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}

// mergeNoteFile merges one changed file into its note: title, project and
// labels per field (the app wins on both sides), the body line by line.
func (e *engine) mergeNoteFile(m *mergeRun, d *noteDoc, id string, rec NoteFileState, links *noteLinks, layout map[string]string) {
	sn := e.sn
	sn.handled[id] = true
	app := readNoteVals(m.av, id)
	if e.viewing(app.project) {
		e.rep.warn("%s: you can only view this note's project; your edits are not sent and the file is written again", d.path)
		return
	}
	for _, f := range []string{"title", "description"} {
		if m.av.undecryptable["note:"+id+":"+f] {
			e.rep.warn("%s: the note does not decrypt on this machine; it is not merged", d.path)
			return
		}
	}
	base := readNoteVals(m.bv, id)
	if e.base.Get("note", id) == nil {
		base = app // never synced (a taken-over folder): the app's values are the base
	}
	file, _ := e.noteFileVals(m, d, app, rec, links, layout)
	changed := false
	set := func(field string, v any) {
		e.body("note", id)[field] = v
		changed = true
	}
	if file.title != base.title && app.title == base.title {
		set("title", file.title)
	}
	if file.project != base.project && app.project == base.project {
		if e.scopeOf(file.project) != e.scopeOf(app.project) {
			e.moveNoteScope(m, id, file, app)
			return
		}
		set("project_id", nullable(file.project))
	}
	if !equalStrings(file.labels, base.labels) && equalStrings(app.labels, base.labels) {
		set("labels", nonNil(file.labels))
	}
	fb, bb, ab := normBody(file.body), normBody(base.body), normBody(app.body)
	if fb != bb {
		next, ok := fb, true
		if ab != bb {
			next, ok = merge3(bb, fb, ab)
		}
		switch {
		case !ok:
			name := conflictName(d.path)
			e.conf[name] = append(e.conf[name], "<!-- "+e.o.Now().In(e.o.Loc).Format("2006-01-02 15:04")+": the file's text, kept here; the note keeps the app's text -->", string(d.f.Body))
			e.rep.Conflicts++
			e.rep.event("conflict", d.path, "", "%s: the file and the app changed the same lines; the app's text is kept and the file's is in %s", d.path, name)
		case next != ab:
			set("description", next)
			// The write wins over the text it was merged with and loses to
			// any later edit (design D3): a stale push is merged next time.
			sn.pushed[id] = e.app.Get("note", id)["description"].TS + 1
			e.tsAt["note:"+id+":description"] = sn.pushed[id]
		}
	}
	if changed {
		e.rep.Notes.Changed++
		e.rep.event("updated", d.path, "", "updated the note %q from %s", file.title, d.path)
	}
}

// moveNoteScope moves a note into a project of another sharing scope: a copy
// with a new id and a deleted original, as the app does.
func (e *engine) moveNoteScope(m *mergeRun, id string, file, app noteVals) {
	r := e.app.Get("note", id)
	nid := e.newID("note", id, file.project)
	b := e.body("note", nid)
	b["title"], b["description"], b["project_id"], b["labels"] = file.title, normBody(file.body), nullable(file.project), nonNil(file.labels)
	b["position"], b["created_at"], b["deleted_at"] = r.Num("position"), r.Num("created_at"), nil
	e.fresh["note:"+nid] = true
	e.body("note", id)["deleted_at"] = e.nowMS()
	e.sn.moved[id] = nid
	e.sn.handled[nid] = true
	e.rep.Notes.Changed++
	e.rep.event("moved", e.sn.byID[id], "", "moved the note %q to another project; it has a new id", app.title)
}

// staleNotes finds body writes that lost to a newer edit made while the sync
// ran: their file stays and their base is kept, so the next sync merges.
func (e *engine) staleNotes() {
	if e.sn == nil {
		return
	}
	for id, ts := range e.sn.pushed {
		if f := e.app.Get("note", id)["description"]; f.TS != ts || f.D != e.st.Device {
			e.sn.stale[id] = true
			e.rep.event("skipped", e.sn.byID[id], "", "%s: the note changed on another device during the sync; the next sync merges it", e.sn.byID[id])
		}
	}
}

// renderNote is a note's file: the front matter the vault owns over the
// file's own keys, then the body with links to files.
func renderNote(v *view, id string, old *Front, links *noteLinks, layout map[string]string) string {
	f := old
	if f == nil {
		f = ParseFront("")
	}
	r := v.s.Get("note", id)
	var edits []fmEdit
	edits = append(edits, fmEdit{name: "opentodo-id", lines: fmScalarLine("opentodo-id", id)})
	if pid := r.Str("project_id"); pid != "" && layout[pid] != "" {
		edits = append(edits, fmEdit{name: "project", lines: fmScalarLine("project", "[["+strings.TrimSuffix(layout[pid], ".md")+"]]")})
	} else if f.get("project") != nil {
		edits = append(edits, fmEdit{name: "project"})
	}
	var tags []string
	ids := r.Strs("labels")
	sortByPosition(v.s, "label", ids)
	for _, lid := range ids {
		if v.s.Get("label", lid).Live() {
			if sl := slug(v.text("label", lid, "name")); sl != "" {
				tags = append(tags, sl)
			}
		}
	}
	switch k := f.get("tags"); {
	case len(tags) == 0 && k != nil:
		edits = append(edits, fmEdit{name: "tags"})
	case len(tags) > 0 && k == nil:
		edits = append(edits, fmEdit{name: "tags", lines: []string{"tags: [" + strings.Join(tags, ", ") + "]"}})
	case len(tags) > 0:
		if !equalStrings(sortedCopy(f.strings("tags")), sortedCopy(tags)) {
			edits = append(edits, fmEdit{name: "tags", lines: fmListLines("tags", tags, k)})
		}
	}
	// Keys already holding the value keep their lines byte for byte.
	keep := edits[:0]
	for _, ed := range edits {
		if k := f.get(ed.name); k != nil && ed.lines != nil && len(ed.lines) == 1 && k.end-k.start == 1 && f.Lines[k.start] == ed.lines[0] {
			continue
		}
		if k := f.get(ed.name); k != nil && ed.name != "tags" && ed.lines != nil && k.Kind == kindScalar && fmScalarLine(ed.name, k.Scalar)[0] == ed.lines[0] {
			continue
		}
		keep = append(keep, ed)
	}
	body := links.toFiles(v.text("note", id, "description"))
	if body != "" && !strings.HasSuffix(body, "\n") {
		body += "\n"
	}
	if normBody(links.fromFiles(f.Body)) == normBody(v.text("note", id, "description")) {
		body = f.Body // unchanged text keeps its line ends and blank lines
	}
	return f.apply(keep, &body)
}

func sortedCopy(s []string) []string {
	out := append([]string(nil), s...)
	sort.Strings(out)
	return out
}

// planStandalone writes, renames and removes the files in Notes/ (spec
// "Standalone notes in the vault", "Deleting and trashing note files").
func (e *engine) planStandalone(dry bool) error {
	sn := e.sn
	if sn == nil {
		return nil
	}
	v := e.newView(e.app, e.sharedSet())
	layout := v.Layout()
	paths := notePaths(v)
	links := newNoteLinks(paths, layout)
	if e.st.NoteFiles == nil {
		e.st.NoteFiles = map[string]NoteFileState{}
	}
	files := map[string]NoteFileState{}
	for id, rec := range e.st.NoteFiles {
		files[id] = rec
	}
	for _, id := range sortedKeys(paths) {
		target := paths[id]
		cur := sn.byID[id]
		if cur == "" {
			if old := e.sn.movedFrom(id); old != "" {
				cur = sn.byID[old]
			}
		}
		rec := files[id]
		var d *noteDoc
		if cur != "" {
			d = sn.disk[cur]
		}
		if sn.stale[id] || sn.raced[id] {
			continue
		}
		if d != nil && !sn.handled[id] && (rec.Path != cur || rec.Hash != hashOf(d.raw)) && e.o.ReadOnly {
			continue // a read-only run leaves changed files for the next sync
		}
		var old *Front
		if d != nil {
			old = d.f
		}
		text := renderNote(v, id, old, links, layout)
		if dry {
			if d == nil || string(d.raw) != text || cur != target {
				e.rep.Files = append(e.rep.Files, target)
			}
			continue
		}
		if d != nil && cur == target && string(d.raw) == text {
			files[id] = NoteFileState{Path: target, Hash: hashOf(d.raw)}
			continue
		}
		if d != nil && e.savedMeanwhile(d) {
			sn.raced[id] = true
			e.rep.event("skipped", cur, "", "skipped %s: it was saved while the sync ran; the next sync merges it", cur)
			continue
		}
		full := filepath.Join(e.o.Dir, filepath.FromSlash(target))
		if cur != target {
			if _, err := os.Stat(full); err == nil && sn.disk[target] != nil {
				// Another note's file holds the name for now; the next sync places it.
				continue
			}
		}
		if err := writeAtomic(full, []byte(text)); err != nil {
			return err
		}
		if cur != "" && cur != target {
			if err := os.Remove(filepath.Join(e.o.Dir, filepath.FromSlash(cur))); err != nil && !os.IsNotExist(err) {
				return err
			}
		}
		files[id] = NoteFileState{Path: target, Hash: hashOf([]byte(text))}
		e.rep.Notes.Written++
		e.rep.Written++
		e.rep.event("written", target, "", "wrote %s", target)
	}
	// Notes trashed or purged in the app lose their file, or keep it as a
	// conflict file when it changed since the last write.
	for _, id := range sortedKeys(e.st.NoteFiles) {
		if _, live := paths[id]; live {
			continue
		}
		rec := e.st.NoteFiles[id]
		p := sn.byID[id]
		if p == "" {
			p = rec.Path
		}
		d := sn.disk[p]
		if dry {
			continue
		}
		delete(files, id)
		if d == nil || d.f.str("opentodo-id") != id && sn.byID[id] == "" && p != rec.Path {
			continue
		}
		if d != nil && e.savedMeanwhile(d) {
			files[id] = rec
			continue
		}
		full := filepath.Join(e.o.Dir, filepath.FromSlash(p))
		if hashOf(d.raw) == rec.Hash && p == rec.Path {
			if err := os.Remove(full); err != nil && !os.IsNotExist(err) {
				return err
			}
			e.rep.event("removed", p, "", "removed %s: the note was trashed", p)
			continue
		}
		to := filepath.Join(e.o.Dir, filepath.FromSlash(conflictName(p)))
		b := d.raw
		if prev, err := os.ReadFile(to); err == nil {
			b = append(append(prev, '\n'), b...)
		}
		if err := writeAtomic(to, b); err != nil {
			return err
		}
		_ = os.Remove(full)
		e.rep.Conflicts++
		e.rep.event("conflict", p, "", "%s: the note was trashed while its file changed; the file is now %s", p, conflictName(p))
	}
	if !dry {
		e.st.NoteFiles = files
	}
	e.rep.Notes.Notes = len(paths)
	return nil
}

func (sn *standalone) movedFrom(nid string) string {
	for old, n := range sn.moved {
		if n == nid {
			return old
		}
	}
	return ""
}

// savedMeanwhile reports a note file whose bytes changed since the run read
// it (the checks of "Watch mode").
func (e *engine) savedMeanwhile(d *noteDoc) bool {
	b, err := os.ReadFile(filepath.Join(e.o.Dir, filepath.FromSlash(d.path)))
	return err != nil || string(b) != string(d.raw)
}

// holdNoteBases keeps, for the next sync, the base of notes whose file this
// run could not merge or write (stale, raced, read-only) in State.Held: the
// store moves on with the app's values, and the next sync merges the file
// against what it was written from.
func (e *engine) holdNoteBases() {
	if e.sn == nil {
		return
	}
	keep := map[string]bool{}
	for id := range e.sn.stale {
		keep[id] = true
	}
	for id := range e.sn.raced {
		keep[id] = true
	}
	if e.o.ReadOnly {
		for id, p := range e.sn.byID {
			if d := e.sn.disk[p]; d != nil {
				if rec := e.st.NoteFiles[id]; rec.Path != p || rec.Hash != hashOf(d.raw) {
					keep[id] = true
				}
			}
		}
	}
	for id := range keep {
		row, ok := e.base["note"][id]
		if !ok {
			continue
		}
		if e.st.Held == nil {
			e.st.Held = Store{}
		}
		if e.st.Held["note"] == nil {
			e.st.Held["note"] = map[string]Row{}
		}
		e.st.Held["note"][id] = row
	}
}

// standaloneStatus adds the note files changed or missing since the last
// sync to `ot vault status`.
func standaloneStatus(dir string, st *State, out *Status) {
	recorded := map[string]string{}
	for _, rec := range st.NoteFiles {
		recorded[rec.Path] = rec.Hash
	}
	_ = filepath.WalkDir(filepath.Join(dir, NotesDir), func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(d.Name(), ".md") || strings.HasSuffix(d.Name(), ".conflict.md") || strings.HasPrefix(d.Name(), ".") {
			return nil
		}
		rel := NotesDir + "/" + d.Name()
		b, err := os.ReadFile(p)
		if err != nil {
			return nil
		}
		if h, ok := recorded[rel]; !ok || h != hashOf(b) {
			out.Changed = append(out.Changed, rel)
		}
		delete(recorded, rel)
		return nil
	})
	for p := range recorded {
		out.Missing = append(out.Missing, p)
	}
}

// ---- the body's line merge (design D3) ----

// lineEdit replaces base lines [from, to) with lines.
type lineEdit struct {
	from, to int
	lines    []string
}

// merge3 merges two edits of base line by line: edits that touch different
// lines combine; overlapping different edits fail.
func merge3(base, a, b string) (string, bool) {
	if a == b {
		return a, true
	}
	bl, al, cl := strings.Split(base, "\n"), strings.Split(a, "\n"), strings.Split(b, "\n")
	ea, okA := lineEdits(bl, al)
	eb, okB := lineEdits(bl, cl)
	if !okA || !okB {
		return "", false
	}
	var out []string
	pos, i, j := 0, 0, 0
	for i < len(ea) || j < len(eb) {
		var next lineEdit
		switch {
		case j >= len(eb) || i < len(ea) && ea[i].from < eb[j].from && ea[i].to <= eb[j].from && !(ea[i].to == eb[j].from && ea[i].from == ea[i].to && eb[j].from == eb[j].to):
			next = ea[i]
			i++
		case i >= len(ea) || eb[j].from < ea[i].from && eb[j].to <= ea[i].from && !(eb[j].to == ea[i].from && eb[j].from == eb[j].to && ea[i].from == ea[i].to):
			next = eb[j]
			j++
		default:
			x, y := ea[i], eb[j]
			if x.from == y.from && x.to == y.to && equalStrings(x.lines, y.lines) {
				next = x
				i, j = i+1, j+1
				break
			}
			return "", false
		}
		out = append(out, bl[pos:next.from]...)
		out = append(out, next.lines...)
		pos = next.to
	}
	out = append(out, bl[pos:]...)
	return strings.Join(out, "\n"), true
}

// lineEdits are the edits that turn base into next, from their longest common
// subsequence of lines; too large a pair reports false.
func lineEdits(base, next []string) ([]lineEdit, bool) {
	n, m := len(base), len(next)
	if n*m > 4_000_000 {
		return nil, false
	}
	// lcs[i][j] is the LCS length of base[i:] and next[j:].
	lcs := make([][]int32, n+1)
	for i := range lcs {
		lcs[i] = make([]int32, m+1)
	}
	for i := n - 1; i >= 0; i-- {
		for j := m - 1; j >= 0; j-- {
			if base[i] == next[j] {
				lcs[i][j] = lcs[i+1][j+1] + 1
			} else if lcs[i+1][j] >= lcs[i][j+1] {
				lcs[i][j] = lcs[i+1][j]
			} else {
				lcs[i][j] = lcs[i][j+1]
			}
		}
	}
	var out []lineEdit
	i, j := 0, 0
	var cur *lineEdit
	flush := func() {
		if cur != nil {
			out = append(out, *cur)
			cur = nil
		}
	}
	for i < n || j < m {
		switch {
		case i < n && j < m && base[i] == next[j]:
			flush()
			i, j = i+1, j+1
		case j < m && (i == n || lcs[i][j+1] >= lcs[i+1][j]):
			if cur == nil {
				cur = &lineEdit{from: i, to: i}
			}
			cur.lines = append(cur.lines, next[j])
			j++
		default:
			if cur == nil {
				cur = &lineEdit{from: i, to: i}
			}
			cur.to = i + 1
			i++
		}
	}
	flush()
	return out, true
}
