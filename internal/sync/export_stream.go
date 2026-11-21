package sync

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
)

// EachExportPage streams every entity of one kind the user can see (deleted ones
// included) to fn a bounded page at a time, in the same order, reach and dedup
// as List. A caller exporting a large account never holds the whole collection:
// List materializes it all (a 50k-task account is ~112 MB of entity maps, and
// the JSON and ZIP exports held every collection at once, peaking at hundreds of
// MB), while this reads at most MaxListIDs entities per page. The pages arrive in
// List's order — position, then created_at, then id — so a caller that
// concatenates them reproduces it exactly.
func (s *Service) EachExportPage(ctx context.Context, userID, entity string, fn func([]Entity) error) error {
	ids, err := s.exportOrder(ctx, userID, entity)
	if err != nil {
		return err
	}
	for start := 0; start < len(ids); start += MaxListIDs {
		end := min(start+MaxListIDs, len(ids))
		page, err := s.ListIDs(ctx, userID, entity, true, ids[start:end])
		if err != nil {
			return err
		}
		if err := fn(page); err != nil {
			return err
		}
	}
	return nil
}

// exportOrder is every id of one kind in the user's scopes (deleted included),
// ordered as List orders entities: position, then created_at, then id. It reads
// only the two ordering fields and the id set, never the whole entities, so it
// stays cheap on a large account (performance-10k). Reach is not applied here —
// ListIDs applies it to each page, dropping ids the request may not read — and a
// legacy id held in two scopes is listed once, ordered by whichever scope's
// ordering fields were read last; ListIDs still resolves its record to one
// scope, so only the display order of such tombstone-era data could differ.
func (s *Service) exportOrder(ctx context.Context, userID, entity string) ([]string, error) {
	if _, ok := Schema[entity]; !ok {
		return nil, fmt.Errorf("%w: unknown entity %q", ErrInvalidOp, entity)
	}
	acc, err := loadAccess(ctx, s.reader(), userID)
	if err != nil {
		return nil, err
	}
	scopes := acc.scopes()
	if len(scopes) == 0 {
		return nil, nil
	}
	type ord struct {
		id           string
		pos, created float64
	}
	byID := map[string]*ord{}
	order := []*ord{}
	get := func(id string) *ord {
		o := byID[id]
		if o == nil {
			o = &ord{id: id}
			byID[id] = o
			order = append(order, o)
		}
		return o
	}
	// The ordering fields of every entity that has them.
	rows, err := s.reader().QueryContext(ctx,
		`SELECT entity_id, field, value FROM scope_fields WHERE scope_id IN (`+placeholders(len(scopes))+`) AND entity = ? AND field IN ('position','created_at')`,
		append(anys(scopes), entity)...)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var id, field, value string
		if err := rows.Scan(&id, &field, &value); err != nil {
			rows.Close()
			return nil, err
		}
		var f float64
		_ = json.Unmarshal([]byte(value), &f)
		o := get(id)
		if field == "position" {
			o.pos = f
		} else {
			o.created = f
		}
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()
	// The complete id set: an entity with neither ordering field still exports.
	idRows, err := s.reader().QueryContext(ctx,
		`SELECT DISTINCT entity_id FROM scope_fields WHERE scope_id IN (`+placeholders(len(scopes))+`) AND entity = ?`,
		append(anys(scopes), entity)...)
	if err != nil {
		return nil, err
	}
	for idRows.Next() {
		var id string
		if err := idRows.Scan(&id); err != nil {
			idRows.Close()
			return nil, err
		}
		get(id)
	}
	if err := idRows.Err(); err != nil {
		idRows.Close()
		return nil, err
	}
	idRows.Close()
	sort.SliceStable(order, func(i, j int) bool {
		a, b := order[i], order[j]
		if a.pos != b.pos {
			return a.pos < b.pos
		}
		if a.created != b.created {
			return a.created < b.created
		}
		return a.id < b.id
	})
	ids := make([]string, len(order))
	for i, o := range order {
		ids[i] = o.id
	}
	return ids, nil
}
