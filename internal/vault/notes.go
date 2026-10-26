package vault

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/recurrence"
)

// noteFile is one task note read from the linked folder.
type noteFile struct {
	path string // slash-separated, relative to the folder
	raw  []byte
	f    *Front
	skip bool // an unknown or duplicate id: left as it is
}

// noteFields are the projections a note maps (design D5), compared in the
// note's value space (design D6).
var noteFields = []string{"title", "done", "donedate", "due", "deadline", "estimate", "priority", "recur", "labels", "note", "project"}

// tnConflictFile collects the conflicts of task notes, at the vault's root.
const tnConflictFile = "tasknotes.conflict.md"

// notesState is the TaskNotes part of one run.
type notesState struct {
	dir     string // the linked folder on this machine
	fence   string // its slash path below the vault folder, "" when outside
	set     *TNSettings
	notes   map[string]*noteFile // task notes by path
	plain   map[string]bool      // notes in the folder that are not task notes
	changed map[string]bool      // task notes whose bytes differ from the last write
	taskOf  map[string]string    // note path → task id
	ids     map[string]bool      // task ids that live in notes
	fresh   map[string]string    // note path → id of the task this run creates
	restore map[string]bool      // task ids whose deleted note is written again
	resumed map[string]bool      // task ids whose note left the archive this run
	linked  int                  // notes tracked for the first time this run
}

// loadNotes resolves the linked folder and reads the TaskNotes settings
// before anything is pulled or written.
func (e *engine) loadNotes() error {
	tn := e.st.TaskNotes
	if tn == nil {
		return nil
	}
	ns := &notesState{dir: tn.Dir(e.o.Dir), notes: map[string]*noteFile{}, plain: map[string]bool{}, changed: map[string]bool{},
		taskOf: map[string]string{}, ids: map[string]bool{}, fresh: map[string]string{}, restore: map[string]bool{}, resumed: map[string]bool{}}
	if fi, err := os.Stat(ns.dir); err != nil || !fi.IsDir() {
		return fmt.Errorf("%w: %s; run `ot vault tasknotes --off` to unlink it", errNoFolder, ns.dir)
	}
	vabs, _ := filepath.Abs(e.o.Dir)
	nabs, _ := filepath.Abs(ns.dir)
	if rel, err := filepath.Rel(vabs, nabs); err == nil && rel != "." && !strings.HasPrefix(rel, "..") {
		ns.fence = filepath.ToSlash(rel)
	}
	set, found, err := LoadTNSettings(ns.dir)
	if err != nil {
		return err
	}
	if !found {
		e.rep.warn("no TaskNotes settings (%s) above %s; TaskNotes' defaults are used", tnSettingsFile, ns.dir)
	}
	ns.set = set
	e.tn = ns
	return nil
}

// notePath is how output names a note: below the vault folder when the
// linked folder is, else in the linked folder.
func (e *engine) notePath(p string) string {
	if e.tn.fence != "" {
		return e.tn.fence + "/" + p
	}
	return filepath.ToSlash(filepath.Join(e.tn.dir, filepath.FromSlash(p)))
}

// scanNotes reads the linked folder (design D2): every `.md` file outside
// hidden folders, the vault folder itself left out, task notes kept.
func (e *engine) scanNotes() error {
	ns := e.tn
	if ns == nil {
		return nil
	}
	vabs, _ := filepath.Abs(e.o.Dir)
	root, _ := filepath.Abs(ns.dir)
	var paths []string
	raw := map[string][]byte{}
	err := filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			if p != root && (strings.HasPrefix(d.Name(), ".") || p == vabs) {
				return filepath.SkipDir
			}
			return nil
		}
		if !d.Type().IsRegular() || !strings.HasSuffix(d.Name(), ".md") || strings.HasSuffix(d.Name(), ".conflict.md") {
			return nil
		}
		rel, _ := filepath.Rel(root, p)
		rel = filepath.ToSlash(rel)
		b, err := os.ReadFile(p)
		if err != nil {
			return err
		}
		paths = append(paths, rel)
		raw[rel] = b
		return nil
	})
	if err != nil {
		return err
	}
	sort.Strings(paths)
	for _, p := range paths {
		b := raw[p]
		h := hashOf(b)
		unchanged := e.st.TaskNotes.Hashes[p] == h
		if !unchanged && len(b) > MaxFileBytes {
			return &LimitError{Msg: fmt.Sprintf("%s is larger than 1 MB, the limit for a vault file", e.notePath(p))}
		}
		f := ParseFront(string(b))
		if !ns.set.isTaskNote(f) {
			ns.plain[p] = true
			continue
		}
		if !unchanged && len(strings.Trim(f.Body, "\n")) > MaxNoteBytes {
			return &LimitError{Msg: fmt.Sprintf("%s: the note is larger than 64 KB, the limit for a note", e.notePath(p))}
		}
		ns.notes[p] = &noteFile{path: p, raw: b, f: f}
		if !unchanged {
			ns.changed[p] = true
		}
	}
	return nil
}

// matchNotes finds each note's task by `opentodo-id`: an unknown id is
// reported and its note left alone, a second note with the same id too.
func (e *engine) matchNotes() {
	ns := e.tn
	if ns == nil {
		return
	}
	seen := map[string]string{}
	for _, p := range sortedKeys(ns.notes) {
		n := ns.notes[p]
		id := n.f.str(keyID)
		switch {
		case id == "":
			continue
		case seen[id] != "":
			if ns.changed[p] {
				e.rep.warn("%s: the task %s already has the note %s; this note is left as it is", e.notePath(p), short(id), e.notePath(seen[id]))
			}
			n.skip = true
			continue
		case e.app.Get("task", id) == nil && e.base.Get("task", id) == nil:
			if ns.changed[p] {
				e.rep.warn("%s: the task id %s is not in the account; the note is left as it is", e.notePath(p), id)
			}
			n.skip = true
			continue
		}
		seen[id] = p
		ns.taskOf[p] = id
		ns.ids[id] = true
		if e.st.Printed[id] != "" {
			// A task that had a line now lives in its note: its file is printed
			// again without the line.
			e.retouch[e.app.Get("task", id).Str("project_id")] = true
		}
	}
	for id := range e.st.TaskNotes.Notes {
		ns.ids[id] = true
	}
}

