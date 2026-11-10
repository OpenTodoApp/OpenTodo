package agenttools

import (
	"context"
	"fmt"
)

// Kinds of entity the in-app assistant's display tools name (OpenSpec change
// assistant-generative-ui, design D2).
const (
	ShownTask    = "task"
	ShownProject = "project"
	ShownNote    = "note"
	ShownPlace   = "place"
	// ShownHabit is a task tracked as a habit (assistant-project-blocks).
	ShownHabit = "habit"
)

// Shown returns the ids, in the order given and without repeats, that name a
// live entity of the kind the user can see and that is not in a project kept
// away from AI assistants: the same rows the read tools return. Every other id
// is left out, so an unknown id and an excluded one look the same to the caller.
func (r *Registry) Shown(ctx context.Context, userID, kind string, ids []string) ([]string, error) {
	snap, err := r.load(ctx, userID)
	if err != nil {
		return nil, err
	}
	live := map[string]bool{}
	switch kind {
	case ShownTask:
		for _, t := range snap.tasks {
			if snap.visible(t, true) {
				live[rawStr(t, "id")] = true
			}
		}
	case ShownHabit:
		for _, t := range snap.tasks {
			if snap.visible(t, true) && boolean(t, "habit") {
				live[rawStr(t, "id")] = true
			}
		}
	case ShownProject:
		for id := range snap.projects {
			live[id] = true
		}
	case ShownPlace:
		for id := range snap.places {
			live[id] = true
		}
	case ShownNote:
		notes, err := r.liveNotes(ctx, userID, snap)
		if err != nil {
			return nil, err
		}
		for _, n := range notes {
			live[rawStr(n, "id")] = true
		}
	default:
		return nil, fmt.Errorf("shown: unknown kind %q", kind)
	}
	out := []string{}
	seen := map[string]bool{}
	for _, id := range ids {
		if live[id] && !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out, nil
}

// ShownSection reports whether the section is a live section of the project and
// the project one the user can see and has not kept away from AI assistants (a
// board block's column, assistant-project-blocks).
func (r *Registry) ShownSection(ctx context.Context, userID, projectID, sectionID string) (bool, error) {
	snap, err := r.load(ctx, userID)
	if err != nil {
		return false, err
	}
	_, visible := snap.projects[projectID]
	return visible && snap.sectionProject[sectionID] == projectID, nil
}
