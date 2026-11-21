package cli

import (
	"context"
	"fmt"
	"strings"
)

// The subtask parts of add, edit, done and rm (OpenSpec change cli-subtasks).

// addParent puts --parent into an `ot add` body: the parent's id, and without
// --project the parent's project, or its workspace for an Inbox parent (design D2).
func addParent(ctx context.Context, c *client, ref string, body map[string]any) error {
	if strings.EqualFold(ref, "none") {
		return usageErr("--parent none only makes sense with `ot edit`")
	}
	all, err := c.tasks(ctx)
	if err != nil {
		return err
	}
	p, err := resolveParent(all, ref)
	if err != nil {
		return err
	}
	if v, has := body["project_id"]; has {
		id, _ := v.(string)
		if !sameProject(&id, p.ProjectID) {
			return usageErr("--parent %s is in another project than --project; drop --project to use the parent's", ref)
		}
	} else if p.ProjectID != nil {
		body["project_id"] = *p.ProjectID
	} else if p.WorkspaceID != nil {
		body["workspace_id"] = *p.WorkspaceID
	}
	body["parent_id"] = p.ID
	return nil
}

// editParent puts --parent into an `ot edit` patch. A parent in another project
// moves the task there in the same patch, unless --project names another one.
func editParent(all []task, t *task, ref string, projectSet bool, patch map[string]any) error {
	if strings.EqualFold(ref, "none") || ref == "" {
		patch["parent_id"] = nil
		return nil
	}
	p, err := resolveParent(all, ref)
	if err != nil {
		return err
	}
	patch["parent_id"] = p.ID
	if projectSet {
		id, _ := patch["project_id"].(string)
		var target *string
		if id != "" {
			target = &id
		}
		if !sameProject(target, p.ProjectID) {
			return usageErr("--parent %s is in another project than --project; drop --project to use the parent's", ref)
		}
		return nil
	}
	if !sameProject(t.ProjectID, p.ProjectID) {
		if p.ProjectID == nil {
			patch["project_id"] = nil
		} else {
			patch["project_id"] = *p.ProjectID
		}
	}
	return nil
}

// subtreeMoves are the live subtasks of t, at every depth, that edit --subtasks
// moves to the patch's project; none without --subtasks or a project in the patch.
func subtreeMoves(all []task, t *task, patch map[string]any, on bool) []task {
	v, has := patch["project_id"]
	if !on || !has {
		return nil
	}
	var target *string
	if id, _ := v.(string); id != "" {
		target = &id
	}
	var out []task
	for _, d := range descendants(all, t.ID) {
		if !sameProject(d.ProjectID, target) {
			out = append(out, d)
		}
	}
	return out
}

// moveSubtree sends one project patch per subtask, after the task itself (design D3).
func (a *App) moveSubtree(ctx context.Context, c *client, moves []task, project any) ([]task, error) {
	for _, m := range moves {
		a.target(m.ID, m.ID, m.Title, "moved")
		if err := c.patchJSON(ctx, "/tasks/"+m.ID, map[string]any{"project_id": project}, nil); err != nil {
			return nil, err
		}
	}
	return moves, nil
}

// withSubtasks adds, for done --subtasks and rm --subtasks, the descendants of
// every target that keep says to write, deepest first and before their
// ancestors, so a failure part-way never leaves a parent written above
// unwritten subtasks (design D3). A descendant's ref is its id.
func withSubtasks(all []task, targets []*task, refOf map[string]string, keep func(task) bool) []*task {
	seen := map[string]bool{}
	for _, t := range targets {
		seen[t.ID] = true
	}
	var out []*task
	for _, t := range targets {
		sub := descendants(all, t.ID)
		var add []*task
		for i := len(sub) - 1; i >= 0; i-- {
			d := sub[i]
			if seen[d.ID] || !keep(d) {
				continue
			}
			seen[d.ID] = true
			refOf[d.ID] = d.ID
			add = append(add, &d)
		}
		out = append(append(out, add...), t)
	}
	return out
}

// printTree prints `ot task show`'s parent path and subtasks (design D6).
func (a *App) printTree(all []task, t *task, kids []task) {
	if path := parentPath(all, t); len(path) > 0 {
		fmt.Fprintf(a.Stdout, "Parent:    %s\n", strings.Join(path, " › "))
	}
	if len(kids) == 0 {
		return
	}
	done, total := progress(all, t.ID)
	fmt.Fprintf(a.Stdout, "Subtasks:  %d/%d\n", done, total)
	for _, k := range kids {
		mark := "[ ]"
		if k.CompletedAt != nil {
			mark = "[x]"
		}
		fmt.Fprintf(a.Stdout, "  %s %s  %s\n", mark, shortID(k.ID), k.Title)
	}
}