// mergeNotes turns the differences of changed notes from the base into
// pending values, creates the tasks of new notes and handles deleted notes.
func (e *engine) mergeNotes(m *mergeRun) error {
	ns := e.tn
	if ns == nil {
		return nil
	}
	tn := e.st.TaskNotes
	for _, p := range sortedKeys(ns.notes) {
		n := ns.notes[p]
		if n.skip {
			continue
		}
		id := ns.taskOf[p]
		if ns.set.archived(n.f) {
			if id != "" {
				if !tn.Archived[id] {
					e.rep.event("archived", e.notePath(p), id, "%s is archived in TaskNotes; it is not synced until the archive tag is removed", e.notePath(p))
				}
				tn.Archived[id], tn.Notes[id] = true, p
			}
			continue
		}
		if id == "" {
			id = e.newID("task", "tasknotes:"+p)
			ns.fresh[p], ns.taskOf[p], ns.ids[id] = id, id, true
			tn.Notes[id] = p
			e.fresh["task:"+id] = true
			if err := e.createNoteTask(m, n, id); err != nil {
				return err
			}
			continue
		}
		if old, ok := tn.Notes[id]; !ok {
			ns.linked++
		} else if old != p {
			e.rep.event("moved", e.notePath(p), id, "the note of %q is now %s", m.av.text("task", id, "title"), e.notePath(p))
		}
		tn.Notes[id] = p
		if tn.Archived[id] {
			// Back from the archive: the app's values are written to the note.
			delete(tn.Archived, id)
			ns.resumed[id] = true
			e.rep.event("unarchived", e.notePath(p), id, "%s left the archive; it is synced again", e.notePath(p))
			continue
		}
		if ns.changed[p] {
			if err := e.mergeNote(m, n, id); err != nil {
				return err
			}
		}
	}
	e.deletedNotes(m)
	if ns.linked > 0 {
		e.rep.event("notes", "", "", "%d task notes from %s are in sync", ns.linked, ns.dir)
	}
	return nil
}

// deletedNotes handles tracked notes no longer in the folder (design D7): a
// note deleted with its task unchanged in the app trashes the task, one whose
// task changed is written again; a note that is no longer a task note, or
// that left the folder archived, stops syncing.
func (e *engine) deletedNotes(m *mergeRun) {
	ns, tn := e.tn, e.st.TaskNotes
	found := map[string]bool{}
	for _, id := range ns.taskOf {
		found[id] = true
	}
	for _, id := range sortedKeys(tn.Notes) {
		p := tn.Notes[id]
		if found[id] {
			continue
		}
		title := m.av.text("task", id, "title")
		switch {
		case ns.plain[p]:
			e.rep.warn("%s is no longer a task note; its task %q stays in the account and the note is no longer synced", e.notePath(p), title)
			e.unlinkNote(id)
			continue
		case tn.Archived[id]:
			e.unlinkNote(id)
			continue
		}
		a, b := e.app.Get("task", id), e.base.Get("task", id)
		if !a.Live() {
			e.unlinkNote(id)
			continue
		}
		if b == nil || !sameProj(e.proj(m.bv, id), e.proj(m.av, id)) {
			ns.restore[id] = true
			e.rep.event("restored", e.notePath(p), id, "%q changed in the app, so its note was written back to %s", title, e.notePath(p))
			continue
		}
		e.body("task", id)["deleted_at"] = e.nowMS()
		e.rep.Trashed++
		e.rep.event("trashed", e.notePath(p), id, "trashed %q: its note %s was deleted", title, e.notePath(p))
		e.unlinkNote(id)
	}
}

// unlinkNote stops syncing a task's note. A task still in the account lives
// in its project file from now on, so that file is printed again.
func (e *engine) unlinkNote(id string) {
	tn := e.st.TaskNotes
	if p, ok := tn.Notes[id]; ok {
		delete(tn.Hashes, p)
	}
	delete(tn.Notes, id)
	delete(tn.Archived, id)
	delete(e.tn.ids, id)
	if r := e.app.Get("task", id); r.Live() {
		e.retouch[r.Str("project_id")] = true
	}
}

// noteProj projects a task of a view onto the note fields, each value as the
// note would read back what the vault writes for it (design D6).
func (e *engine) noteProj(v *view, id string) map[string]string {
	p := e.proj(v, id)
	set := e.tn.set
	n, _ := strconv.Atoi(p["priority"])
	out := map[string]string{
		"title": p["title"], "done": p["done"], "donedate": p["donedate"], "due": noteDueKey(p["due"]),
		"deadline": p["deadline"], "estimate": p["estimate"], "priority": strconv.Itoa(set.priorityOf(set.priorityValue(n))),
		"recur": recurRoundTrip(p["recur"], dueDate(p["due"])), "labels": p["labels"], "note": normBody(p["note"]),
		"project": p["project"],
	}
	return out
}

// noteDueKey is a due key without its time zone: a note's scheduled value
// has none.
func noteDueKey(k string) string {
	if k == "" {
		return ""
	}
	parts := strings.SplitN(k, "|", 3)
	if len(parts) < 2 {
		return parts[0] + "||"
	}
	return parts[0] + "|" + parts[1] + "|"
}

func dueDate(k string) string {
	d, _, _ := strings.Cut(k, "|")
	return d
}

// normBody is a note body or description as the merge compares it.
func normBody(s string) string {
	return strings.Trim(strings.ReplaceAll(s, "\r\n", "\n"), "\n")
}

// recurRoundTrip is the rule as it reads back from the RRULE the vault
// writes for it; a rule without an exact RRULE stays as it is.
func recurRoundTrip(rule, due string) string {
	if rule == "" {
		return ""
	}
	r, err := recurrence.Parse(rule)
	if err != nil {
		return rule
	}
	back, ok := recurrence.FromRRULE(r.RRULE(), due)
	if !ok {
		return rule
	}
	out := back.Canonical()
	if r.AfterCompletion() && !back.AfterCompletion() {
		out = withAfterCompletion(out)
	}
	return out
}

