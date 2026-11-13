package webhook

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/ids"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// Note events (OpenSpec change note-webhooks). A note is saved every few seconds
// while someone types, so its events wait for quiet (design D2): per webhook and
// note one held row in webhook_note_holds gathers the changes until the note has
// had no winning change for NoteQuiet, or NoteHoldCap after the first one, and
// is then queued as one delivery with the note's state at release. note.deleted
// is queued at once and drops the held row.

// NoteQuiet is how long a note must stay unchanged before its event is sent.
const NoteQuiet = 5 * time.Minute

// NoteHoldCap bounds how long a note edited without pause waits.
const NoteHoldCap = 30 * time.Minute

// noteFields are the fields a note delivery carries (D3): never the editor document.
var noteFields = []string{"id", "title", "description", "project_id", "labels", "workspace_id", "created_at", "deleted_at"}

// presentNote is data.note: the readable fields, updated_at the time of the
// last change, nulls for fields the note never had.
func presentNote(e opsync.Entity, updatedAt int64) map[string]json.RawMessage {
	out := make(map[string]json.RawMessage, len(noteFields)+1)
	for _, f := range noteFields {
		v, ok := e[f]
		if !ok || len(v) == 0 {
			v = json.RawMessage("null")
			if f == "labels" {
				v = json.RawMessage("[]")
			}
		}
		out[f] = v
	}
	out["updated_at"] = json.RawMessage(jsonInt(updatedAt))
	return out
}

func jsonInt(n int64) string { b, _ := json.Marshal(n); return string(b) }

// noteChanges is `changes` of a note event: description without values (D3).
func noteChanges(fields map[string]opsync.FieldChange) map[string]any {
	out := make(map[string]any, len(fields))
	for f, fc := range fields {
		if f == "description" {
			out[f] = struct{}{}
			continue
		}
		out[f] = fc
	}
	return out
}

// buildNotePayload is the body of one note event.
func buildNotePayload(deliveryID, webhookID, event string, timeMs int64, origin string, note opsync.Entity, updatedAt int64, fields map[string]opsync.FieldChange) ([]byte, error) {
	rawData, err := json.Marshal(map[string]any{"note": presentNote(note, updatedAt)})
	if err != nil {
		return nil, err
	}
	rawChanges, err := json.Marshal(noteChanges(fields))
	if err != nil {
		return nil, err
	}
	p := Payload{Version: PayloadVersion, ID: deliveryID, Event: event, Time: timeMs, WebhookID: webhookID,
		Source: SourceFor(origin), Data: rawData, Changes: rawChanges}
	if p.Source == "device" {
		p.Device = origin
	}
	return json.Marshal(p)
}

// queueNote handles one note event for one subscribed webhook: note.deleted is
// returned to be queued now (and its held row dropped), the others are held.
func (s *Service) queueNote(ctx context.Context, sub subscription, userID, event string, c opsync.Change, now int64) (*queuedRow, error) {
	if event == "note.deleted" {
		if _, err := s.db.ExecContext(ctx, `DELETE FROM webhook_note_holds WHERE webhook_id = ? AND note_id = ?`, sub.id, c.EntityID); err != nil {
			return nil, err
		}
		note, err := s.sync.Get(ctx, userID, "note", c.EntityID)
		if err != nil {
			return nil, err
		}
		if note == nil {
			note = opsync.Entity{"id": json.RawMessage(jsonString(c.EntityID))}
		}
		id := ids.New()
		body, err := buildNotePayload(id, sub.id, event, now, c.Origin, note, now, c.Fields)
		if err != nil {
			return nil, err
		}
		return &queuedRow{id, sub.id, event, string(body)}, nil
	}
	return nil, s.hold(ctx, sub.id, userID, event, c, now)
}

func jsonString(s string) string { b, _ := json.Marshal(s); return string(b) }

