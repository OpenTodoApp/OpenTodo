package sync

import (
	"cmp"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"slices"
	"strconv"
	"time"
)

// Compaction of superseded note history (OpenSpec `op-log-compaction`): every
// save of a note writes a full document, so the log keeps every old copy. The
// pass below deletes the ones no device can still need, in every scope.

// CompactField is one field whose superseded values compaction deletes.
type CompactField struct {
	Entity, Field string
	// Daily keeps the last superseded value of each UTC day of its timestamp
	// (a note's readable revision in History); otherwise every superseded value
	// past the grace window goes.
	Daily bool
	// Family makes Field a prefix: every field of the family (`appends.<id>`).
	Family bool
}

// CompactFields is the table of fields compaction touches: each mergeable
// document field (DocFields) and the description that is its readable
// projection. An entity that gains a document field adds its two rows here
// (TestCompactFieldsCoverDocFields checks every DocFields entry is listed).
// A new device's first pull leaves out their superseded values too
// (PullOptions.LatestDocs).
var CompactFields = []CompactField{
	{Entity: "task", Field: "notes_doc"},
	{Entity: "task", Field: "description", Daily: true},
	{Entity: "project", Field: "notes_doc"},
	{Entity: "project", Field: "description", Daily: true},
	{Entity: "note", Field: "notes_doc"},
	{Entity: "note", Field: "description", Daily: true},
	// A pending append (notes-overview D13) is superseded by the "" a device
	// writes once the text is in the document, which carries it from then on.
	{Entity: "task", Field: AppendPrefix, Family: true},
	{Entity: "note", Field: AppendPrefix, Family: true},
}

// CompactGrace is how long after the server received it a superseded value
// stays in the log (design D2): long enough for every device in use to pull and
// merge it. It counts from receipt, never from the author's timestamp.
const CompactGrace = 30 * 24 * time.Hour

// Work sizes of a pass (OpenSpec change notes-compaction-at-scale D1, D2).
const (
	// compactWindow is how many sequence numbers one listing of fields covers.
	compactWindow = 8192
	// compactSlice is how many ops one DELETE statement removes.
	compactSlice = 16
	// compactHold is how long one writer transaction may delete before it
	// commits and lets waiting writes in: a push waits about this long at most.
	compactHold = 20 * time.Millisecond
	// compactTxOps bounds the ops one transaction deletes, so its commit (the
	// pages it changed) stays small too.
	compactTxOps = 64
)

// supersededSQL holds for an op o (ops) in its scope s (op_scopes) that is not
// the current winner of its field there. The encryption purge uses it.
const supersededSQL = `NOT EXISTS (SELECT 1 FROM scope_fields f WHERE f.scope_id = s.scope_id AND f.entity = o.entity
			AND f.entity_id = o.entity_id AND f.field = o.field AND f.ts = o.ts AND f.device = o.device)`

// CompactResult is what one CompactNotes call did.
type CompactResult struct {
	OpsRemoved        int
	ValueBytesRemoved int64
	// Next is the mark the next call resumes from (a sequence number, as
	// text); "" once the pass reached the start of the log.
	Next string
	// More is true when the time budget ran out before the end of the pass.
	More bool
}

// compactGroup is one field of one entity in one scope, the unit compaction
// plans: all its ops are read (never their values) and its winner kept.
type compactGroup struct {
	scope, entity, entityID, field string
	daily                          bool
}

func compactDaily(entity, field string) bool {
	for _, f := range CompactFields {
		if f.Daily && f.Entity == entity && f.Field == field {
			return true
		}
	}
	return false
}

