package sync

import (
	"context"
)

// Read helpers for the CalDAV endpoint (OpenSpec change `caldav`, design D4).
// They only read: CalDAV writes go through Apply like every other client.

// Cursor is the newest position of the user's op log: the greatest seq among
// the ops and purge markers of every scope the user can see. CalDAV uses it as
// the CTag and sync token of every calendar.
func (s *Service) Cursor(ctx context.Context, userID string) (int64, error) {
	acc, err := loadAccess(ctx, s.db, userID)
	if err != nil {
		return 0, err
	}
	scopes := acc.scopes()
	seq, err := maxSeq(ctx, s.db, scopes)
	if err != nil {
		return 0, err
	}
	var p int64
	err = s.db.QueryRowContext(ctx, `SELECT COALESCE(MAX(seq),0) FROM purges WHERE scope_id IN (`+placeholders(len(scopes))+`)`, anys(scopes)...).Scan(&p)
	return max(seq, p), err
}

// Delta is what changed in the scopes a user can see after a cursor.
type Delta struct {
	// Cursor is the newest position (see Cursor), read in the same snapshot.
	Cursor int64
	// Fields maps entity -> entity id -> the fields written since the cursor
	// (by any author, winning or not).
	Fields map[string]map[string]map[string]bool
	// Purged maps entity -> ids purged since the cursor.
	Purged map[string]map[string]bool
}

// ChangedSince reports the entities touched after cursor in the user's scopes.
func (s *Service) ChangedSince(ctx context.Context, userID string, cursor int64) (Delta, error) {
	d := Delta{Fields: map[string]map[string]map[string]bool{}, Purged: map[string]map[string]bool{}}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return d, err
	}
	defer tx.Rollback()
	acc, err := loadAccess(ctx, tx, userID)
	if err != nil {
		return d, err
	}
	scopes := acc.scopes()
	rows, err := tx.QueryContext(ctx, `SELECT o.seq, o.entity, o.entity_id, o.field FROM op_scopes s JOIN ops o ON o.seq = s.seq
		WHERE s.scope_id IN (`+placeholders(len(scopes))+`) AND s.seq > ?`, append(anys(scopes), cursor)...)
	if err != nil {
		return d, err
	}
	top := cursor
	for rows.Next() {
		var seq int64
		var entity, id, field string
		if err := rows.Scan(&seq, &entity, &id, &field); err != nil {
			rows.Close()
			return d, err
		}
		top = max(top, seq)
		byID := d.Fields[entity]
		if byID == nil {
			byID = map[string]map[string]bool{}
			d.Fields[entity] = byID
		}
		if byID[id] == nil {
			byID[id] = map[string]bool{}
		}
		byID[id][field] = true
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return d, err
	}
	purged, ptop, err := purgedSince(ctx, tx, scopes, cursor, 0)
	if err != nil {
		return d, err
	}
	for _, p := range purged {
		if d.Purged[p.Entity] == nil {
			d.Purged[p.Entity] = map[string]bool{}
		}
		d.Purged[p.Entity][p.EntityID] = true
	}
	d.Cursor = max(top, ptop)
	return d, nil
}

// Modified returns, for every entity of one kind the user can see, the
// greatest timestamp among its stored field values: CalDAV's LAST-MODIFIED.
func (s *Service) Modified(ctx context.Context, userID, entity string) (map[string]int64, error) {
	acc, err := loadAccess(ctx, s.db, userID)
	if err != nil {
		return nil, err
	}
	scopes := acc.scopes()
	rows, err := s.db.QueryContext(ctx, `SELECT entity_id, MAX(ts) FROM scope_fields WHERE scope_id IN (`+placeholders(len(scopes))+`) AND entity = ?
		GROUP BY entity_id`, append(anys(scopes), entity)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int64{}
	for rows.Next() {
		var id string
		var ts int64
		if err := rows.Scan(&id, &ts); err != nil {
			return nil, err
		}
		out[id] = ts
	}
	return out, rows.Err()
}
