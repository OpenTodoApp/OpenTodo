package cli

import (
	"fmt"
	"sort"
	"strings"
)

// Subtasks in the CLI (OpenSpec change cli-subtasks): resolving a parent, the
// subtree a cascade writes, and the nested table of the lists the app nests.

// resolveParent resolves --parent among live tasks. A completed task is refused
// locally, as the app's "Parent task" picker doesn't offer one (design D2).
func resolveParent(all []task, ref string) (*task, error) {
	p, err := resolveTask(all, ref)
	if err != nil {
		return nil, err
	}
	if p.CompletedAt != nil {
		return nil, usageErr("--parent %s: %q is completed; reopen it first or choose an open task", ref, p.Title)
	}
	return p, nil
}

// sameProject reports whether two nullable project ids are equal (nil is the Inbox).
func sameProject(a, b *string) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

// liveChildren are the direct subtasks of id that are not deleted, in position order.
func liveChildren(all []task, id string) []task {
	var out []task
	for _, t := range all {
		if t.DeletedAt == nil && t.ParentID != nil && *t.ParentID == id && t.ID != id {
			out = append(out, t)
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return byPosition(out[i], out[j]) })
	return out
}

// descendants are the live subtasks of id at every depth, parents before their
// children. A cycle left by concurrent moves is cut where it repeats a task.
func descendants(all []task, id string) []task {
	byParent := map[string][]task{}
	for _, t := range all {
		if t.DeletedAt == nil && t.ParentID != nil && *t.ParentID != "" {
			byParent[*t.ParentID] = append(byParent[*t.ParentID], t)
		}
	}
	for _, kids := range byParent {
		sort.SliceStable(kids, func(i, j int) bool { return byPosition(kids[i], kids[j]) })
	}
	seen := map[string]bool{id: true}
	var out []task
	var walk func(string)
	walk = func(p string) {
		for _, k := range byParent[p] {
			if seen[k.ID] {
				continue
			}
			seen[k.ID] = true
			out = append(out, k)
			walk(k.ID)
		}
	}
	walk(id)
	return out
}

// progress is the completed and total count of a task's live direct subtasks.
func progress(all []task, id string) (done, total int) {
	for _, k := range liveChildren(all, id) {
		total++
		if k.CompletedAt != nil {
			done++
		}
	}
	return done, total
}

// parentPath is the titles from the top-level ancestor down to t's parent.
func parentPath(all []task, t *task) []string {
	byID := make(map[string]*task, len(all))
	for i := range all {
		byID[all[i].ID] = &all[i]
	}
	var path []string
	seen := map[string]bool{t.ID: true}
	for p := t.ParentID; p != nil && *p != "" && !seen[*p]; {
		parent, ok := byID[*p]
		if !ok || parent.DeletedAt != nil {
			break
		}
		seen[parent.ID] = true
		path = append([]string{parent.Title}, path...)
		p = parent.ParentID
	}
	return path
}

// nestTasks orders listed tasks as a tree: each task right after its parent,
// siblings in their listed order. A task whose parent isn't listed stays at the
// top level (design D4). It returns the order and each task's depth.
func nestTasks(tasks []task) ([]task, map[string]int) {
	listed := make(map[string]bool, len(tasks))
	for _, t := range tasks {
		listed[t.ID] = true
	}
	kids := map[string][]task{}
	var roots []task
	for _, t := range tasks {
		if t.ParentID != nil && listed[*t.ParentID] && *t.ParentID != t.ID {
			kids[*t.ParentID] = append(kids[*t.ParentID], t)
			continue
		}
		roots = append(roots, t)
	}
	out := make([]task, 0, len(tasks))
	depth := make(map[string]int, len(tasks))
	var walk func(t task, d int)
	walk = func(t task, d int) {
		if _, done := depth[t.ID]; done {
			return
		}
		depth[t.ID] = d
		out = append(out, t)
		for _, k := range kids[t.ID] {
			walk(k, d+1)
		}
	}
	for _, r := range roots {
		walk(r, 0)
	}
	// Members of a cycle have no listed root: print them at the top level.
	for _, t := range tasks {
		walk(t, 0)
	}
	return out, depth
}

// treeTitles are the table titles of nested tasks: indented two spaces per
// level, a parent followed by its progress.
func treeTitles(tasks []task, depth map[string]int, all []task) map[string]string {
	titles := make(map[string]string, len(tasks))
	for _, t := range tasks {
		title := strings.Repeat("  ", depth[t.ID])
		if t.CompletedAt != nil {
			title += "[done] "
		}
		title += t.Title
		if done, total := progress(all, t.ID); total > 0 {
			title += fmt.Sprintf(" %d/%d", done, total)
		}
		titles[t.ID] = title
	}
	return titles
}

// listTree nests the table of the lists the app nests, the position-ordered
// project and Inbox lists (design D4); every other list is printed flat.
func listTree(view string, byScore bool, tasks []task, all []task) ([]task, map[string]string) {
	if byScore || (view != "project" && view != "inbox") {
		return tasks, nil
	}
	rows, depth := nestTasks(tasks)
	return rows, treeTitles(rows, depth, all)
}

// filterParent keeps the direct subtasks of the --parent task, in position
// order (design D5).
func filterParent(tasks, all []task, ref string) ([]task, error) {
	p, err := resolveTask(all, ref)
	if err != nil {
		return nil, err
	}
	var out []task
	for _, t := range tasks {
		if t.ParentID != nil && *t.ParentID == p.ID {
			out = append(out, t)
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return byPosition(out[i], out[j]) })
	return out, nil
}
