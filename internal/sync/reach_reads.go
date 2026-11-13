package sync

import "context"

// The reads of the sync service with the request's reach applied
// (token-workspaces D2): each wraps its unfiltered twin in service.go.

// listEntities is ListWhere, further narrowed to the given ids when ids is
// not nil (ListIDs), and to the request's reach.
func (s *Service) listEntities(ctx context.Context, userID, entity string, includeDeleted bool, m *Match, ids []string) ([]Entity, error) {
	out, err := s.listEntitiesAll(ctx, userID, entity, includeDeleted, m, ids)
	if err != nil {
		return nil, err
	}
	return s.filterReach(ctx, userID, entity, out)
}

// Get materializes one entity the user can see within the request's reach,
// or returns nil when it does not exist there (getAll in service.go).
func (s *Service) Get(ctx context.Context, userID, entity, id string) (Entity, error) {
	e, err := s.getAll(ctx, userID, entity, id)
	if err != nil || e == nil {
		return e, err
	}
	// Outside the request's reach reads as missing (token-workspaces D3).
	if ok, err := s.inReach(ctx, userID, entity, e); err != nil || !ok {
		return nil, err
	}
	return e, nil
}

// LastChanged is lastChangedAll (service.go) within the request's reach.
func (s *Service) LastChanged(ctx context.Context, userID, entity string) (map[string]int64, error) {
	out, err := s.lastChangedAll(ctx, userID, entity)
	if err != nil || reachOf(ctx) == nil {
		return out, err
	}
	in, err := s.reachIDs(ctx, userID, entity)
	if err != nil {
		return nil, err
	}
	for id := range out {
		if !in[id] {
			delete(out, id)
		}
	}
	return out, nil
}

// FieldTS is fieldTSAll (service.go) for an entity within the request's reach.
func (s *Service) FieldTS(ctx context.Context, userID, entity, id, field string) (int64, error) {
	if reachOf(ctx) != nil {
		if e, err := s.Get(ctx, userID, entity, id); err != nil || e == nil {
			return 0, err
		}
	}
	return s.fieldTSAll(ctx, userID, entity, id, field)
}
