package push

import (
	"context"
	"encoding/json"
)

// maxProjectDepth bounds the ancestor walk; the seen set already stops cycles.
const maxProjectDepth = 64

// projectLink is what the reminder rule reads of a project.
type projectLink struct {
	Parent   string
	Deleted  bool
	Archived bool
}

// projectQuiet reports whether project id, or any project above it through
// parent_id, is in the Trash or archived: the reminders of its tasks wait
// (OpenSpec `reminders`, "Reminders in the Trash and archived projects"). A
// project get cannot find ends the walk; a cycle from concurrent moves is
// stopped by the seen set. The web app's twin is inQuietProject in
// web/src/lib/reminderWatcher.ts; both read reminderProjects.vectors.json.
func projectQuiet(id string, get func(id string) (projectLink, bool, error)) (bool, error) {
	seen := map[string]bool{}
	for depth := 0; id != "" && !seen[id] && depth < maxProjectDepth; depth++ {
		seen[id] = true
		p, ok, err := get(id)
		if err != nil || !ok {
			return false, err
		}
		if p.Deleted || p.Archived {
			return true, nil
		}
		id = p.Parent
	}
	return false, nil
}

// inQuietProject is projectQuiet over the user's view of their projects. The
// answers are cached for one pass in cache, keyed by user and project.
func (s *Service) inQuietProject(ctx context.Context, userID, id string, cache map[string]bool) (bool, error) {
	key := userID + "\x00" + id
	if v, ok := cache[key]; ok {
		return v, nil
	}
	quiet, err := projectQuiet(id, func(id string) (projectLink, bool, error) {
		p, err := s.sync.Get(ctx, userID, "project", id)
		if err != nil || p == nil {
			return projectLink{}, false, err
		}
		var archived bool
		_ = json.Unmarshal(p["archived"], &archived)
		return projectLink{Parent: jsonString(p["parent_id"]), Deleted: p.Deleted(), Archived: archived}, true, nil
	})
	if err != nil {
		return false, err
	}
	cache[key] = quiet
	return quiet, nil
}
