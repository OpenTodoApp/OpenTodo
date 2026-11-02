package vault

import (
	"bytes"
	"errors"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
)

// build turns the pending values into ops, one timestamp per entity. Op ids
// come from the plaintext value and the base clock of the field, so a retried
// run sends the same ids (D6); content values are sealed for an encrypted
// account outside shared projects (D10).
func (e *engine) build() []Op {
	var ops []Op
	for _, key := range e.order {
		entity, id, _ := strings.Cut(key, ":")
		b := e.bodies[entity][id]
		if len(b) == 0 {
			continue
		}
		ts := e.clk.next()
		for _, f := range sortedKeys(b) {
			raw := jsonOf(b[f])
			base := e.base.Get(entity, id)[f]
			idValue := []byte(raw)
			if e.fresh[key] {
				// A new entity's id already names the run that made it; its
				// values (created_at) may differ on a retry.
				idValue = nil
			}
			oid := opID(e.st.Device, entity, id, f, string(base.V)+"@"+strconv.FormatInt(base.TS, 10)+"@"+base.D, idValue)
			if s, ok := b[f].(string); ok && e.sealing(entity, id, f, b) {
				sealed, err := e.o.Crypter.Seal(entity, id, f, s)
				if err != nil {
					e.rep.warn("could not encrypt the %s of %s %s; it is not sent", f, entity, short(id))
					continue
				}
				raw = jsonOf(sealed)
			}
			ops = append(ops, Op{ID: oid, Entity: entity, EntityID: id, Field: f, Value: raw, TS: ts, Device: e.st.Device})
		}
	}
	return ops
}

// sealing reports a content value to encrypt before it is sent.
func (e *engine) sealing(entity, id, field string, b map[string]any) bool {
	if e.o.Crypter == nil || !e2ee.IsContentField(entity, field) {
		return false
	}
	project := ""
	switch entity {
	case "project":
		project = id
	case "task", "section":
		project = e.app.Get(entity, id).Str("project_id")
		if p, ok := b["project_id"].(string); ok {
			project = p
		}
	case "time_entry":
		task := e.app.Get(entity, id).Str("task_id")
		if t, ok := b["task_id"].(string); ok {
			task = t
		}
		project = e.app.Get("task", task).Str("project_id")
		if tb := e.bodies["task"][task]; tb != nil {
			if p, ok := tb["project_id"].(string); ok {
				project = p
			}
		}
	}
	return e.scopeOf(project) == ""
}

// touched lists the projects whose file must be printed again: changed on
// disk, moved by the layout, missing, or with rows the sync changed.
func (e *engine) touched(v *view, layout, recorded map[string]string) map[string]bool {
	t := map[string]bool{}
	if !e.st.Initialized {
		for pid := range layout {
			t[pid] = true
		}
		return t
	}
	for p := range e.parsed {
		t[e.fileOf[p]] = true
	}
	for pid, p := range layout {
		if _, ok := e.disk[p]; !ok || recorded[pid] != p {
			t[pid] = true
		}
	}
	add := func(pid string) {
		if _, ok := layout[pid]; ok {
			t[pid] = true
		}
	}
	for entity := range kept {
		seen := map[string]bool{}
		for _, s := range []Store{e.base, e.app} {
			for id := range s[entity] {
				if seen[id] {
					continue
				}
				seen[id] = true
				b, a := e.base.Get(entity, id), e.app.Get(entity, id)
				if rowEqual(b, a) {
					continue
				}
				switch entity {
				case "task", "section", "field":
					add(b.Str("project_id"))
					add(a.Str("project_id"))
				case "project":
					add(id)
					add(b.Str("parent_id"))
					add(a.Str("parent_id"))
				case "time_entry":
					add(e.app.Get("task", a.Str("task_id")).Str("project_id"))
				case "label":
					for pid := range layout {
						t[pid] = true
					}
				}
			}
		}
	}
	return t
}

