package sync

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"time"
)

// Service persists ops and materializes current field values.
type Service struct {
	db       *sql.DB
	now      func() time.Time
	observer Observer
	notifier *Notifier
}

// FieldChange is one field's transition within a batch. From is nil (JSON null)
// when the field had no stored value before the batch.
type FieldChange struct {
	From json.RawMessage `json:"from"`
	To   json.RawMessage `json:"to"`
}

// Change describes everything that genuinely changed on one entity in one Apply
// batch: only ops that won under last-writer-wins and altered the stored value
// contribute. Origin is the device id of the last winning op ("server" for REST).
type Change struct {
	UserID   string
	Entity   string
	EntityID string
	Fields   map[string]FieldChange
	Origin   string
}

// Observer receives the winning changes of a batch after its transaction has
// committed. It runs synchronously on the caller's goroutine, so it must be quick
// (the webhook queue only inserts rows). It never sees losing or duplicate ops.
type Observer func(ctx context.Context, changes []Change)

// SetObserver installs the post-commit observer (nil removes it). Call it during
// wiring, before the service handles requests.
func (s *Service) SetObserver(o Observer) { s.observer = o }

// NewService wires a Service.
func NewService(db *sql.DB) *Service {
	return &Service{db: db, now: time.Now, notifier: NewNotifier()}
}

// Notifier returns the live-update fan-out for this service. Callers of Apply
// use it to wake the user's other devices once a batch has been committed.
func (s *Service) Notifier() *Notifier { return s.notifier }

// ApplyResult summarizes an Apply call.
type ApplyResult struct {
	Applied    int   `json:"applied"`
	Duplicates int   `json:"duplicates"`
	Seq        int64 `json:"seq"` // the user's latest op cursor after the batch
}

// Apply validates and records a batch of ops for one user atomically.
// Duplicate op ids are ignored, so clients can retry safely. Timestamps far in the
// future are clamped so a misconfigured clock cannot freeze a field forever.
func (s *Service) Apply(ctx context.Context, userID string, ops []Op) (ApplyResult, error) {
	var res ApplyResult
	if len(ops) > MaxOpsPerRequest {
		return res, fmt.Errorf("%w: at most %d ops per request", ErrInvalidOp, MaxOpsPerRequest)
	}
	for i := range ops {
		if err := Validate(ops[i]); err != nil {
			return res, err
		}
	}
	nowMs := s.now().UnixMilli()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return res, err
	}
	defer tx.Rollback()
	tracker := newChangeTracker(userID)
	for _, op := range ops {
		if op.TS > nowMs+MaxFutureSkewMs {
			op.TS = nowMs + MaxFutureSkewMs
		}
		r, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO ops(user_id,op_id,entity,entity_id,field,value,ts,device,received_at)
			VALUES(?,?,?,?,?,?,?,?,?)`, userID, op.ID, op.Entity, op.EntityID, op.Field, string(op.Value), op.TS, op.Device, nowMs)
		if err != nil {
			return res, err
		}
		if n, _ := r.RowsAffected(); n == 0 {
			res.Duplicates++
			continue
		}
		// Read the current winner so the observer learns about genuine changes only.
		var prevValue, prevDevice string
		var prevTS int64
		err = tx.QueryRowContext(ctx, `SELECT value, ts, device FROM fields WHERE user_id = ? AND entity = ? AND entity_id = ? AND field = ?`,
			userID, op.Entity, op.EntityID, op.Field).Scan(&prevValue, &prevTS, &prevDevice)
		existed := err == nil
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return res, err
		}
		if !existed || Wins(op.TS, op.Device, prevTS, prevDevice) {
			var prev json.RawMessage
			if existed {
				prev = json.RawMessage(prevValue)
			}
			tracker.record(op, prev)
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO fields(user_id,entity,entity_id,field,value,ts,device) VALUES(?,?,?,?,?,?,?)
			ON CONFLICT(user_id,entity,entity_id,field) DO UPDATE SET value=excluded.value, ts=excluded.ts, device=excluded.device
			WHERE excluded.ts > fields.ts OR (excluded.ts = fields.ts AND excluded.device > fields.device)`,
			userID, op.Entity, op.EntityID, op.Field, string(op.Value), op.TS, op.Device)
		if err != nil {
			return res, err
		}
		res.Applied++
	}
	if err := tx.QueryRowContext(ctx, `SELECT COALESCE(MAX(seq),0) FROM ops WHERE user_id = ?`, userID).Scan(&res.Seq); err != nil {
		return res, err
	}
	if err := tx.Commit(); err != nil {
		return res, err
	}
	if s.observer != nil {
		if changes := tracker.changes(); len(changes) > 0 {
			s.observer(ctx, changes)
		}
	}
	return res, nil
}

// changeTracker coalesces the winning ops of one batch per entity, keeping the
// value before the batch as From and the final winner as To.
type changeTracker struct {
	userID string
	order  []string
	byKey  map[string]*Change
}

func newChangeTracker(userID string) *changeTracker {
	return &changeTracker{userID: userID, byKey: map[string]*Change{}}
}