// CompactNotes deletes superseded values of CompactFields that the server
// received more than CompactGrace before now, in every scope (op-log-compaction
// D1, D3; notes-compaction-at-scale D1, D2). It walks the log from its newest
// op back to its first, in windows of sequence numbers below the mark after
// ("" for the head of the log): newest first, because the newest rows sit at
// the end of the file, which incremental vacuum returns to the file system.
// For each field with ops in a window it reads all the field's ops on the
// reader without their values and picks what to delete; the writer then
// deletes in transactions of at most about compactHold, each checking the plan
// first, so an op that became the winner (or lost its day's later revision)
// meanwhile stays. It stops once budget has passed, reporting More and the
// mark to resume from. The current winner of a field is never deleted.
// Sequence numbers are never reused, so every cursor stays valid.
func (s *Service) CompactNotes(ctx context.Context, now time.Time, after string, budget time.Duration) (CompactResult, error) {
	start := time.Now()
	cutoff := now.Add(-CompactGrace).UnixMilli()
	res := CompactResult{Next: after}
	hi, err := strconv.ParseInt(after, 10, 64)
	if err != nil || hi <= 0 {
		if err := s.reader().QueryRowContext(ctx, `SELECT COALESCE(MAX(seq), 0) + 1 FROM ops`).Scan(&hi); err != nil {
			return res, fmt.Errorf("compaction: head of the log: %w", err)
		}
	}
	window := int64(compactWindow)
	if s.compactChunk > 0 {
		window = int64(s.compactChunk)
	}
	for hi > 1 {
		lo := max(hi-window, 1)
		groups, err := s.compactGroups(ctx, lo, hi)
		if err != nil {
			return res, err
		}
		for _, g := range groups {
			cands, err := compactPlan(ctx, s.reader(), g, cutoff)
			if err != nil {
				return res, err
			}
			done := true
			if len(cands) > 0 {
				if done, err = s.compactDelete(ctx, g, cands, start, budget, &res); err != nil {
					return res, err
				}
			}
			if !done {
				// The budget ran out inside this window: the next call lists it again.
				res.Next, res.More = strconv.FormatInt(hi, 10), true
				return res, nil
			}
		}
		hi = lo
		if hi > 1 && (time.Since(start) >= budget || ctx.Err() != nil) {
			res.Next, res.More = strconv.FormatInt(hi, 10), true
			return res, nil
		}
	}
	res.Next = ""
	return res, nil
}

// SetCompactChunk makes compaction delete at most n ops per transaction and
// list the fields of n sequence numbers at a time; tests only (a pass then
// spans several transactions and runs).
func (s *Service) SetCompactChunk(n int) { s.compactChunk = n }

// compactGroups lists, on the reader, the fields of CompactFields (per scope)
// that have an op with a sequence number in [lo, hi).
func (s *Service) compactGroups(ctx context.Context, lo, hi int64) ([]compactGroup, error) {
	rows, err := s.reader().QueryContext(ctx, `SELECT DISTINCT s.scope_id, o.entity, o.entity_id, o.field
		FROM ops o JOIN op_scopes s ON s.seq = o.seq
		WHERE o.seq >= ? AND o.seq < ? AND `+docFieldsSQL(), lo, hi)
	if err != nil {
		return nil, fmt.Errorf("compaction: list fields: %w", err)
	}
	defer rows.Close()
	var out []compactGroup
	for rows.Next() {
		var g compactGroup
		if err := rows.Scan(&g.scope, &g.entity, &g.entityID, &g.field); err != nil {
			return nil, err
		}
		g.daily = compactDaily(g.entity, g.field)
		out = append(out, g)
	}
	return out, rows.Err()
}

// fieldOp is what planning reads of an op: never its value.
type fieldOp struct {
	seq, ts, received int64
	device            string
}

// later reports whether a orders after b by (ts, device, seq).
func (a fieldOp) later(b fieldOp) bool {
	if a.ts != b.ts {
		return a.ts > b.ts
	}
	if a.device != b.device {
		return a.device > b.device
	}
	return a.seq > b.seq
}

