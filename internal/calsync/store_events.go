package calsync

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/calfeed"
)

// Store parts of calendar-event-edits (D2, D3, D12): the edit options, the
// account's addresses, capabilities learnt from a refusal and assistants' undo.

// ErrAssistantsNeedEdits: "Let assistants edit events" was turned on while
// "Edit events in OpenTodo" is off.
var ErrAssistantsNeedEdits = errors.New("assistant_edits needs edit_events")

// EditOptions returns the options a patch would leave, or ErrAssistantsNeedEdits.
func EditOptions(cur *Connection, p Patch) (edit, assistants bool, err error) {
	edit, assistants = cur.EditEvents, cur.AssistantEdits
	if p.EditEvents != nil {
		edit = *p.EditEvents
		if !edit {
			assistants = false
		}
	}
	if p.AssistantEdits != nil {
		if *p.AssistantEdits && !edit {
			return cur.EditEvents, cur.AssistantEdits, ErrAssistantsNeedEdits
		}
		assistants = *p.AssistantEdits && edit
	}
	return edit, assistants, nil
}

// saveEditOptions stores the edit options of a patch: a row means edits are
// on, its assistants column the second switch.
func saveEditOptions(ctx context.Context, tx *sql.Tx, id string, cur *Connection, p Patch) error {
	if p.EditEvents == nil && p.AssistantEdits == nil {
		return nil
	}
	edit, assistants, err := EditOptions(cur, p)
	if err != nil {
		return err
	}
	if !edit {
		_, err := tx.ExecContext(ctx, `DELETE FROM calsync_event_edit WHERE connection_id = ?`, id)
		return err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO calsync_event_edit(connection_id, assistants) VALUES(?, ?)
		ON CONFLICT(connection_id) DO UPDATE SET assistants = excluded.assistants`, id, assistants)
	return err
}

func saveAddresses(ctx context.Context, tx *sql.Tx, id string, addrs []string) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM calsync_account_addresses WHERE connection_id = ?`, id); err != nil {
		return err
	}
	for _, a := range addrs {
		if a = calfeed.Address(a); a != "" {
			if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO calsync_account_addresses(connection_id, address) VALUES(?, ?)`, id, a); err != nil {
				return err
			}
		}
	}
	return nil
}

// SetAddresses replaces the account's calendar addresses (every discovery).
func (s *Store) SetAddresses(ctx context.Context, id string, addrs []string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := saveAddresses(ctx, tx, id, addrs); err != nil {
		return err
	}
	return tx.Commit()
}

// SetCaps records the capabilities of one calendar of a connection (all false
// after the account refused a write, until the next discovery).
func (s *Store) SetCaps(ctx context.Context, id, calendarURL string, caps Caps) error {
	c, err := s.ByID(ctx, id)
	if err != nil {
		return err
	}
	for i := range c.Calendars {
		if c.Calendars[i].URL == calendarURL {
			c.Calendars[i].Caps = &caps
		}
	}
	_, err = s.db.ExecContext(ctx, `UPDATE calsync_connections SET calendars = ? WHERE id = ?`, jsonText(nonNilCals(c.Calendars)), id)
	return err
}

// UndoTTL is how long an assistant's edit can be undone.
const UndoTTL = 30 * 24 * time.Hour

// Undo is what an assistant's edit replaced (nil fields were kept).
type Undo struct {
	Summary   *string
	When      *EventWhen
	ETag      string
	TokenID   string
	TokenName string
}

type undoWhen struct {
	Start  calfeed.When `json:"start"`
	End    calfeed.When `json:"end"`
	AllDay bool         `json:"allDay"`
}

// saveUndo keeps an assistant's undo for the event's new id.
func (s *Store) saveUndo(ctx context.Context, connID, eventID string, u Undo) error {
	var summary, start, end, allDay any
	if u.Summary != nil {
		summary = *u.Summary
	}
	if u.When != nil {
		w := undoWhen{Start: whenOfPoint(u.When.Start, u.When.AllDay), End: whenOfPoint(u.When.End, u.When.AllDay), AllDay: u.When.AllDay}
		start, end, allDay = jsonText(w.Start), jsonText(w.End), w.AllDay
	}
	_, err := s.db.ExecContext(ctx, `INSERT OR REPLACE INTO calendar_event_undo(connection_id,event_id,summary,start_json,end_json,all_day,etag,token_id,token_name,created_at)
		VALUES(?,?,?,?,?,?,?,?,?,?)`, connID, eventID, summary, start, end, allDay, u.ETag, u.TokenID, u.TokenName, s.now().UnixMilli())
	return err
}

// undo returns the undo kept for an event, or nil.
func (s *Store) undo(ctx context.Context, connID, eventID string) (*Undo, error) {
	var summary, start, end sql.NullString
	var allDay sql.NullInt64
	u := &Undo{}
	err := s.db.QueryRowContext(ctx, `SELECT summary, start_json, end_json, all_day, etag, token_id, token_name FROM calendar_event_undo
		WHERE connection_id = ? AND event_id = ? AND created_at >= ?`, connID, eventID, s.now().Add(-UndoTTL).UnixMilli()).
		Scan(&summary, &start, &end, &allDay, &u.ETag, &u.TokenID, &u.TokenName)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if summary.Valid {
		u.Summary = &summary.String
	}
	if start.Valid && end.Valid {
		var a, b calfeed.When
		if json.Unmarshal([]byte(start.String), &a) != nil || json.Unmarshal([]byte(end.String), &b) != nil {
			return nil, nil
		}
		w, err := WhenOf(a, b, allDay.Int64 == 1)
		if err != nil {
			return nil, nil
		}
		u.When = &w
	}
	return u, nil
}

// dropUndo forgets the undo of an event (a person's edit, a delete, an undo).
func (s *Store) dropUndo(ctx context.Context, connID, eventID string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM calendar_event_undo WHERE connection_id = ? AND event_id = ?`, connID, eventID)
	return err
}

// ExpireUndos forgets undos older than UndoTTL (the cycle).
func (s *Store) ExpireUndos(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM calendar_event_undo WHERE created_at < ?`, s.now().Add(-UndoTTL).UnixMilli())
	return err
}

// whenOfPoint is a point as the API shapes it.
func whenOfPoint(p calfeed.Point, allDay bool) calfeed.When {
	p.AllDay = allDay
	return calfeed.PointWhen(p)
}