// withAfterCompletion makes a canonical rule completion-relative.
func withAfterCompletion(rule string) string {
	at := len(rule)
	for _, sep := range []string{" until ", " for "} {
		if i := strings.Index(rule, sep); i >= 0 && i < at {
			at = i
		}
	}
	if c, err := recurrence.Canonicalize(rule[:at] + " after completion" + rule[at:]); err == nil {
		return c
	}
	return rule
}

var (
	noteDateRe     = regexp.MustCompile(`^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$`)
	wikiLinkRe     = regexp.MustCompile(`^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]$`)
	dtstartPrefixR = regexp.MustCompile(`^(?i:DTSTART[^:]*:[0-9TZ]+;)`)
)

// noteRead projects a note onto the note fields. A value the vault cannot
// read is reported and left out, so the task keeps its value.
func (e *engine) noteRead(m *mergeRun, n *noteFile, id string, baseP map[string]string, quiet bool) map[string]string {
	set := e.tn.set
	disp := e.notePath(n.path)
	bad := func(format string, args ...any) {
		if !quiet {
			e.rep.warn("%s: %s", disp, fmt.Sprintf(format, args...))
		}
	}
	f := n.f
	out := map[string]string{}
	field := func(name string) (*frontKey, string, bool) {
		k := set.key(name)
		fk := f.get(k)
		if fk != nil && fk.Kind == kindUnsupported {
			bad("%s is in a form the vault does not read; it is read-only for this note", k)
			return nil, k, false
		}
		return fk, k, true
	}
	if fk, _, ok := field("title"); ok {
		if fk != nil && fk.Kind == kindScalar && strings.TrimSpace(fk.Scalar) != "" {
			out["title"] = fk.Scalar
		} else {
			out["title"] = stem(n.path)
		}
	}
	if fk, _, ok := field("status"); ok {
		out["done"] = boolStr(fk != nil && fk.Kind == kindScalar && set.completed(fk.Scalar))
	}
	if fk, k, ok := field("completedDate"); ok && out["done"] == "true" && fk != nil && fk.Kind == kindScalar {
		if mm := noteDateRe.FindStringSubmatch(fk.Scalar); mm != nil && validDate(mm[1]) {
			out["donedate"] = mm[1]
		} else {
			bad("%s %s is not a date", k, fk.Scalar)
		}
	}
	if fk, k, ok := field("scheduled"); ok {
		switch {
		case fk == nil || fk.Kind == kindNull || fk.Kind == kindScalar && fk.Scalar == "":
			out["due"] = ""
		case fk.Kind != kindScalar:
			bad("%s is not a date", k)
		default:
			mm := noteDateRe.FindStringSubmatch(fk.Scalar)
			if mm == nil || !validDate(mm[1]) {
				bad("%s %s is not a date", k, fk.Scalar)
				break
			}
			t := ""
			if mm[2] != "" {
				t = mm[2] + ":" + mm[3]
				if !clockRe.MatchString(t) {
					bad("%s %s is not a time between 00:00 and 23:59", k, fk.Scalar)
					break
				}
			}
			out["due"] = mm[1] + "|" + t + "|"
		}
	}
	if fk, k, ok := field("due"); ok {
		switch {
		case fk == nil || fk.Kind == kindNull || fk.Kind == kindScalar && fk.Scalar == "":
			out["deadline"] = ""
		case fk.Kind != kindScalar:
			bad("%s is not a date", k)
		default:
			if mm := noteDateRe.FindStringSubmatch(fk.Scalar); mm != nil && validDate(mm[1]) {
				out["deadline"] = mm[1]
			} else {
				bad("%s %s is not a date", k, fk.Scalar)
			}
		}
	}
	if fk, k, ok := field("timeEstimate"); ok {
		switch {
		case fk == nil || fk.Kind == kindNull || fk.Kind == kindScalar && (fk.Scalar == "" || fk.Scalar == "0"):
			out["estimate"] = ""
		default:
			mins, err := strconv.Atoi(strings.TrimSpace(fk.Scalar))
			if fk.Kind != kindScalar || err != nil || mins < 1 || mins > 7*24*60 {
				bad("%s %s is not a number of minutes from 1 to 10080", k, fk.Scalar)
				break
			}
			out["estimate"] = strconv.Itoa(mins)
		}
	}
	if fk, k, ok := field("priority"); ok {
		switch {
		case fk == nil || fk.Kind == kindNull:
			out["priority"] = "4"
		case fk.Kind != kindScalar:
			bad("%s is not a priority", k)
		default:
			out["priority"] = strconv.Itoa(set.priorityOf(fk.Scalar))
		}
	}
	if fk, k, ok := field("recurrence"); ok {
		due := dueDate(out["due"])
		if _, has := out["due"]; !has && baseP != nil {
			due = dueDate(baseP["due"])
		}
		switch {
		case fk == nil || fk.Kind == kindNull || fk.Kind == kindScalar && fk.Scalar == "":
			out["recur"] = ""
		case fk.Kind != kindScalar:
			bad("%s is not a rule", k)
		default:
			rr := dtstartPrefixR.ReplaceAllString(strings.TrimSpace(fk.Scalar), "")
			rr = strings.TrimPrefix(rr, "RRULE:")
			rule, ok := recurrence.FromRRULE(rr, due)
			if !ok {
				bad("%s %s is a rule OpenTodo cannot express; it is read-only for this note", k, fk.Scalar)
				break
			}
			out["recur"] = rule.Canonical()
			if strings.EqualFold(f.str(set.key("recurrenceAnchor")), "completion") && !rule.AfterCompletion() {
				out["recur"] = withAfterCompletion(out["recur"])
			}
		}
	}
	if f.supported("tags") && f.supported(set.key("contexts")) {
		out["labels"] = e.fileLabels(m, e.noteLabelNames(f))
	} else {
		bad("tags or %s are in a form the vault does not read; the labels are read-only for this note", set.key("contexts"))
	}
	out["note"] = normBody(f.Body)
	if fk, k, ok := field("projects"); ok {
		switch {
		case fk == nil || fk.Kind == kindNull:
			out["project"] = ""
		default:
			pid, _ := e.noteProject(m.av, f.strings(k))
			out["project"] = pid
		}
	}
	if m.av.undecryptable["task:"+id+":title"] {
		delete(out, "title")
	}
	if m.av.undecryptable["task:"+id+":description"] {
		delete(out, "note")
	}
	return out
}