// fieldOps reads the ops of one field of one entity in one scope, without
// their values: ts, device and received_at follow the value in the row, and
// with the database's pointer map (incremental vacuum) SQLite reaches them
// without reading the value's overflow pages.
func fieldOps(ctx context.Context, q querier, scope, entity, entityID, field string) ([]fieldOp, error) {
	rows, err := q.QueryContext(ctx, `SELECT o.seq, o.ts, o.device, o.received_at FROM ops o JOIN op_scopes s ON s.seq = o.seq
		WHERE o.entity_id = ? AND o.entity = ? AND o.field = ? AND s.scope_id = ?`, entityID, entity, field, scope)
	if err != nil {
		return nil, fmt.Errorf("read field ops: %w", err)
	}
	defer rows.Close()
	var ops []fieldOp
	for rows.Next() {
		var o fieldOp
		if err := rows.Scan(&o.seq, &o.ts, &o.device, &o.received); err != nil {
			return nil, err
		}
		ops = append(ops, o)
	}
	return ops, rows.Err()
}

// fieldWinner is the (ts, device) of a field's winner in a scope; ok is false
// when the field has none.
func fieldWinner(ctx context.Context, q querier, scope, entity, entityID, field string) (int64, string, bool, error) {
	var ts int64
	var device string
	err := q.QueryRowContext(ctx, `SELECT ts, device FROM scope_fields WHERE scope_id = ? AND entity = ? AND entity_id = ? AND field = ?`,
		scope, entity, entityID, field).Scan(&ts, &device)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, "", false, nil
	}
	if err != nil {
		return 0, "", false, fmt.Errorf("read winner: %w", err)
	}
	return ts, device, true, nil
}

// compactCand is an op planned for deletion with what its deletion relies on.
type compactCand struct {
	seq, ts int64
	device  string
	// keeper, for a daily field, is the later revision of the same UTC day
	// that makes this one deletable (0 otherwise).
	keeper int64
}

// compactPlan returns the ops of g to delete, in sequence order: superseded
// (not the winner's ts and device), received before cutoff and, for a daily
// field, not the greatest (ts, device, seq) of its UTC day (op-log-compaction
// D3). A field without a winner row is left alone.
func compactPlan(ctx context.Context, q querier, g compactGroup, cutoff int64) ([]compactCand, error) {
	wts, wdev, ok, err := fieldWinner(ctx, q, g.scope, g.entity, g.entityID, g.field)
	if err != nil || !ok {
		return nil, err
	}
	ops, err := fieldOps(ctx, q, g.scope, g.entity, g.entityID, g.field)
	if err != nil || len(ops) < 2 {
		return nil, err
	}
	const dayMs = 86400000
	last := map[int64]fieldOp{}
	if g.daily {
		for _, o := range ops {
			if l, ok := last[o.ts/dayMs]; !ok || o.later(l) {
				last[o.ts/dayMs] = o
			}
		}
	}
	var out []compactCand
	for _, o := range ops {
		if (o.ts == wts && o.device == wdev) || o.received >= cutoff {
			continue
		}
		c := compactCand{seq: o.seq, ts: o.ts, device: o.device}
		if g.daily {
			if c.keeper = last[o.ts/dayMs].seq; c.keeper == o.seq {
				continue
			}
		}
		out = append(out, c)
	}
	slices.SortFunc(out, func(a, b compactCand) int { return cmp.Compare(a.seq, b.seq) })
	return out, nil
}

// compactDelete deletes the planned ops of g on the writer, with their
// op_scopes rows, and tells the tenant quota. It reports false when the run's
// budget ran out before the field was done.
func (s *Service) compactDelete(ctx context.Context, g compactGroup, cands []compactCand, start time.Time, budget time.Duration, res *CompactResult) (bool, error) {
	slice, most, hold := compactSlice, compactTxOps, compactHold
	if s.compactChunk > 0 {
		slice, most, hold = s.compactChunk, s.compactChunk, 0 // tests: one slice per transaction
	}
	for len(cands) > 0 {
		part := cands[:min(most, len(cands))]
		n, bytes, done, err := s.compactTx(ctx, g, part, slice, hold)
		if err != nil {
			return false, err
		}
		res.OpsRemoved += n
		res.ValueBytesRemoved += bytes
		s.quotaRemoved(n)
		cands = cands[done:]
		if len(cands) > 0 && (time.Since(start) >= budget || ctx.Err() != nil) {
			return false, nil
		}
	}
	return true, nil
}