func rowEqual(a, b Row) bool {
	if len(a) != len(b) {
		return false
	}
	for k, f := range a {
		g, ok := b[k]
		if !ok || f.TS != g.TS || f.D != g.D || !bytes.Equal(f.V, g.V) {
			return false
		}
	}
	return true
}

func conflictName(p string) string { return strings.TrimSuffix(p, ".md") + ".conflict.md" }

// plan prints the touched project files and writes, moves and removes files
// (D3, D7, D8). A dry run only lists the files.
func (e *engine) plan(dry bool) error {
	v := newView(e.app, e.o.Crypter, e.o.Loc, e.sharedSet())
	layout := v.Layout()
	recorded := map[string]string{}
	for p, fs := range e.st.Files {
		recorded[fs.Project] = p
	}
	touched := e.touched(v, layout, recorded)
	for pid := range e.retouch {
		if _, ok := layout[pid]; ok {
			touched[pid] = true
		}
	}
	printedBefore := map[string]string{}
	for id, p := range e.st.Printed {
		printedBefore[id] = p
	}
	printed := func(id string) bool { return printedBefore[id] != "" }
	labels := v.labelSlugs()
	writes := map[string][]byte{}
	files := map[string]FileState{}
	for p, fs := range e.st.Files {
		files[p] = fs
	}
	var removes []string
	renames := map[string]string{}
	from := map[string][]string{} // written file → the files its lines moved from
	pids := sortedKeys(touched)
	for _, pid := range pids {
		if pid != "" && !v.projectLive(pid) {
			continue
		}
		target, old := layout[pid], recorded[pid]
		src := e.sourceOf(pid, old, target)
		if e.pending[src] || e.pending[old] || e.pending[target] {
			continue // not downloaded yet: neither read nor written
		}
		if e.o.ReadOnly && (e.changed[src] || e.changed[target]) {
			continue // the file's edits are pending; it is left as it is
		}
		var tmpl *Doc
		if d, ok := e.parsed[src]; ok {
			tmpl = d
		} else if b, ok := e.disk[src]; ok {
			tmpl = ParseDoc(string(b), e.sectionNames(v, pid))
		}
		doc := v.render(renderInput{project: pid, tmpl: tmpl, printed: printed, extra: e.st.Extra, labels: labels, skip: e.noteTaskIDs()})
		out := []byte(doc.Print())
		for id, p := range e.st.Printed {
			if p == src || p == old || p == target {
				delete(e.st.Printed, id)
			}
		}
		doc.Walk(func(_ *Block, _ *Node, n *Node) { e.st.Printed[n.Line.ID] = target })
		cur, onDisk := e.disk[target]
		if !onDisk || !bytes.Equal(cur, out) {
			writes[target] = out
			e.rep.Written++
			switch {
			case old == target && !onDisk:
				e.rep.event("restored", target, "", "restored %s from the app", target)
			default:
				e.rep.event("written", target, "", "wrote %s", target)
			}
		}
		for _, p := range []string{src, old} {
			if p != "" && p != target {
				delete(files, p)
				if _, ok := e.disk[p]; ok && (e.parsed[p] != nil || !e.changed[p]) {
					removes = append(removes, p)
					from[target] = append(from[target], p)
				}
			}
		}
		files[target] = FileState{Project: pid, Hash: hashOf(out)}
	}
	for _, p := range sortedKeys(e.st.Files) {
		fs := e.st.Files[p]
		if e.pending[p] || fs.Project == "" || v.projectLive(fs.Project) {
			continue
		}
		delete(files, p)
		b, onDisk := e.disk[p]
		switch {
		case !onDisk:
		case hashOf(b) == fs.Hash:
			removes = append(removes, p)
			e.rep.event("removed", p, "", "removed %s: the project is archived or trashed in the app", p)
		default:
			renames[p] = conflictName(p)
		}
	}
	// A file not downloaded yet keeps its project and loses its hash: once it
	// arrives it is read as changed and printed again.
	for p := range e.pending {
		if fs, ok := files[p]; ok {
			fs.Hash = ""
			files[p] = fs
		}
	}
	for p := range e.skip {
		delete(files, p)
		renames[p] = conflictName(p)
	}
	for _, from := range sortedKeys(renames) {
		to := renames[from]
		e.rep.Conflicts++
		e.rep.event("conflict", to, "", "the project of %s is archived or trashed in the app, and the file was edited; it is now %s", from, to)
	}
	e.rep.Projects, e.rep.Tasks = len(layout)-1, countTasks(e.app, e.st) // the Inbox is not a project
	if dry {
		for p := range writes {
			e.rep.Files = append(e.rep.Files, p)
		}
		for p := range e.conf {
			e.rep.Files = append(e.rep.Files, p)
		}
		sort.Strings(e.rep.Files)
		return nil
	}
	raced, err := e.apply(writes, removes, renames, from)
	if err != nil {
		return err
	}
	e.keepRaced(raced, files, printedBefore)
	e.st.Files = files
	return nil
}