// hold creates or extends the held row of a note: a held note.created stays
// note.created; each field keeps its first `from` and takes the latest `to`.
func (s *Service) hold(ctx context.Context, webhookID, userID, event string, c opsync.Change, now int64) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var held, rawFields string
	var first int64
	err = tx.QueryRowContext(ctx, `SELECT event, fields, first_at FROM webhook_note_holds WHERE webhook_id = ? AND note_id = ?`, webhookID, c.EntityID).Scan(&held, &rawFields, &first)
	fields := map[string]opsync.FieldChange{}
	switch {
	case errors.Is(err, sql.ErrNoRows):
		held, first = event, now
	case err != nil:
		return err
	default:
		if err := json.Unmarshal([]byte(rawFields), &fields); err != nil {
			return err
		}
		if held != "note.created" {
			held = event
		}
	}
	for f, fc := range c.Fields {
		if prev, ok := fields[f]; ok {
			fc.From = prev.From
		}
		fields[f] = fc
	}
	enc, err := json.Marshal(fields)
	if err != nil {
		return err
	}
	release := min(now+NoteQuiet.Milliseconds(), first+NoteHoldCap.Milliseconds())
	if _, err := tx.ExecContext(ctx, `INSERT INTO webhook_note_holds(webhook_id, note_id, user_id, event, fields, origin, first_at, last_at, release_at)
		VALUES(?,?,?,?,?,?,?,?,?)
		ON CONFLICT(webhook_id, note_id) DO UPDATE SET event = excluded.event, fields = excluded.fields, origin = excluded.origin,
			last_at = excluded.last_at, release_at = excluded.release_at`,
		webhookID, c.EntityID, userID, held, string(enc), c.Origin, first, now, release); err != nil {
		return err
	}
	return tx.Commit()
}

// releaseHeld queues the held note events that are due, each with the note's
// state now. A note that is gone (purged, or no longer readable by the
// webhook's owner) or a disabled webhook drops its row.
func (s *Service) releaseHeld(ctx context.Context) error {
	now := s.nowMs()
	rows, err := s.db.QueryContext(ctx, `SELECT h.webhook_id, h.note_id, h.user_id, h.event, h.fields, h.origin, h.last_at, w.enabled
		FROM webhook_note_holds h JOIN webhooks w ON w.id = h.webhook_id WHERE h.release_at <= ? ORDER BY h.release_at LIMIT 100`, now)
	if err != nil {
		return err
	}
	type heldRow struct {
		webhook, note, user, event, fields, origin string
		last                                       int64
		enabled                                    bool
	}
	var due []heldRow
	for rows.Next() {
		var h heldRow
		if err := rows.Scan(&h.webhook, &h.note, &h.user, &h.event, &h.fields, &h.origin, &h.last, &h.enabled); err != nil {
			rows.Close()
			return err
		}
		due = append(due, h)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	var queued []queuedRow
	for _, h := range due {
		if _, err := s.db.ExecContext(ctx, `DELETE FROM webhook_note_holds WHERE webhook_id = ? AND note_id = ? AND last_at = ?`, h.webhook, h.note, h.last); err != nil {
			return err
		}
		if !h.enabled {
			continue
		}
		note, err := s.sync.Get(ctx, h.user, "note", h.note)
		if err != nil {
			return err
		}
		if note == nil {
			continue
		}
		fields := map[string]opsync.FieldChange{}
		if err := json.Unmarshal([]byte(h.fields), &fields); err != nil {
			return err
		}
		id := ids.New()
		body, err := buildNotePayload(id, h.webhook, h.event, now, h.origin, note, h.last, fields)
		if err != nil {
			return err
		}
		queued = append(queued, queuedRow{id, h.webhook, h.event, string(body)})
	}
	return s.insertQueued(ctx, queued, now)
}

// nextRelease is the earliest held note event's release time.
func (s *Service) nextRelease(ctx context.Context) (time.Time, bool, error) {
	var at sql.NullInt64
	if err := s.db.QueryRowContext(ctx, `SELECT MIN(h.release_at) FROM webhook_note_holds h JOIN webhooks w ON w.id = h.webhook_id WHERE w.enabled = 1`).Scan(&at); err != nil {
		return time.Time{}, false, err
	}
	if !at.Valid {
		return time.Time{}, false, nil
	}
	return time.UnixMilli(at.Int64), true, nil
}