// noteLabelNames are the label names of a note: its tags other than the task
// and archive tags and empty ones, then its contexts.
func (e *engine) noteLabelNames(f *Front) []string {
	set := e.tn.set
	skip := map[string]bool{strings.ToLower(set.TaskTag): true, strings.ToLower(normTag(set.key("archiveTag"))): true, "": true}
	var out []string
	for _, t := range f.strings("tags") {
		t = normTag(t)
		if skip[strings.ToLower(t)] {
			continue
		}
		out = append(out, t)
	}
	for _, c := range f.strings(set.key("contexts")) {
		if c = normTag(c); c != "" {
			out = append(out, c)
		}
	}
	return out
}

// linkTarget is the note a project link names: `[[Home]]`, `[[Work/Launch|L]]`
// or a plain name.
func linkTarget(s string) string {
	s = strings.TrimSpace(s)
	if m := wikiLinkRe.FindStringSubmatch(s); m != nil {
		s = m[1]
	}
	return strings.TrimSuffix(path.Base(strings.TrimSpace(s)), ".md")
}

// noteProject finds the project of a note's project links: the first link
// that names a project file of the vault (by its file name) or a project.
// It returns the project and the index of that link (-1 for none).
func (e *engine) noteProject(v *view, links []string) (string, int) {
	byName := map[string]string{}
	layout := v.Layout()
	for _, pid := range sortedKeys(layout) {
		if pid == "" {
			continue
		}
		byName[strings.ToLower(stem(layout[pid]))] = pid
	}
	for _, pid := range sortedKeys(layout) {
		if pid == "" {
			continue
		}
		if n := strings.ToLower(v.text("project", pid, "name")); byName[n] == "" {
			byName[n] = pid
		}
	}
	for i, l := range links {
		if pid, ok := byName[strings.ToLower(linkTarget(l))]; ok {
			return pid, i
		}
	}
	return "", -1
}

// mergeNote merges one changed note into its task (design D6).
func (e *engine) mergeNote(m *mergeRun, n *noteFile, id string) error {
	a, b := e.app.Get("task", id), e.base.Get("task", id)
	appP := e.noteProj(m.av, id)
	baseP := appP
	if b != nil {
		baseP = e.noteProj(m.bv, id)
	}
	fileP := e.noteRead(m, n, id, baseP, false)
	disp := e.notePath(n.path)
	if !a.Live() {
		// Trashed in the app: planNotes keeps the edited note and reports it.
		return nil
	}
	var changed, both []string
	for _, f := range noteFields {
		fv, ok := fileP[f]
		if !ok || fv == baseP[f] || fv == appP[f] {
			continue
		}
		if appP[f] != baseP[f] {
			both = append(both, f)
			continue
		}
		changed = append(changed, f)
	}
	if len(both) > 0 {
		e.noteConflict(n, both, fileP)
	}
	body := map[string]any{}
	for _, f := range changed {
		e.noteSet(m, body, f, fileP, n)
	}
	title := m.av.text("task", id, "title")
	instance := e.noteInstance(n, id, body)
	if len(body) > 0 {
		dst := e.body("task", id)
		for k, v := range body {
			dst[k] = v
		}
		switch {
		case e.recurring(m, id, dst):
			e.rep.event("completed", disp, id, "completed %q; the next one is in the note", title)
		case fileP["done"] == "true" && appP["done"] == "false" && contains(changed, "done"):
			e.rep.event("completed", disp, id, "completed %q", title)
		case fileP["done"] == "false" && appP["done"] == "true" && contains(changed, "done"):
			e.rep.event("reopened", disp, id, "reopened %q", title)
		default:
			what := strings.Join(changed, ", ")
			if instance {
				what = strings.TrimPrefix(what+", completed instance", ", ")
			}
			e.rep.event("updated", disp, id, "updated %q (%s)", title, what)
		}
		e.rep.Updated++
	}
	return e.mergeTimeEntries(m, n, id)
}

func contains(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}

// noteInstance completes the current occurrence of a recurring task when the
// note's completed instances newly list its date (design D5).
func (e *engine) noteInstance(n *noteFile, id string, body map[string]any) bool {
	a := e.app.Get("task", id)
	if a.Str("recurrence") == "" || a.Set("completed_at") {
		return false
	}
	if _, set := body["completed_at"]; set {
		return false
	}
	k := e.tn.set.key("completeInstances")
	if !n.f.supported(k) {
		return false
	}
	d := a.DueOf()
	if d == nil {
		return false
	}
	for _, inst := range n.f.strings(k) {
		mm := noteDateRe.FindStringSubmatch(strings.TrimSpace(inst))
		if mm == nil || mm[1] != d.Date {
			continue
		}
		if r := e.app.Get("task", occurrenceID(id, d.Date)); r != nil && r.Set("completed_at") {
			return false
		}
		body["completed_at"], body["completed_by"] = e.nowMS(), nullable(e.o.UserID)
		return true
	}
	return false
}

// noteDoneAt is the completion time of a completed note: 12:00 local on its
// completed date, else now.
func (e *engine) noteDoneAt(fileP map[string]string) int64 {
	if t, err := time.ParseInLocation("2006-01-02", fileP["donedate"], e.o.Loc); err == nil {
		return t.Add(12 * time.Hour).UnixMilli()
	}
	return e.nowMS()
}

