package calfeed

import (
	"context"
	"database/sql"
	"errors"
)

// Remote refs of managed events (OpenSpec change calendar-event-edits, D2):
// where each cached occurrence of a connected calendar lives on the account,
// so a client names an event by its id and never sees an address or an ETag.

// EventRemote is one event object on the account: its address (a CalDAV href
// or a Graph event id), its version and why it cannot be changed ("" when it
// can).
type EventRemote struct {
	Href   string
	ETag   string
	Locked string
}

// writeRefs replaces a subscription's refs with one per stored occurrence
// whose UID has a ref; rows of a re-read calendar never outlive its events.
func writeRefs(ctx context.Context, tx *sql.Tx, subID string, r *Result) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM calendar_event_remote WHERE subscription_id = ?`, subID); err != nil {
		return err
	}
	if len(r.Refs) == 0 {
		return nil
	}
	stmt, err := tx.PrepareContext(ctx, `INSERT OR REPLACE INTO calendar_event_remote(subscription_id, uid, instance, event_id, href, etag, locked) VALUES(?,?,?,?,?,?,?)`)
	if err != nil {
		return err
	}
	defer stmt.Close()
	for _, o := range r.Occurrences {
		ref, ok := r.Refs[o.UID]
		if !ok {
			continue
		}
		if _, err := stmt.ExecContext(ctx, subID, o.UID, o.Instance, EventID(subID, o.UID, o.Instance), ref.Href, ref.ETag, ref.Locked); err != nil {
			return err
		}
	}
	return nil
}

// StoreManagedRefs is StoreManaged with the refs of the calendar's events, by UID.
func (s *Store) StoreManagedRefs(ctx context.Context, subscriptionID, version string, occ []Occurrence, warnings []string, refs map[string]EventRemote) error {
	if refs == nil {
		refs = map[string]EventRemote{}
	}
	return s.Success(ctx, subscriptionID, &Result{Replaced: true, Occurrences: occ, Warnings: warnings, ETag: version, Refs: refs})
}

// ErrNoEvent: no cached event of the connection has this id.
var ErrNoEvent = errors.New("calendar event not found")

// ManagedEvent is a connection's cached event by id, with its ref.
func (s *Store) ManagedEvent(ctx context.Context, connID, eventID string) (EventRow, error) {
	r, err := scanEvent(s.db.QueryRowContext(ctx, eventSelect+`
		WHERE m.connection_id = ? AND r.event_id = ?`, connID, eventID))
	if errors.Is(err, sql.ErrNoRows) {
		// A managed occurrence read before the refs existed has no event_id yet.
		return r, ErrNoEvent
	}
	return r, err
}

// ReplaceManagedEvent swaps a cached occurrence (sub, uid, instance) for occ,
// written with ref, in one transaction, and marks the calendar to be read
// again. A nil occ drops the occurrence (a delete, or an event that is gone).
func (s *Store) ReplaceManagedEvent(ctx context.Context, subID, uid, instance string, occ *Occurrence, ref EventRemote) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `DELETE FROM calendar_events WHERE subscription_id = ? AND uid = ? AND instance = ?`, subID, uid, instance); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM calendar_event_remote WHERE subscription_id = ? AND uid = ? AND instance = ?`, subID, uid, instance); err != nil {
		return err
	}
	if occ != nil {
		sd, st, sz := pointParts(occ.Start)
		ed, et, ez := pointParts(occ.End)
		if _, err := tx.ExecContext(ctx, `INSERT OR REPLACE INTO calendar_events(subscription_id,uid,instance,summary,location,start_date,start_time,start_tz,end_date,end_time,end_tz,all_day,free,start_ms,end_ms)
			VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, subID, occ.UID, occ.Instance, occ.Summary, occ.Location, sd, st, sz, ed, et, ez, occ.AllDay, occ.Free, pointMs(occ.Start), pointMs(occ.End)); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `INSERT OR REPLACE INTO calendar_event_remote(subscription_id, uid, instance, event_id, href, etag, locked) VALUES(?,?,?,?,?,?,?)`,
			subID, occ.UID, occ.Instance, EventID(subID, occ.UID, occ.Instance), ref.Href, ref.ETag, ref.Locked); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `UPDATE calendar_subscriptions SET etag = '', updated_at = ? WHERE id = ?`, s.now().UnixMilli(), subID); err != nil {
		return err
	}
	return tx.Commit()
}

// LockManagedEvent marks one cached event as not changeable, for reason,
// until the calendar is next read with changes (its refs are then rewritten).
func (s *Store) LockManagedEvent(ctx context.Context, eventID, reason string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE calendar_event_remote SET locked = ? WHERE event_id = ?`, reason, eventID)
	return err
}

// PointWhen is a point shaped like a task's due.
func PointWhen(p Point) When {
	d, t, z := pointParts(p)
	w := When{Date: d}
	if s, ok := t.(string); ok {
		w.Time = &s
	}
	if s, ok := z.(string); ok {
		w.TZ = &s
	}
	return w
}