// keepRaced leaves the files saved while the sync ran as the run found them
// in the state: their recorded hash and the lines printed in them stay as
// before the run, so the next sync reads the save as an edit and merges it
// against the values the file was printed from, like a file not downloaded
// yet (saveBase keeps those values).
func (e *engine) keepRaced(raced map[string]bool, files map[string]FileState, printedBefore map[string]string) {
	for p := range raced {
		e.raced[p] = true
		if was, ok := e.st.Files[p]; ok {
			files[p] = was
		} else if now, ok := files[p]; ok {
			now.Hash = ""
			files[p] = now
		}
	}
	if len(raced) == 0 {
		return
	}
	for id, p := range e.st.Printed {
		if raced[p] {
			if before := printedBefore[id]; before != "" {
				e.st.Printed[id] = before
			} else {
				delete(e.st.Printed, id)
			}
		}
	}
	for id, p := range printedBefore {
		if raced[p] {
			e.st.Printed[id] = p
		}
	}
}

// unchanged reports whether the file at full still holds what the sync read
// (had false: it was not there). It is checked right before a write or a
// remove, so a save made while the sync ran is never overwritten.
func unchanged(full string, read []byte, had bool) bool {
	b, err := os.ReadFile(full)
	if errors.Is(err, fs.ErrNotExist) {
		return !had
	}
	return err == nil && had && bytes.Equal(b, read)
}

// giveFreshIDs writes into a file saved during the run the ids this run gave
// to its new lines, matched by the line's text and occurrence, so the next
// sync does not create their tasks again. Everything else in the save is
// left for the next sync to merge.
func (e *engine) giveFreshIDs(p, full string) error {
	fresh := e.freshLines[p]
	if len(fresh) == 0 {
		return nil
	}
	cur, err := os.ReadFile(full)
	if err != nil {
		return nil // removed meanwhile: nothing to give
	}
	lines := strings.Split(string(cur), "\n")
	seen := map[string]int{}
	given := false
	for i, l := range lines {
		indent, done, content, ok := isTaskLine(strings.TrimSuffix(l, "\r"))
		if !ok || ParseLine(indent, done, content).ID != "" {
			continue
		}
		raw := strings.TrimSpace(l)
		seen[raw]++
		id := fresh[raw+"\x00"+strconv.Itoa(seen[raw])]
		if id == "" {
			continue
		}
		cr := ""
		if strings.HasSuffix(l, "\r") {
			cr = "\r"
		}
		lines[i] = strings.TrimRight(strings.TrimSuffix(l, "\r"), " \t") + " " + markID + " " + id + cr
		given = true
	}
	if !given || !unchanged(full, cur, true) {
		return nil
	}
	return writeAtomic(full, []byte(strings.Join(lines, "\n")))
}

// testHookBeforeWrite runs right before a sync writes the vault's files.
var testHookBeforeWrite func()

// sourceOf is the file on disk that holds a project's lines: the file parsed
// for it this run, else its recorded file, else the file at its new place.
func (e *engine) sourceOf(pid, old, target string) string {
	for _, p := range sortedKeys(e.parsed) {
		if e.fileOf[p] == pid {
			return p
		}
	}
	if _, ok := e.disk[old]; ok && old != "" {
		return old
	}
	if fs, ok := e.st.Files[target]; ok && fs.Project == pid {
		return target
	}
	return ""
}