// noteSet sets the op value of one changed note field.
func (e *engine) noteSet(m *mergeRun, b map[string]any, f string, fileP map[string]string, n *noteFile) {
	v := fileP[f]
	switch f {
	case "title":
		b["title"] = v
	case "done":
		if v == "true" {
			b["completed_at"], b["completed_by"] = e.noteDoneAt(fileP), nullable(e.o.UserID)
		} else {
			b["completed_at"], b["completed_by"] = nil, nil
		}
	case "donedate":
		if fileP["done"] == "true" {
			b["completed_at"] = e.noteDoneAt(fileP)
		}
	case "due":
		if v == "" {
			b["due"] = nil
			break
		}
		parts := strings.SplitN(v, "|", 3)
		d := Due{Date: parts[0]}
		if len(parts) > 1 && parts[1] != "" {
			t := parts[1]
			d.Time = &t
		}
		b["due"] = d
	case "deadline":
		b["deadline"] = nullable(v)
	case "estimate":
		if mins, err := strconv.Atoi(v); err == nil {
			b["estimate_minutes"] = mins
		} else {
			b["estimate_minutes"] = nil
		}
	case "priority":
		p, _ := strconv.Atoi(v)
		b["priority"] = p
	case "recur":
		b["recurrence"] = nullable(v)
	case "labels":
		out := []string{}
		for _, id := range strings.Split(v, ",") {
			if strings.HasPrefix(id, "new:") {
				id = e.labelFor(m, strings.TrimPrefix(id, "new:"))
			}
			if id != "" {
				out = append(out, id)
			}
		}
		b["labels"] = out
	case "note":
		b["description"] = v
	case "project":
		b["project_id"] = nullable(v)
		b["section_id"] = nil
	}
}

// createNoteTask creates the task of a note without an id.
func (e *engine) createNoteTask(m *mergeRun, n *noteFile, id string) error {
	fileP := e.noteRead(m, n, id, nil, false)
	b := e.body("task", id)
	created := e.nowMS()
	if t, err := time.Parse(time.RFC3339Nano, n.f.str(e.tn.set.key("dateCreated"))); err == nil {
		created = t.UnixMilli()
	}
	b["title"], b["description"], b["project_id"], b["parent_id"], b["section_id"] = stem(n.path), "", nil, nil, nil
	b["priority"], b["due"], b["labels"], b["created_at"], b["completed_at"], b["deleted_at"] = 4, nil, []string{}, created, nil, nil
	b["estimate_minutes"], b["deadline"], b["start"], b["evening"], b["blocked_by"], b["recurrence"] = nil, nil, nil, false, []string{}, nil
	b["position"] = e.nextPosition(fileP["project"])
	for _, f := range noteFields {
		if _, ok := fileP[f]; ok && f != "donedate" {
			e.noteSet(m, b, f, fileP, n)
		}
	}
	e.rep.Created++
	e.rep.event("created", e.notePath(n.path), id, "created %q from %s", fileP["title"], e.notePath(n.path))
	return e.mergeTimeEntries(m, n, id)
}

// nextPosition is a position after every task of a project.
func (e *engine) nextPosition(project string) float64 {
	pos := 0.0
	for _, id := range e.app.IDs("task") {
		r := e.app.Get("task", id)
		if r.Str("project_id") == project && r.Num("position") >= pos {
			pos = r.Num("position") + 1000
		}
	}
	for _, b := range e.bodies["task"] {
		if bp, ok := b["position"].(float64); ok && bp >= pos {
			pos = bp + 1000
		}
	}
	return pos
}

// noteConflict records a note's conflicting values in tasknotes.conflict.md
// at the vault's root (design D6): the note, the fields and the lines the
// note held for them.
func (e *engine) noteConflict(n *noteFile, what []string, fileP map[string]string) {
	when := e.o.Now().In(e.o.Loc).Format("2006-01-02 15:04")
	lines := []string{fmt.Sprintf("## %s: %s, %s", e.notePath(n.path), strings.Join(what, ", "), when), ""}
	set := e.tn.set
	keyOf := map[string]string{"title": "title", "done": "status", "donedate": "completedDate", "due": "scheduled", "deadline": "due",
		"estimate": "timeEstimate", "priority": "priority", "recur": "recurrence", "project": "projects"}
	for _, f := range what {
		switch f {
		case "note":
			lines = append(lines, strings.Split(normBody(n.f.Body), "\n")...)
		case "labels":
			for _, k := range []string{"tags", set.key("contexts")} {
				if fk := n.f.get(k); fk != nil {
					lines = append(lines, n.f.Lines[fk.start:fk.end]...)
				}
			}
		default:
			if tk, ok := keyOf[f]; ok {
				if fk := n.f.get(set.key(tk)); fk != nil {
					lines = append(lines, n.f.Lines[fk.start:fk.end]...)
				}
			}
		}
	}
	if fileP == nil {
		lines = append(lines, "---")
		lines = append(lines, n.f.Lines...)
		lines = append(lines, "---")
		if b := normBody(n.f.Body); b != "" {
			lines = append(lines, b)
		}
	}
	e.conf[tnConflictFile] = append(e.conf[tnConflictFile], append(lines, "")...)
	e.rep.Conflicts++
	e.rep.event("conflict", tnConflictFile, "", "conflict in %s (%s); the note's values are in %s", e.notePath(n.path), strings.Join(what, ", "), tnConflictFile)
}