// compactTx is one writer transaction of compactDelete. It checks the plan
// against the database as it is now (each op still in g's scope, still not
// the winner, its day's keeper still there; ts, device and receipt never
// change), deletes what holds in slices until it has held the writer for
// hold, and returns what it deleted and how many of cands it dealt with.
func (s *Service) compactTx(ctx context.Context, g compactGroup, cands []compactCand, slice int, hold time.Duration) (int, int64, int, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, 0, 0, err
	}
	defer tx.Rollback()
	began := time.Now()
	wts, wdev, ok, err := fieldWinner(ctx, tx, g.scope, g.entity, g.entityID, g.field)
	if err != nil || !ok {
		return 0, 0, len(cands), err // no winner any more: leave the field alone
	}
	check := make([]any, 0, 2*len(cands))
	for _, c := range cands {
		check = append(check, c.seq)
		if c.keeper != 0 {
			check = append(check, c.keeper)
		}
	}
	present := map[int64]bool{}
	rows, err := tx.QueryContext(ctx, `SELECT seq FROM op_scopes WHERE scope_id = ? AND seq IN (`+placeholders(len(check))+`)`, append([]any{g.scope}, check...)...)
	if err != nil {
		return 0, 0, 0, fmt.Errorf("compaction: check: %w", err)
	}
	for rows.Next() {
		var q int64
		if err := rows.Scan(&q); err != nil {
			rows.Close()
			return 0, 0, 0, err
		}
		present[q] = true
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, 0, 0, err
	}
	var todo []any
	for _, c := range cands {
		if present[c.seq] && (c.ts != wts || c.device != wdev) && (c.keeper == 0 || present[c.keeper]) {
			todo = append(todo, c.seq)
		}
	}
	var n int
	var bytes int64
	done := len(cands)
	for len(todo) > 0 {
		part := todo[:min(slice, len(todo))]
		// octet_length takes the size from the record header, without reading the value.
		rows, err := tx.QueryContext(ctx, `DELETE FROM ops WHERE seq IN (`+placeholders(len(part))+`) RETURNING octet_length(value)`, part...)
		if err != nil {
			return 0, 0, 0, fmt.Errorf("compaction: delete: %w", err)
		}
		for rows.Next() {
			var b int64
			if err := rows.Scan(&b); err != nil {
				rows.Close()
				return 0, 0, 0, err
			}
			n++
			bytes += b
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return 0, 0, 0, err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM op_scopes WHERE seq IN (`+placeholders(len(part))+`)`, part...); err != nil {
			return 0, 0, 0, fmt.Errorf("compaction: delete scopes: %w", err)
		}
		todo = todo[len(part):]
		if len(todo) > 0 && time.Since(began) >= hold {
			// The candidates up to the last one deleted are dealt with.
			last := part[len(part)-1].(int64)
			done = slices.IndexFunc(cands, func(c compactCand) bool { return c.seq == last }) + 1
			break
		}
	}
	if err := tx.Commit(); err != nil {
		return 0, 0, 0, err
	}
	return n, bytes, done, nil
}

// QuotaRemover is implemented by a Quota that counts stored ops (a host's
// tenant limits): compaction tells it how many ops it removed, so the count
// goes down without reopening the tenant (design D8).
type QuotaRemover interface {
	Removed(n int)
}

func (s *Service) quotaRemoved(n int) {
	if r, ok := s.quota.(QuotaRemover); ok && n > 0 {
		r.Removed(n)
	}
}

// LastReceived is when the server last stored an op (Unix milliseconds; 0
// with an empty log): the compaction job's "quiet" test.
func (s *Service) LastReceived(ctx context.Context) (int64, error) {
	var at int64
	err := s.reader().QueryRowContext(ctx, `SELECT received_at FROM ops ORDER BY seq DESC LIMIT 1`).Scan(&at)
	if err == sql.ErrNoRows {
		return 0, nil
	}
	return at, err
}
