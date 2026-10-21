package vault

import (
	"fmt"
	"path"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/pixari/opentodo/internal/ids"
)

// place is where a task line sits in a parsed file.
type place struct {
	path    string
	project string
	parent  string // the task line it is nested under, "" at the top
	section string
	node    *Node
}

// mergeRun holds what one merge reads.
type mergeRun struct {
	av, bv     *view
	baseLayout map[string]string
	labels     map[string]string // app tag slug → label id
	newLabels  map[string]string // tag slug → id of a label this run creates
	sections   map[string]string // project\x00lower name → section id
	placed     map[string]place
	groups     map[string][]string // sibling group → task ids in file order
	groupKeys  []string
	moved      map[string]bool
}

func (e *engine) sharedSet() map[string]bool {
	out := map[string]bool{}
	for _, id := range e.st.Shared {
		out[id] = true
	}
	return out
}

// newID derives the id of an entity the vault creates from what made it, so
// a run retried after a crash creates the same ids (design D6).
func (e *engine) newID(kind string, parts ...string) string {
	return ids.NameID("vault-"+kind, e.st.Device+"\x00"+strconv.FormatInt(e.startCursor, 10)+"\x00"+strings.Join(parts, "\x00"))
}

// body returns the pending field values of an entity, creating it.
func (e *engine) body(entity, id string) map[string]any {
	byID := e.bodies[entity]
	if byID == nil {
		byID = map[string]map[string]any{}
		e.bodies[entity] = byID
	}
	b := byID[id]
	if b == nil {
		b = map[string]any{}
		byID[id] = b
		e.order = append(e.order, entity+":"+id)
	}
	return b
}

func (e *engine) nowMS() int64 { return e.o.Now().UnixMilli() }

// merge parses the changed files and turns their differences from the base
// into pending values (design D6, D7).
func (e *engine) merge() error {
	shared := e.sharedSet()
	m := &mergeRun{
		av: newView(e.app, e.o.Crypter, e.o.Loc, shared), bv: newView(e.base, e.o.Crypter, e.o.Loc, shared),
		newLabels: map[string]string{}, sections: map[string]string{}, placed: map[string]place{},
		groups: map[string][]string{}, moved: map[string]bool{},
	}
	m.baseLayout = m.bv.Layout()
	m.labels = m.av.labelSlugs()
	e.parsed, e.fileOf, e.skip = map[string]*Doc{}, map[string]string{}, map[string]bool{}
	e.mapFiles(m)
	if err := e.placeTasks(m); err != nil {
		return err
	}
	for _, p := range sortedKeys(m.placed) {
		if err := e.mergeTask(m, m.placed[p]); err != nil {
			return err
		}
	}
	e.removedLines(m)
	for _, k := range m.groupKeys {
		e.positions(m, m.groups[k])
	}
	return nil
}