// planNotes writes the notes of tasks the app changed, inserts the id of new
// notes, writes back deleted notes and removes the notes of trashed tasks
// (design D5, D7). A dry run only lists the notes.
func (e *engine) planNotes(dry bool) error {
	ns := e.tn
	if ns == nil {
		return nil
	}
	tn := e.st.TaskNotes
	v := newView(e.app, e.o.Crypter, e.o.Loc, e.sharedSet())
	m := &mergeRun{av: v, bv: v, labels: v.labelSlugs(), newLabels: map[string]string{}}
	type write struct {
		p    string
		text string
	}
	var writes []write
	var removes []string
	for _, id := range sortedKeys(tn.Notes) {
		p := tn.Notes[id]
		if tn.Archived[id] {
			continue
		}
		n := ns.notes[p]
		a := e.app.Get("task", id)
		if !a.Live() {
			switch {
			case n == nil:
			case hashOf(n.raw) == tn.Hashes[p]:
				removes = append(removes, p)
				e.rep.event("removed", e.notePath(p), id, "removed %s: its task is in the app's trash", e.notePath(p))
			default:
				e.noteConflict(n, []string{"trashed in the app while the note was edited; the note is no longer synced"}, nil)
			}
			e.unlinkNote(id)
			continue
		}
		if e.o.ReadOnly && ns.changed[p] {
			continue // the note's edits are pending; it is left as it is
		}
		if n == nil {
			if !ns.restore[id] {
				continue
			}
			n = &noteFile{path: p, f: ParseFront("---\ntags:\n  - " + fmScalar(ns.set.TaskTag) + "\n---\n")}
		}
		text, ok := e.noteText(m, v, n, id)
		if !ok {
			tn.Hashes[p] = hashOf(n.raw)
			continue
		}
		writes = append(writes, write{p, text})
		tn.Hashes[p] = hashOf([]byte(text))
	}
	if dry {
		for _, w := range writes {
			e.rep.Files = append(e.rep.Files, e.notePath(w.p))
		}
		return nil
	}
	for _, w := range writes {
		if err := writeAtomic(filepath.Join(ns.dir, filepath.FromSlash(w.p)), []byte(w.text)); err != nil {
			return err
		}
		e.rep.Written++
		e.rep.event("written", e.notePath(w.p), "", "wrote %s", e.notePath(w.p))
	}
	for _, p := range removes {
		if err := os.Remove(filepath.Join(ns.dir, filepath.FromSlash(p))); err != nil && !errors.Is(err, fs.ErrNotExist) {
			return err
		}
	}
	return nil
}

// noteText is a note with the app's values written into the keys whose value
// differs, the id inserted into a new note and `dateModified` updated; ok is
// false when nothing changes.
func (e *engine) noteText(m *mergeRun, v *view, n *noteFile, id string) (string, bool) {
	set := e.tn.set
	f := n.f
	appP := e.noteProj(v, id)
	fileP := e.noteRead(m, n, id, appP, true)
	var edits []fmEdit
	edit := func(name string, lines []string) { edits = append(edits, fmEdit{name: name, lines: lines}) }
	remove := func(name string) {
		if f.get(name) != nil {
			edits = append(edits, fmEdit{name: name})
		}
	}
	var body *string
	r := v.s.Get("task", id)
	for _, fld := range noteFields {
		fv, ok := fileP[fld]
		if !ok || fv == appP[fld] {
			continue
		}
		if v.undecryptable["task:"+id+":title"] && fld == "title" || v.undecryptable["task:"+id+":description"] && fld == "note" {
			continue
		}
		av := appP[fld]
		switch fld {
		case "title":
			edit(set.key("title"), fmScalarLine(set.key("title"), av))
		case "done":
			if av == "true" {
				edit(set.key("status"), fmScalarLine(set.key("status"), set.doneStatus()))
				edit(set.key("completedDate"), fmRawLine(set.key("completedDate"), appP["donedate"]))
			} else {
				edit(set.key("status"), fmScalarLine(set.key("status"), set.openStatus()))
				remove(set.key("completedDate"))
			}
		case "donedate":
			if appP["done"] == "true" && fileP["done"] == "true" {
				edit(set.key("completedDate"), fmRawLine(set.key("completedDate"), av))
			}
		case "due":
			if av == "" {
				remove(set.key("scheduled"))
				break
			}
			parts := strings.SplitN(av, "|", 3)
			val := parts[0]
			if len(parts) > 1 && parts[1] != "" {
				val += "T" + parts[1]
			}
			edit(set.key("scheduled"), fmRawLine(set.key("scheduled"), val))
		case "deadline":
			if av == "" {
				remove(set.key("due"))
			} else {
				edit(set.key("due"), fmRawLine(set.key("due"), av))
			}
		case "estimate":
			if av == "" {
				remove(set.key("timeEstimate"))
			} else {
				edit(set.key("timeEstimate"), fmRawLine(set.key("timeEstimate"), av))
			}
		case "priority":
			p, _ := strconv.Atoi(av)
			edit(set.key("priority"), fmScalarLine(set.key("priority"), set.priorityValue(p)))
		case "recur":
			e.recurEdits(f, r, av, edit, remove)
		case "labels":
			e.labelEdits(v, f, r, edit)
		case "note":
			lead := ""
			if strings.HasPrefix(f.Body, "\n") || f.Body == "" {
				lead = "\n"
			}
			s := ""
			if av != "" {
				s = lead + av + "\n"
			}
			body = &s
		case "project":
			e.noteProjectEdits(v, f, av, edit, remove)
		}
	}
	e.instanceEdits(v, f, id, edit)
	e.timeEntryEdits(v, f, id, edit)
	mapped := len(edits) > 0 || body != nil
	if f.str(keyID) != id {
		edit(keyID, fmScalarLine(keyID, id))
	}
	if len(edits) == 0 && body == nil {
		return "", false
	}
	if mapped {
		// Only a changed value counts as a modification; the inserted id does not.
		edit(set.key("dateModified"), fmRawLine(set.key("dateModified"), e.o.Now().In(e.o.Loc).Format("2006-01-02T15:04:05.000-07:00")))
	}
	return f.apply(edits, body), true
}

