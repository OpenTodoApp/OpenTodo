package vault

// Writing task notes (OpenSpec change vault-tasknotes, design D4, D5, D7).

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/OpenTodoApp/opentodo/internal/recurrence"
)

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
