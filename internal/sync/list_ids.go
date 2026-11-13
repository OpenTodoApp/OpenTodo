package sync

import (
	"context"
	"encoding/json"
	"fmt"
	"slices"
)

// MaxListIDs is how many ids one ListIDs call reads at most; a caller with more
// lists everything instead (List reads the same rows in one pass).
const MaxListIDs = 2000

// ListIDs is List narrowed to the given ids: the same records List would
// return for them (the same scope chosen for an id held in two scopes, the same
// order), read through the primary key, so a caller that needs a few entities of
// a large account reads only their rows (performance-10k, MCP search_tasks).
func (s *Service) ListIDs(ctx context.Context, userID, entity string, includeDeleted bool, ids []string) ([]Entity, error) {
	if len(ids) > MaxListIDs {
		return nil, fmt.Errorf("%w: %d ids, at most %d", ErrInvalidOp, len(ids), MaxListIDs)
	}
	if len(ids) == 0 {
		if _, ok := Schema[entity]; !ok {
			return nil, fmt.Errorf("%w: unknown entity %q", ErrInvalidOp, entity)
		}
		return []Entity{}, nil
	}
	ids = slices.Compact(slices.Sorted(slices.Values(ids)))
	return s.listEntities(ctx, userID, entity, includeDeleted, nil, ids)
}

// FieldValue is one stored field value of an entity in some visible scope.
type FieldValue struct {
	EntityID string
	Field    string
	Value    json.RawMessage
}

// FieldValues reads the stored values of a few fields of one entity kind in
// every scope the user can see, deleted entities included, without
// materializing the entities: an entity held in two scopes appears once per
// scope. It is a cheap first pass (performance-10k): a caller narrows by these
// values, then reads the full records of the few entities that can match with
// ListIDs and applies its rule to them.
func (s *Service) FieldValues(ctx context.Context, userID, entity string, fields []string) ([]FieldValue, error) {
	out, err := s.fieldValuesAll(ctx, userID, entity, fields)
	if err != nil || reachOf(ctx) == nil {
		return out, err
	}
	in, err := s.reachIDs(ctx, userID, entity)
	if err != nil {
		return nil, err
	}
	kept := out[:0:0]
	for _, v := range out {
		if in[v.EntityID] {
			kept = append(kept, v)
		}
	}
	return kept, nil
}

// fieldValuesAll is FieldValues without the request's reach.
func (s *Service) fieldValuesAll(ctx context.Context, userID, entity string, fields []string) ([]FieldValue, error) {
	schema, ok := Schema[entity]
	if !ok {
		return nil, fmt.Errorf("%w: unknown entity %q", ErrInvalidOp, entity)
	}
	for _, f := range fields {
		if _, ok := schema[f]; !ok {
			return nil, fmt.Errorf("%w: %s has no field %q", ErrInvalidOp, entity, f)
		}
	}
	if len(fields) == 0 {
		return nil, nil
	}
	acc, err := loadAccess(ctx, s.reader(), userID)
	if err != nil {
		return nil, err
	}
	scopes := acc.scopes()
	// The primary key (scope_id, entity, entity_id, field) holds the field, so
	// SQLite skips the other fields' rows without reading them.
	rows, err := s.reader().QueryContext(ctx, listQuery(len(scopes))+` AND field IN (`+placeholders(len(fields))+`)`,
		append(append(anys(scopes), entity), anys(fields)...)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []FieldValue
	for rows.Next() {
		var scope, id, field, value string
		if err := rows.Scan(&scope, &id, &field, &value); err != nil {
			return nil, err
		}
		out = append(out, FieldValue{EntityID: id, Field: field, Value: json.RawMessage(value)})
	}
	return out, rows.Err()
}