// recurEdits writes a rule as an RRULE, keeping the note's DTSTART part, and
// the anchor when the rule repeats after completion.
func (e *engine) recurEdits(f *Front, r Row, rule string, edit func(string, []string), remove func(string)) {
	set := e.tn.set
	k, ak := set.key("recurrence"), set.key("recurrenceAnchor")
	if rule == "" {
		remove(k)
		return
	}
	pr, err := recurrence.Parse(rule)
	if err != nil {
		return
	}
	prefix := ""
	if m := dtstartPrefixR.FindString(strings.TrimSpace(f.str(k))); m != "" {
		prefix = m
	} else if d := r.DueOf(); d != nil {
		prefix = "DTSTART:" + strings.ReplaceAll(d.Date, "-", "") + ";"
	}
	edit(k, fmScalarLine(k, prefix+pr.RRULE()))
	switch {
	case pr.AfterCompletion():
		edit(ak, fmScalarLine(ak, "completion"))
	case strings.EqualFold(f.str(ak), "completion"):
		edit(ak, fmScalarLine(ak, "scheduled"))
	}
}

// labelEdits writes the task's labels: a label already in contexts stays
// there, the others go to tags; the task tag, empty entries and tags that
// are not labels' are kept.
func (e *engine) labelEdits(v *view, f *Front, r Row, edit func(string, []string)) {
	set := e.tn.set
	ck := set.key("contexts")
	labels := v.labelSlugs()
	byID := map[string]string{}
	for sl, lid := range labels {
		byID[lid] = sl
	}
	want := map[string]bool{}
	var wantOrder []string
	for _, lid := range r.Strs("labels") {
		if sl, ok := byID[lid]; ok && !want[sl] {
			want[sl] = true
			wantOrder = append(wantOrder, sl)
		}
	}
	keep := map[string]bool{strings.ToLower(set.TaskTag): true, strings.ToLower(normTag(set.key("archiveTag"))): true, "": true}
	placed := map[string]bool{}
	var ctx []string
	for _, c := range f.strings(ck) {
		sl := strings.ToLower(normTag(c))
		if want[sl] && !placed[sl] {
			ctx = append(ctx, c)
			placed[sl] = true
		}
	}
	var tags []string
	for _, t := range f.strings("tags") {
		sl := strings.ToLower(normTag(t))
		switch {
		case keep[sl] || strings.HasPrefix(sl, strings.ToLower(set.TaskTag)+"/"):
			tags = append(tags, t)
		case want[sl] && !placed[sl]:
			tags = append(tags, t)
			placed[sl] = true
		}
	}
	for _, sl := range wantOrder {
		if !placed[sl] {
			tags = append(tags, sl)
			placed[sl] = true
		}
	}
	if !equalStrings(tags, f.strings("tags")) {
		edit("tags", fmListLines("tags", tags, f.get("tags")))
	}
	if !equalStrings(ctx, f.strings(ck)) {
		if len(ctx) == 0 {
			edit(ck, nil)
		} else {
			edit(ck, fmListLines(ck, ctx, f.get(ck)))
		}
	}
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// projectEdits replaces the link that named the task's old project with a
// link to its project file; other links are kept.
func (e *engine) noteProjectEdits(v *view, f *Front, pid string, edit func(string, []string), remove func(string)) {
	k := e.tn.set.key("projects")
	links := append([]string(nil), f.strings(k)...)
	_, at := e.noteProject(v, links)
	link := ""
	if pid != "" {
		link = "[[" + stem(v.Layout()[pid]) + "]]"
	}
	switch {
	case at >= 0 && link != "":
		links[at] = link
	case at >= 0:
		links = append(links[:at], links[at+1:]...)
	case link != "":
		links = append([]string{link}, links...)
	}
	if len(links) == 0 {
		remove(k)
		return
	}
	edit(k, fmListLines(k, links, f.get(k)))
}

// instanceEdits appends the dates of occurrences completed in the app to the
// note's completed instances.
func (e *engine) instanceEdits(v *view, f *Front, id string, edit func(string, []string)) {
	k := e.tn.set.key("completeInstances")
	if !f.supported(k) {
		return
	}
	have := map[string]bool{}
	cur := f.strings(k)
	for _, d := range cur {
		if mm := noteDateRe.FindStringSubmatch(strings.TrimSpace(d)); mm != nil {
			have[mm[1]] = true
		}
	}
	var add []string
	for _, oid := range v.s.IDs("task") {
		r := v.s.Get("task", oid)
		if r.Str("series_id") != id || !r.Live() || !r.Set("completed_at") || r.Bool("skipped") {
			continue
		}
		d := r.DueOf()
		if d == nil || oid != occurrenceID(id, d.Date) || have[d.Date] {
			continue
		}
		have[d.Date] = true
		add = append(add, d.Date)
	}
	if len(add) == 0 {
		return
	}
	sort.Strings(add)
	edit(k, fmListLines(k, append(append([]string(nil), cur...), add...), f.get(k)))
}

// ---- time entries ----

// noteEntry is one time entry of a note.
type noteEntry struct {
	start, end int64 // end is -1 while the entry runs
	desc       string
	raw        fmMap
}

const tnTimeLayout = "2006-01-02T15:04:05.000Z"

func parseNoteTime(s string) (int64, bool) {
	t, err := time.Parse(time.RFC3339Nano, strings.TrimSpace(s))
	if err != nil {
		return 0, false
	}
	return t.UnixMilli(), true
}

// noteEntries reads a note's time entries; ok is false when the key is in a
// form the vault does not read.
func (e *engine) noteEntries(f *Front) ([]noteEntry, bool) {
	k := f.get(e.tn.set.key("timeEntries"))
	if k == nil || k.Kind == kindNull || k.Kind == kindList && len(k.List) == 0 {
		return nil, true
	}
	if k.Kind != kindMaps {
		return nil, false
	}
	var out []noteEntry
	for _, mp := range k.Maps {
		st, _ := mp.get("startTime")
		s, ok := parseNoteTime(st)
		if !ok {
			return nil, false
		}
		ne := noteEntry{start: s, end: -1, raw: mp}
		if et, has := mp.get("endTime"); has && strings.TrimSpace(et) != "" {
			en, ok := parseNoteTime(et)
			if !ok {
				return nil, false
			}
			ne.end = en
		}
		ne.desc, _ = mp.get("description")
		out = append(out, ne)
	}
	return out, true
}

// appEntries lists the live time entries of a task in a store, by start.
func appEntries(s Store, task string) map[int64]string {
	out := map[int64]string{}
	for _, eid := range s.IDs("time_entry") {
		r := s.Get("time_entry", eid)
		if r.Live() && r.Str("task_id") == task {
			out[int64(r.Num("started_at"))] = eid
		}
	}
	return out
}

func entryEnd(r Row) int64 {
	if !r.Set("ended_at") {
		return -1
	}
	return int64(r.Num("ended_at"))
}

// mergeTimeEntries merges a note's time entries (design D5): identity is the
// start time; the vault user's entries merge end time and description per
// field, other members' entries are read-only; an entry removed from the note
// is deleted when the app did not change it.
func (e *engine) mergeTimeEntries(m *mergeRun, n *noteFile, task string) error {
	list, ok := e.noteEntries(n.f)
	disp := e.notePath(n.path)
	if !ok {
		e.rep.warn("%s: %s is in a form the vault does not read; the time entries are read-only for this note", disp, e.tn.set.key("timeEntries"))
		return nil
	}
	appBy, baseBy := appEntries(e.app, task), appEntries(e.base, task)
	inNote := map[int64]bool{}
	for _, ne := range list {
		inNote[ne.start] = true
		aid, bid := appBy[ne.start], baseBy[ne.start]
		switch {
		case aid == "" && bid == "":
			eid := e.newID("time_entry", task, strconv.FormatInt(ne.start, 10))
			b := e.body("time_entry", eid)
			b["task_id"], b["user_id"], b["started_at"], b["device_id"] = task, e.o.UserID, ne.start, e.st.Device
			b["ended_at"], b["note"], b["created_at"], b["deleted_at"] = nil, ne.desc, e.nowMS(), nil
			if ne.end >= 0 {
				b["ended_at"] = ne.end
			}
			e.fresh["time_entry:"+eid] = true
			e.rep.event("time", disp, task, "added a time entry to %q", m.av.text("task", task, "title"))
		case aid == "":
			// Deleted in the app since the last sync: the app wins.
		default:
			ar := e.app.Get("time_entry", aid)
			br := e.base.Get("time_entry", aid)
			appEnd, appDesc := entryEnd(ar), m.av.text("time_entry", aid, "note")
			baseEnd, baseDesc := appEnd, appDesc
			if br != nil {
				baseEnd, baseDesc = entryEnd(br), m.bv.text("time_entry", aid, "note")
			}
			if ne.end == baseEnd && ne.desc == baseDesc || ne.end == appEnd && ne.desc == appDesc {
				continue
			}
			if ar.Str("user_id") != e.o.UserID {
				e.rep.warn("%s: a time entry of another member is read-only; the app's entry is written back", disp)
				continue
			}
			b := e.body("time_entry", aid)
			if ne.end != baseEnd && appEnd == baseEnd {
				if ne.end < 0 {
					b["ended_at"] = nil
				} else {
					b["ended_at"] = ne.end
				}
			}
			if ne.desc != baseDesc && appDesc == baseDesc && !m.av.undecryptable["time_entry:"+aid+":note"] {
				b["note"] = ne.desc
			}
		}
	}
	for start, aid := range appBy {
		if inNote[start] || baseBy[start] == "" {
			continue
		}
		ar, br := e.app.Get("time_entry", aid), e.base.Get("time_entry", aid)
		if ar.Str("user_id") != e.o.UserID || br == nil || !rowEqual(ar, br) {
			continue
		}
		e.body("time_entry", aid)["deleted_at"] = e.nowMS()
		e.rep.event("time", disp, task, "deleted a time entry of %q", m.av.text("task", task, "title"))
	}
	return nil
}

// timeEntryEdits writes the task's time entries in start order when they
// differ from the note's, keeping each matched entry's own text.
func (e *engine) timeEntryEdits(v *view, f *Front, task string, edit func(string, []string)) {
	list, ok := e.noteEntries(f)
	if !ok {
		return
	}
	k := e.tn.set.key("timeEntries")
	byStart := map[int64]noteEntry{}
	for _, ne := range list {
		byStart[ne.start] = ne
	}
	app := appEntries(v.s, task)
	starts := make([]int64, 0, len(app))
	for s := range app {
		starts = append(starts, s)
	}
	sort.Slice(starts, func(i, j int) bool { return starts[i] < starts[j] })
	var maps []fmMap
	same := len(starts) == len(list)
	for i, s := range starts {
		r := v.s.Get("time_entry", app[s])
		end, desc := entryEnd(r), v.text("time_entry", app[s], "note")
		if ne, ok := byStart[s]; ok && ne.end == end && ne.desc == desc {
			maps = append(maps, ne.raw)
			if same && list[i].start != s {
				same = false
			}
			continue
		}
		same = false
		mp := fmMap{Keys: []string{"startTime"}, Vals: map[string]string{"startTime": time.UnixMilli(s).UTC().Format(tnTimeLayout)}}
		if ne, ok := byStart[s]; ok {
			mp = fmMap{Keys: []string{"startTime"}, Vals: map[string]string{"startTime": ne.raw.Vals["startTime"]}}
		}
		if end >= 0 {
			mp.Keys = append(mp.Keys, "endTime")
			mp.Vals["endTime"] = time.UnixMilli(end).UTC().Format(tnTimeLayout)
		}
		if desc != "" {
			mp.Keys = append(mp.Keys, "description")
			mp.Vals["description"] = desc
		}
		maps = append(maps, mp)
	}
	if same {
		return
	}
	if len(maps) == 0 {
		if f.get(k) != nil {
			edit(k, nil)
		}
		return
	}
	edit(k, fmMapsLines(k, maps))
}

// noteTaskIDs are the tasks that live in notes, never printed as lines.
func (e *engine) noteTaskIDs() map[string]bool {
	if e.tn == nil {
		return nil
	}
	out := map[string]bool{}
	for id := range e.tn.ids {
		out[id] = true
	}
	for id := range e.st.TaskNotes.Notes {
		out[id] = true
	}
	return out
}
