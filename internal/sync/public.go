package sync

import (
	"context"
	"encoding/json"
	"time"
)

// PublicProject is one project as a public link shows it (OpenSpec
// `public-links`, design D3): the project, its live sections and its live
// tasks, open or completed within the last day. The HTTP layer projects these
// to the few fields a guest may see.
type PublicProject struct {
	Project  Entity
	Sections []Entity
	Tasks    []Entity
}

// PublicCompletedFor is how long a completed task stays on a public list.
const PublicCompletedFor = 24 * time.Hour

// PublicProject reads projectID in the scope creatorID sees it in: the shared
// project's scope, or the creator's personal scope for an unshared project
// they own. ok is false when the creator has no such access or the project is
// gone. Only the project's own rows are materialised, not the whole scope.
func (s *Service) PublicProject(ctx context.Context, creatorID, projectID string, now time.Time) (pp PublicProject, ok bool, err error) {
	role, shared, err := projectRole(ctx, s.db, creatorID, projectID)
	if err != nil || role == "" {
		return pp, false, err
	}
	scope := PersonalScope(creatorID)
	if shared {
		scope = ProjectScope(projectID)
	}
	load := func(entity, id string) (Entity, error) {
		rows, err := s.db.QueryContext(ctx, `SELECT field, value FROM scope_fields WHERE scope_id = ? AND entity = ? AND entity_id = ?`, scope, entity, id)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		e := Entity{"id": mustMarshal(id)}
		found := false
		for rows.Next() {
			var f string
			var v []byte
			if err := rows.Scan(&f, &v); err != nil {
				return nil, err
			}
			e[f] = json.RawMessage(v)
			found = true
		}
		if !found {
			return nil, rows.Err()
		}
		return e, rows.Err()
	}
	live := func(e Entity) bool {
		return e != nil && (len(e["deleted_at"]) == 0 || string(e["deleted_at"]) == "null")
	}
	if pp.Project, err = load("project", projectID); err != nil {
		return pp, false, err
	}
	if !live(pp.Project) {
		return PublicProject{}, false, nil
	}
	children := func(entity string) ([]string, error) {
		rows, err := s.db.QueryContext(ctx, `SELECT entity_id FROM scope_fields WHERE scope_id = ? AND entity = ? AND field = 'project_id' AND value = ?`,
			scope, entity, string(mustMarshal(projectID)))
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		var ids []string
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				return nil, err
			}
			ids = append(ids, id)
		}
		return ids, rows.Err()
	}
	secIDs, err := children("section")
	if err != nil {
		return pp, false, err
	}
	for _, id := range secIDs {
		e, err := load("section", id)
		if err != nil {
			return pp, false, err
		}
		if live(e) {
			pp.Sections = append(pp.Sections, e)
		}
	}
	taskIDs, err := children("task")
	if err != nil {
		return pp, false, err
	}
	cutoff := now.Add(-PublicCompletedFor).UnixMilli()
	for _, id := range taskIDs {
		e, err := load("task", id)
		if err != nil {
			return pp, false, err
		}
		if !live(e) {
			continue
		}
		var done *float64
		_ = json.Unmarshal(e["completed_at"], &done)
		if done != nil && int64(*done) < cutoff {
			continue
		}
		pp.Tasks = append(pp.Tasks, e)
	}
	return pp, true, nil
}

func mustMarshal(v any) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}