func (t *changeTracker) record(op Op, prev json.RawMessage) {
	key := op.Entity + "\x00" + op.EntityID
	c, ok := t.byKey[key]
	if !ok {
		c = &Change{UserID: t.userID, Entity: op.Entity, EntityID: op.EntityID, Fields: map[string]FieldChange{}}
		t.byKey[key] = c
		t.order = append(t.order, key)
	}
	c.Origin = op.Device
	fc, seen := c.Fields[op.Field]
	if !seen {
		fc.From = prev
	}
	fc.To = append(json.RawMessage(nil), op.Value...)
	c.Fields[op.Field] = fc
}

// changes drops fields whose value ended where it started (a re-seeded op with a
// newer timestamp but the same value) and entities left with no changed field.
func (t *changeTracker) changes() []Change {
	out := make([]Change, 0, len(t.order))
	for _, key := range t.order {
		c := t.byKey[key]
		for f, fc := range c.Fields {
			if SameJSON(fc.From, fc.To) {
				delete(c.Fields, f)
			}
		}
		if len(c.Fields) > 0 {
			out = append(out, *c)
		}
	}
	return out
}

// SameJSON reports whether two JSON values are equal ignoring insignificant
// whitespace. A missing value (nil) equals JSON null.
func SameJSON(a, b json.RawMessage) bool {
	norm := func(v json.RawMessage) []byte {
		if len(v) == 0 {
			return []byte("null")
		}
		var buf bytes.Buffer
		if err := json.Compact(&buf, v); err != nil {
			return v
		}
		return buf.Bytes()
	}
	return bytes.Equal(norm(a), norm(b))
}

// Pull returns ops after cursor, newest cursor and whether more remain.
// Ops authored by excludeDevice are skipped; the cursor still advances past them.
func (s *Service) Pull(ctx context.Context, userID string, cursor int64, excludeDevice string, limit int) ([]Op, int64, bool, error) {
	if limit <= 0 || limit > MaxOpsPerRequest {
		limit = MaxOpsPerRequest
	}
	rows, err := s.db.QueryContext(ctx, `SELECT seq,op_id,entity,entity_id,field,value,ts,device FROM ops
		WHERE user_id = ? AND seq > ? ORDER BY seq LIMIT ?`, userID, cursor, limit+1)
	if err != nil {
		return nil, cursor, false, err
	}
	defer rows.Close()
	out := []Op{}
	next := cursor
	n := 0
	more := false
	for rows.Next() {
		if n == limit {
			more = true
			break
		}
		var op Op
		var value string
		if err := rows.Scan(&op.Seq, &op.ID, &op.Entity, &op.EntityID, &op.Field, &value, &op.TS, &op.Device); err != nil {
			return nil, cursor, false, err
		}
		op.Value = json.RawMessage(value)
		next = op.Seq
		n++
		if op.Device == excludeDevice {
			continue
		}
		out = append(out, op)
	}
	return out, next, more, rows.Err()
}

// Entity is a materialized record: id plus every field that has a value.
type Entity map[string]json.RawMessage

// List materializes all entities of one kind for a user, including soft-deleted ones
// when includeDeleted is set. Results are ordered by position, then created_at.
func (s *Service) List(ctx context.Context, userID, entity string, includeDeleted bool) ([]Entity, error) {
	if _, ok := Schema[entity]; !ok {
		return nil, fmt.Errorf("%w: unknown entity %q", ErrInvalidOp, entity)
	}
	rows, err := s.db.QueryContext(ctx, `SELECT entity_id,field,value FROM fields WHERE user_id = ? AND entity = ? ORDER BY entity_id`, userID, entity)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	byID := map[string]Entity{}
	order := []string{}
	for rows.Next() {
		var id, field, value string
		if err := rows.Scan(&id, &field, &value); err != nil {
			return nil, err
		}
		e, ok := byID[id]
		if !ok {
			e = Entity{"id": json.RawMessage(fmt.Sprintf("%q", id))}
			byID[id] = e
			order = append(order, id)
		}
		e[field] = json.RawMessage(value)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := make([]Entity, 0, len(order))
	for _, id := range order {
		e := byID[id]
		if !includeDeleted && e.deleted() {
			continue
		}
		out = append(out, e)
	}
	sort.SliceStable(out, func(i, j int) bool {
		pi, pj := out[i].number("position"), out[j].number("position")
		if pi != pj {
			return pi < pj
		}
		return out[i].number("created_at") < out[j].number("created_at")
	})
	return out, nil
}

// Get materializes one entity or returns nil when it does not exist.
func (s *Service) Get(ctx context.Context, userID, entity, id string) (Entity, error) {
	if _, ok := Schema[entity]; !ok {
		return nil, fmt.Errorf("%w: unknown entity %q", ErrInvalidOp, entity)
	}
	rows, err := s.db.QueryContext(ctx, `SELECT field,value FROM fields WHERE user_id = ? AND entity = ? AND entity_id = ?`, userID, entity, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var e Entity
	for rows.Next() {
		var field, value string
		if err := rows.Scan(&field, &value); err != nil {
			return nil, err
		}
		if e == nil {
			e = Entity{"id": json.RawMessage(fmt.Sprintf("%q", id))}
		}
		e[field] = json.RawMessage(value)
	}
	return e, rows.Err()
}

func (e Entity) deleted() bool {
	v, ok := e["deleted_at"]
	return ok && string(v) != "null"
}

// Deleted reports whether the entity carries a tombstone.
func (e Entity) Deleted() bool { return e.deleted() }

func (e Entity) number(field string) float64 {
	var f float64
	if v, ok := e[field]; ok {
		_ = json.Unmarshal(v, &f)
	}
	return f
}
