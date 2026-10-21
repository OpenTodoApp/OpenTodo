package vault

import (
	"strings"
)

// renderInput is what printing one project file needs besides the store.
type renderInput struct {
	project string // "" for the Inbox
	tmpl    *Doc   // the file as it is on disk, for prose and front matter; may be nil
	// printed reports whether a completed task already had a line: open tasks
	// are always written, completed ones only while they keep their line.
	printed func(taskID string) bool
	extra   map[string]string // trailing text per task
	labels  map[string]string // tag slug → label id
}

// fileTasks lists the tasks a project file shows: live tasks of the project
// (null for the Inbox), open or still holding their line, and not occurrence
// records of a series.
func (v *view) fileTasks(project string, printed func(string) bool) []string {
	var out []string
	for _, id := range v.s.IDs("task") {
		r := v.s.Get("task", id)
		if !r.Live() || r.Str("project_id") != project {
			continue
		}
		if r.Set("completed_at") && (printed == nil || !printed(id)) {
			continue
		}
		out = append(out, id)
	}
	return out
}

// sectionsOf lists a project's live sections in order.
func (v *view) sectionsOf(project string) []string {
	if project == "" {
		return nil
	}
	var out []string
	for _, id := range v.s.IDs("section") {
		r := v.s.Get("section", id)
		if r.Live() && r.Str("project_id") == project {
			out = append(out, id)
		}
	}
	sortByPosition(v.s, "section", out)
	return out
}

// render builds a project's document (design D8): owned front matter from the
// project, foreign front matter and prose from the template, sections in
// order, tasks by (position, id) with subtasks nested under a parent shown in
// the same file. Prose stays anchored after the task it followed.
func (v *view) render(in renderInput) *Doc {
	d := &Doc{}
	if in.project != "" {
		r := v.s.Get("project", in.project)
		d.ID = in.project
		d.Color = r.Str("color")
		d.Icon = r.Str("icon")
		d.HasFront = true
	}
	if in.tmpl != nil {
		d.Front = append(d.Front, in.tmpl.Front...)
		if in.project == "" && in.tmpl.HasFront {
			d.HasFront = true
		}
	}
	ids := v.fileTasks(in.project, in.printed)
	inFile := map[string]bool{}
	for _, id := range ids {
		inFile[id] = true
	}
	sections := v.sectionsOf(in.project)
	liveSection := map[string]bool{}
	for _, s := range sections {
		liveSection[s] = true
	}
	children := map[string][]string{}
	top := map[string][]string{} // section id ("" for none) → top-level task ids
	for _, id := range ids {
		r := v.s.Get("task", id)
		p := r.Str("parent_id")
		if p != "" && inFile[p] && !v.cyclic(id) {
			children[p] = append(children[p], id)
			continue
		}
		sec := r.Str("section_id")
		if !liveSection[sec] {
			sec = ""
		}
		top[sec] = append(top[sec], id)
	}
	var node func(id string) *Node
	node = func(id string) *Node {
		n := &Node{Line: v.line(id, in.labels, in.extra[id])}
		if desc := v.text("task", id, "description"); strings.TrimSpace(desc) != "" {
			n.Note = strings.Split(strings.TrimRight(desc, "\n"), "\n")
		}
		kids := children[id]
		sortByPosition(v.s, "task", kids)
		for _, c := range kids {
			n.Children = append(n.Children, node(c))
		}
		return n
	}
	// Template blocks by section name, for their prose.
	tmplBlocks := map[string]*Block{}
	var tmplFirst *Block
	if in.tmpl != nil {
		for _, b := range in.tmpl.Blocks {
			if !b.Heading {
				if tmplFirst == nil {
					tmplFirst = b
				}
				continue
			}
			tmplBlocks[strings.ToLower(b.Section)] = b
		}
	}
	used := map[*Block]bool{}
	build := func(heading bool, name, sec string, tb *Block) *Block {
		b := &Block{Heading: heading, Section: name}
		ordered := top[sec]
		sortByPosition(v.s, "task", ordered)
		present := map[string]bool{}
		for _, id := range ordered {
			present[id] = true
		}
		// Prose of the template block, anchored after the top-level task it
		// followed (or at the start); an anchor that is gone falls back to the
		// nearest earlier anchor still present.
		anchored := map[string][][]string{}
		var start [][]string
		if tb != nil {
			used[tb] = true
			anchor := ""
			for _, it := range tb.Items {
				if it.Task != nil {
					if present[it.Task.Line.ID] {
						anchor = it.Task.Line.ID
					}
					continue
				}
				if anchor == "" {
					start = append(start, it.Prose)
				} else {
					anchored[anchor] = append(anchored[anchor], it.Prose)
				}
			}
		}
		for _, p := range start {
			b.Items = append(b.Items, Item{Prose: p})
		}
		for _, id := range ordered {
			b.Items = append(b.Items, Item{Task: node(id)})
			for _, p := range anchored[id] {
				b.Items = append(b.Items, Item{Prose: p})
			}
		}
		return b
	}
	d.Blocks = append(d.Blocks, build(false, "", "", tmplFirst))
	for _, sec := range sections {
		name := v.text("section", sec, "name")
		d.Blocks = append(d.Blocks, build(true, name, sec, tmplBlocks[strings.ToLower(name)]))
	}
	// A template heading whose section is gone keeps its prose, under its
	// heading, at the end of the first block.
	if in.tmpl != nil {
		for _, b := range in.tmpl.Blocks {
			if !b.Heading || used[b] {
				continue
			}
			var prose []string
			for _, it := range b.Items {
				if it.Prose != nil {
					prose = append(prose, it.Prose...)
				}
			}
			if len(prose) > 0 {
				d.Blocks[0].Items = append(d.Blocks[0].Items, Item{Prose: append([]string{"## " + b.Section, ""}, prose...)})
			}
		}
	}
	return d
}

// cyclic reports a task whose parent chain loops back to it; such a task is
// shown at the top level, as the app does.
func (v *view) cyclic(id string) bool {
	seen := map[string]bool{id: true}
	for cur := v.s.Get("task", id).Str("parent_id"); cur != ""; cur = v.s.Get("task", cur).Str("parent_id") {
		if seen[cur] {
			return true
		}
		seen[cur] = true
	}
	return false
}