func (e *engine) sectionNames(v *view, pid string) func(string) bool {
	names := map[string]bool{}
	for _, s := range v.sectionsOf(pid) {
		names[strings.ToLower(v.text("section", s, "name"))] = true
	}
	return func(n string) bool { return names[strings.ToLower(n)] }
}

// apply writes the planned files atomically, appends to conflict files and
// removes or renames what the plan says. Right before it writes or removes a
// file it checks that the file still holds what the sync read: a file saved
// meanwhile is left as it is, and so are the files its lines moved from
// (from). Those files are returned as raced.
func (e *engine) apply(writes map[string][]byte, removes []string, renames map[string]string, from map[string][]string) (map[string]bool, error) {
	if testHookBeforeWrite != nil {
		testHookBeforeWrite()
	}
	raced := map[string]bool{}
	race := func(p string) {
		raced[p] = true
		e.rep.event("skipped", p, "", "skipped %s: it was saved while the sync ran; the next sync merges it", p)
	}
	for _, p := range sortedKeys(writes) {
		full := filepath.Join(e.o.Dir, filepath.FromSlash(p))
		if read, had := e.disk[p]; !unchanged(full, read, had) {
			race(p)
			e.rep.Written--
			for _, src := range from[p] {
				raced[src] = true
			}
			if err := e.giveFreshIDs(p, full); err != nil {
				return nil, err
			}
			continue
		}
		if err := writeAtomic(full, writes[p]); err != nil {
			return nil, err
		}
	}
	for _, cp := range sortedKeys(e.conf) {
		full := filepath.Join(e.o.Dir, filepath.FromSlash(cp))
		prev, _ := os.ReadFile(full)
		if len(prev) > 0 && !bytes.HasSuffix(prev, []byte("\n")) {
			prev = append(prev, '\n')
		}
		if err := writeAtomic(full, append(prev, []byte(strings.Join(e.conf[cp], "\n")+"\n")...)); err != nil {
			return nil, err
		}
	}
	moved := map[string]bool{}
	for _, src := range sortedKeys(renames) {
		to := filepath.Join(e.o.Dir, filepath.FromSlash(renames[src]))
		// The file as it is now, with a save made during the sync.
		b, err := os.ReadFile(filepath.Join(e.o.Dir, filepath.FromSlash(src)))
		if err != nil {
			b = e.disk[src]
		}
		if prev, err := os.ReadFile(to); err == nil {
			b = append(append(prev, '\n'), b...)
		}
		if err := writeAtomic(to, b); err != nil {
			return nil, err
		}
		moved[src] = true
		removes = append(removes, src)
	}
	dirs := map[string]bool{}
	for _, p := range removes {
		if _, written := writes[p]; written || raced[p] {
			continue
		}
		full := filepath.Join(e.o.Dir, filepath.FromSlash(p))
		if _, err := os.Stat(full); errors.Is(err, fs.ErrNotExist) {
			continue // already removed (a path can be listed twice)
		}
		if read, had := e.disk[p]; !moved[p] && !unchanged(full, read, had) {
			race(p)
			continue
		}
		if err := os.Remove(full); err != nil && !os.IsNotExist(err) {
			return nil, err
		}
		for d := path.Dir(p); d != "." && d != "/"; d = path.Dir(d) {
			dirs[d] = true
		}
	}
	// Folders left empty by a move collapse (D3).
	ds := sortedKeys(dirs)
	sort.Slice(ds, func(i, j int) bool { return len(ds[i]) > len(ds[j]) })
	for _, d := range ds {
		_ = os.Remove(filepath.Join(e.o.Dir, filepath.FromSlash(d)))
	}
	return raced, nil
}

// writeAtomic writes a file through a temporary file and a rename.
func writeAtomic(p string, b []byte) error {
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return err
	}
	tmp := p + ".opentodo-tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, p)
}