func sortedKeys[V any](mp map[string]V) []string {
	out := make([]string, 0, len(mp))
	for k := range mp {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// mapFiles matches each changed file to its project by `opentodo-id`, makes
// projects for new files (shallow folders first, so a folder's project exists
// before its children) and applies renames, moves and front-matter edits.
func (e *engine) mapFiles(m *mergeRun) {
	paths := sortedKeys(e.changed)
	sort.SliceStable(paths, func(i, j int) bool { return strings.Count(paths[i], "/") < strings.Count(paths[j], "/") })
	claimed := map[string]bool{}
	var fresh []string
	front := map[string]*Doc{}
	for _, p := range paths {
		pre := ParseDoc(string(e.disk[p]), func(string) bool { return false })
		front[p] = pre
		switch {
		case p == InboxFile:
			e.fileOf[p] = ""
		case pre.ID != "" && e.app.Get("project", pre.ID) != nil && !claimed[pre.ID]:
			claimed[pre.ID] = true
			if !m.av.projectLive(pre.ID) {
				// Archived or trashed in the app: the file's edits are not merged
				// and it is renamed a conflict file (D7, last row).
				e.skip[p] = true
				continue
			}
			e.fileOf[p] = pre.ID
			e.projectEdits(m, p, pre)
		default:
			if pre.ID != "" {
				e.rep.warn("%s: the project id %s is not in the account; the file becomes a new project", p, short(pre.ID))
			}
			fresh = append(fresh, p)
		}
	}
	for _, p := range fresh {
		e.newProject(m, p)
	}
	for _, p := range paths {
		if e.skip[p] {
			continue
		}
		pid := e.fileOf[p]
		doc := ParseDoc(string(e.disk[p]), e.isSection(m, pid))
		doc.ID = pid
		e.parsed[p] = doc
	}
}

// isSection reports headings that name a live section of the project.
func (e *engine) isSection(m *mergeRun, pid string) func(string) bool {
	if pid == "" {
		return func(string) bool { return false }
	}
	names := map[string]bool{}
	for _, s := range m.av.sectionsOf(pid) {
		names[strings.ToLower(m.av.text("section", s, "name"))] = true
	}
	return func(n string) bool { return names[strings.ToLower(n)] }
}

// folderProject is the project a folder belongs to: the one whose file is the
// folder note `<dir>/<name>.md`, else the file `<name>.md` beside the folder.
func (e *engine) folderProject(dir string) string {
	if dir == "" || dir == "." {
		return ""
	}
	name := path.Base(dir)
	parent := path.Dir(dir)
	cands := []string{path.Join(dir, name+".md"), path.Join(parent, name+".md")}
	for _, c := range cands {
		c = strings.TrimPrefix(c, "./")
		if pid, ok := e.fileOf[c]; ok {
			return pid
		}
		if fs, ok := e.st.Files[c]; ok {
			if _, gone := e.disk[c]; gone || !e.changed[c] {
				return fs.Project
			}
		}
	}
	return ""
}

// parentDirOf is the folder whose project is a file's parent: the file's own
// folder, or for a folder note `X/X.md` the folder holding X.
func parentDirOf(p string) string {
	dir := path.Dir(p)
	if dir == "." {
		return ""
	}
	if path.Base(dir) == stem(p) {
		dir = path.Dir(dir)
		if dir == "." {
			return ""
		}
	}
	return dir
}

var colorRe = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

// projectEdits pushes a renamed file as the project's name, a moved file as
// its parent and edited front matter as its colour and icon.
func (e *engine) projectEdits(m *mergeRun, p string, d *Doc) {
	pid := d.ID
	if e.base.Get("project", pid) == nil {
		return
	}
	b := func() map[string]any { return e.body("project", pid) }
	name := stem(p)
	if bp, ok := m.baseLayout[pid]; ok && stem(bp) != name {
		baseName, appName := m.bv.text("project", pid, "name"), m.av.text("project", pid, "name")
		switch {
		case m.av.undecryptable["project:"+pid+":name"]:
		case appName != baseName && SafeName(appName) != name:
			e.rep.warn("%s: the project was renamed in the app and in the file; the app's name %q is kept", p, appName)
		case SafeName(appName) != name:
			b()["name"] = name
			e.rep.event("project", p, "", "renamed project %q to %q", appName, name)
		}
	}
	fileParent := e.folderProject(parentDirOf(p))
	baseParent, appParent := m.bv.parentOf(pid), m.av.parentOf(pid)
	if fileParent != baseParent && fileParent != appParent {
		switch {
		case appParent != baseParent:
			e.rep.warn("%s: the project was moved in the app and in the file; the app's place is kept", p)
		case e.projectCycle(pid, fileParent):
			e.rep.warn("%s: the folder would put the project inside itself; it is not moved", p)
		default:
			b()["parent_id"] = nullable(fileParent)
			e.rep.event("project", p, "", "moved project %q", m.av.text("project", pid, "name"))
		}
	}
	baseRow, appRow := e.base.Get("project", pid), e.app.Get("project", pid)
	if d.Color != baseRow.Str("color") && d.Color != "" && appRow.Str("color") == baseRow.Str("color") {
		if colorRe.MatchString(d.Color) {
			b()["color"] = d.Color
		} else {
			e.rep.warn("%s: %s %q is not a colour like #22c55e", p, keyColor, d.Color)
		}
	}
	if d.Icon != baseRow.Str("icon") && appRow.Str("icon") == baseRow.Str("icon") {
		b()["icon"] = nullable(d.Icon)
	}
}

// projectCycle reports whether parent is the project or one of its descendants.
func (e *engine) projectCycle(pid, parent string) bool {
	seen := map[string]bool{}
	for cur := parent; cur != ""; cur = e.app.Get("project", cur).Str("parent_id") {
		if cur == pid || seen[cur] {
			return true
		}
		seen[cur] = true
	}
	return false
}

func nullable(s string) any {
	if s == "" {
		return nil
	}
	return s
}

// newProject creates the project of a file without a known `opentodo-id`,
// named after the file and nested under its folder's project.
func (e *engine) newProject(m *mergeRun, p string) {
	id := e.newID("project", p)
	name := stem(p)
	parent := e.folderProject(parentDirOf(p))
	pos := 0.0
	for _, pid := range e.app.IDs("project") {
		r := e.app.Get("project", pid)
		if r.Str("parent_id") == parent && r.Num("position") >= pos {
			pos = r.Num("position") + 1000
		}
	}
	b := e.body("project", id)
	b["name"], b["color"], b["position"], b["archived"] = name, defaultColor(name), pos, false
	b["parent_id"], b["icon"], b["created_at"], b["deleted_at"] = nullable(parent), nil, e.nowMS(), nil
	e.fresh["project:"+id] = true
	e.fileOf[p] = id
	e.rep.event("project", p, "", "created project %q", name)
}

// sectionOf finds or creates the section a heading names.
func (e *engine) sectionOf(m *mergeRun, pid, name string) string {
	if pid == "" {
		return ""
	}
	key := pid + "\x00" + strings.ToLower(name)
	if id, ok := m.sections[key]; ok {
		return id
	}
	for _, s := range m.av.sectionsOf(pid) {
		if strings.EqualFold(m.av.text("section", s, "name"), name) {
			m.sections[key] = s
			return s
		}
	}
	id := e.newID("section", pid, strings.ToLower(name))
	pos := 0.0
	for _, s := range e.app.IDs("section") {
		if r := e.app.Get("section", s); r.Str("project_id") == pid && r.Num("position") >= pos {
			pos = r.Num("position") + 1000
		}
	}
	for _, s := range m.sections {
		if b := e.bodies["section"][s]; b != nil && b["project_id"] == pid {
			if bp, _ := b["position"].(float64); bp >= pos {
				pos = bp + 1000
			}
		}
	}
	b := e.body("section", id)
	b["name"], b["project_id"], b["position"], b["created_at"], b["deleted_at"], b["color"], b["icon"] = name, pid, pos, e.nowMS(), nil, nil, nil
	e.fresh["section:"+id] = true
	m.sections[key] = id
	e.rep.event("section", "", "", "created section %q", name)
	return id
}

// placeTasks gives new lines their ids, keeps lines with an unknown id as
// text, and records where every task line sits.
func (e *engine) placeTasks(m *mergeRun) error {
	seen := map[string]int{}
	taken := map[string]bool{}
	for _, p := range sortedKeys(e.parsed) {
		d := e.parsed[p]
		pid := e.fileOf[p]
		var unknown []string
		d.Walk(func(b *Block, parent, n *Node) {
			id := n.Line.ID
			switch {
			case id != "" && taken[id]:
				e.rep.warn("%s: the task %s appears twice; the second line becomes a new task", p, short(id))
				id = ""
			case id != "" && e.app.Get("task", id) == nil:
				e.rep.warn("%s: the task id %s is not in the account; the line is left as it is", p, id)
				unknown = append(unknown, id)
				return
			}
			if id == "" {
				raw := strings.TrimSpace(n.Raw)
				seen[p+"\x00"+raw]++
				id = e.newID("task", p, raw, strconv.Itoa(seen[p+"\x00"+raw]))
				n.Line.ID = id
				e.fresh["task:"+id] = true
			}
			taken[id] = true
		})
		demote(d, unknown)
		var walkErr error
		d.Walk(func(b *Block, parent, n *Node) {
			sec := ""
			if b.Heading {
				sec = e.sectionOf(m, pid, b.Section)
			}
			pl := place{path: p, project: pid, section: sec, node: n}
			key := p + "\x00top\x00" + sec
			if parent != nil {
				pl.parent = parent.Line.ID
				key = p + "\x00child\x00" + parent.Line.ID
			}
			if len(n.NoteText()) > MaxNoteBytes && walkErr == nil {
				walkErr = &LimitError{Msg: fmt.Sprintf("%s: the note of %q is larger than 64 KB, the limit for a note", p, n.Line.Title)}
			}
			m.placed[n.Line.ID] = pl
			if _, ok := m.groups[key]; !ok {
				m.groupKeys = append(m.groupKeys, key)
			}
			m.groups[key] = append(m.groups[key], n.Line.ID)
		})
		if walkErr != nil {
			return walkErr
		}
	}
	return nil
}

// demote turns the task lines with an unknown id into prose at their place:
// a top-level line where it stands, a nested one after its top-level task.
func demote(d *Doc, unknown []string) {
	if len(unknown) == 0 {
		return
	}
	bad := map[string]bool{}
	for _, id := range unknown {
		bad[id] = true
	}
	var prune func(n *Node) [][]string
	prune = func(n *Node) [][]string {
		var out [][]string
		kept := n.Children[:0]
		for _, c := range n.Children {
			if bad[c.Line.ID] {
				out = append(out, rawLines(c, ""))
				continue
			}
			out = append(out, prune(c)...)
			kept = append(kept, c)
		}
		n.Children = kept
		return out
	}
	for _, b := range d.Blocks {
		var items []Item
		for _, it := range b.Items {
			if it.Task == nil {
				items = append(items, it)
				continue
			}
			if bad[it.Task.Line.ID] {
				items = append(items, Item{Prose: rawLines(it.Task, "")})
				continue
			}
			items = append(items, it)
			for _, p := range prune(it.Task) {
				items = append(items, Item{Prose: p})
			}
		}
		b.Items = items
	}
}

// rawLines writes a node as it was in the file.
func rawLines(n *Node, indent string) []string {
	out := []string{indent + strings.TrimLeft(n.Raw, " \t")}
	for _, l := range n.Note {
		if strings.TrimSpace(l) == "" {
			out = append(out, "")
			continue
		}
		out = append(out, indent+"  "+noteToFile(l))
	}
	for _, c := range n.Children {
		out = append(out, rawLines(c, indent+"  ")...)
	}
	return out
}

// conflict appends a file line to the file's conflict file (D7).
func (e *engine) conflict(p, raw, what string) {
	cp := strings.TrimSuffix(p, ".md") + ".conflict.md"
	when := e.o.Now().In(e.o.Loc).Format("2006-01-02 15:04")
	e.conf[cp] = append(e.conf[cp], fmt.Sprintf("## %s, %s", what, when), "", strings.TrimLeft(raw, " \t"), "")
	e.rep.Conflicts++
	e.rep.event("conflict", cp, "", "conflict in %s (%s); the file's line is in %s", p, what, cp)
}

// removedLines handles tasks whose line left a changed file: trashed when the
// app did not change them, written back otherwise (D7, third row).
func (e *engine) removedLines(m *mergeRun) {
	children := map[string][]string{}
	for _, id := range e.app.IDs("task") {
		if r := e.app.Get("task", id); r.Live() && r.Str("parent_id") != "" {
			children[r.Str("parent_id")] = append(children[r.Str("parent_id")], id)
		}
	}
	for _, id := range sortedKeys(e.st.Printed) {
		p := e.st.Printed[id]
		if _, ok := e.parsed[p]; !ok || m.placed[id].node != nil {
			continue
		}
		b, a := e.base.Get("task", id), e.app.Get("task", id)
		if !a.Live() {
			continue
		}
		title := m.av.text("task", id, "title")
		if b != nil && b.Set("completed_at") && a.Set("completed_at") {
			// A completed line removed is only cleared from the file.
			delete(e.st.Printed, id)
			continue
		}
		if b == nil || !sameProj(e.proj(m.bv, id), e.proj(m.av, id)) {
			e.rep.event("restored", p, id, "%q changed in the app, so its line was written back to %s", title, p)
			continue
		}
		var trash func(id string)
		trash = func(id string) {
			if m.placed[id].node != nil || e.bodies["task"][id]["deleted_at"] != nil {
				return
			}
			e.body("task", id)["deleted_at"] = e.nowMS()
			e.rep.Trashed++
			e.rep.event("trashed", p, id, "trashed %q", m.av.text("task", id, "title"))
			for _, c := range children[id] {
				trash(c)
			}
		}
		trash(id)
	}
}

func sameProj(a, b map[string]string) bool {
	if len(a) != len(b) {
		return false
	}
	for k, v := range a {
		if b[k] != v {
			return false
		}
	}
	return true
}

// positions gives the lines of one sibling group the order of the file with
// as few position changes as possible (D8): the longest run already in app
// order keeps its positions, the others go between their neighbours.
func (e *engine) positions(m *mergeRun, group []string) {
	var known []string
	for _, id := range group {
		if !e.fresh["task:"+id] && !m.moved[id] {
			known = append(known, id)
		}
	}
	if len(known) == len(group) {
		inBase := append([]string(nil), known...)
		sortByPosition(e.base, "task", inBase)
		same := true
		for i := range known {
			if known[i] != inBase[i] {
				same = false
				break
			}
		}
		if same {
			return
		}
	}
	byApp := append([]string(nil), known...)
	sortByPosition(e.app, "task", byApp)
	rank := map[string]int{}
	for i, id := range byApp {
		rank[id] = i
	}
	keep := lis(known, rank)
	pos := func(id string) float64 {
		if b := e.bodies["task"][id]; b != nil {
			if p, ok := b["position"].(float64); ok {
				return p
			}
		}
		return e.app.Get("task", id).Num("position")
	}
	for i := 0; i < len(group); {
		if keep[group[i]] {
			i++
			continue
		}
		j := i
		for j < len(group) && !keep[group[j]] {
			j++
		}
		n := j - i
		for k := 0; k < n; k++ {
			var p float64
			switch {
			case i > 0 && j < len(group):
				lo, hi := pos(group[i-1]), pos(group[j])
				p = lo + (hi-lo)*float64(k+1)/float64(n+1)
			case i > 0:
				p = pos(group[i-1]) + 1000*float64(k+1)
			case j < len(group):
				p = pos(group[j]) - 1000*float64(n-k)
			default:
				p = 1000 * float64(k+1)
			}
			id := group[i+k]
			if e.fresh["task:"+id] || e.app.Get("task", id).Num("position") != p {
				e.body("task", id)["position"] = p
			}
		}
		i = j
	}
}

// lis returns the longest subsequence of seq increasing in rank.
func lis(seq []string, rank map[string]int) map[string]bool {
	n := len(seq)
	length, prev := make([]int, n), make([]int, n)
	best := -1
	for i := range seq {
		length[i], prev[i] = 1, -1
		for j := 0; j < i; j++ {
			if rank[seq[j]] < rank[seq[i]] && length[j]+1 > length[i] {
				length[i], prev[i] = length[j]+1, j
			}
		}
		if best < 0 || length[i] > length[best] {
			best = i
		}
	}
	out := map[string]bool{}
	for i := best; i >= 0; i = prev[i] {
		out[seq[i]] = true
	}
	return out
}
