package sync

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"sort"
	"time"
)

// Service persists ops and materializes current field values.
type Service struct {
	db  *sql.DB
	now func() time.Time
}

// NewService wires a Service.
func NewService(db *sql.DB) *Service {
	return &Service{db: db, now: time.Now}
}

// ApplyResult summarizes an Apply call.
type ApplyResult struct {
	Applied    int `json:"applied"`
	Duplicates int `json:"duplicates"`
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
		_, err = tx.ExecContext(ctx, `INSERT INTO fields(user_id,entity,entity_id,field,value,ts,device) VALUES(?,?,?,?,?,?,?)
			ON CONFLICT(user_id,entity,entity_id,field) DO UPDATE SET value=excluded.value, ts=excluded.ts, device=excluded.device
			WHERE excluded.ts > fields.ts OR (excluded.ts = fields.ts AND excluded.device > fields.device)`,
			userID, op.Entity, op.EntityID, op.Field, string(op.Value), op.TS, op.Device)
		if err != nil {
			return res, err
		}
		res.Applied++
	}
	return res, tx.Commit()
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
